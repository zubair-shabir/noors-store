import type {
  AdminReturnDto,
  Paginated,
  ReturnRequestInput,
  ReturnStatus,
  ReturnUpdateInput,
} from '@noors/shared';
import { adminReturnListQuerySchema, returnRequestSchema, returnUpdateSchema } from '@noors/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { audit } from '../admin/audit.js';
import { restock, toAdminReturn, type AdminOrderService } from '../admin/orders.service.js';
import type { EmailOutbox } from '../notify/outbox.js';
import type { EmailReturn } from '../notify/templates.js';
import { loadSetting } from '../settings/settings.service.js';
import { returnableUntil, returnItems } from './orders.service.js';

const NEXT: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['RECEIVED', 'COMPLETED', 'REJECTED'],
  RECEIVED: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
};

const orderForReturn = {
  items: true,
  events: { select: { type: true, createdAt: true } },
  returns: { select: { status: true } },
} satisfies Prisma.OrderInclude;

/** Returns and exchanges: shoppers ask, staff approve, receive and complete them. */
export class ReturnService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly outbox: EmailOutbox,
    private readonly adminOrders: AdminOrderService,
  ) {}

  /** A shopper asks to return or exchange items of a delivered order. */
  async request(orderId: string, input: ReturnRequestInput): Promise<void> {
    const { type, reason, items } = returnRequestSchema.parse(input);
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderForReturn,
    });
    const { windowDays } = await loadSetting(this.prisma, 'returns');
    if (!returnableUntil(order, windowDays)) {
      throw new HttpError(
        409,
        windowDays > 0
          ? `Returns can be asked for within ${windowDays} days of delivery, once per order`
          : 'This order cannot be returned online. Write to us and we will help.',
        'not_returnable',
      );
    }
    const merged = new Map<string, number>();
    for (const line of items) {
      const item = order.items.find((i) => i.id === line.orderItemId);
      if (!item) throw new HttpError(400, 'That item is not on this order', 'invalid_item');
      const quantity = (merged.get(item.id) ?? 0) + line.quantity;
      if (quantity > item.quantity) {
        throw new HttpError(
          400,
          `You ordered ${item.quantity} of ${item.productName}`,
          'invalid_item',
        );
      }
      merged.set(item.id, quantity);
    }
    const lines = [...merged].map(([orderItemId, quantity]) => ({ orderItemId, quantity }));

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.returnRequest.create({
        data: { orderId, type, reason, items: lines },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'return_requested',
          message: `${type === 'EXCHANGE' ? 'Exchange' : 'Return'} requested: ${reason}`,
        },
      });
      const email: EmailReturn = {
        type,
        status: 'REQUESTED',
        reason,
        items: returnItems(lines, order.items),
        note: null,
      };
      await this.outbox.queueForOrder(tx, 'return_update', orderId, {
        return: email,
        key: `${created.id}:REQUESTED`,
      });
      await this.outbox.queueForOrder(tx, 'return_requested', orderId, {
        return: email,
        key: created.id,
      });
    });
    this.outbox.kick();
  }

  async list(input: unknown): Promise<Paginated<AdminReturnDto>> {
    const { status, page, limit } = adminReturnListQuerySchema.parse(input);
    const where: Prisma.ReturnRequestWhereInput =
      status === 'ALL'
        ? {}
        : status === 'OPEN'
          ? { status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } }
          : { status };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { order: { include: { items: true } } },
      }),
    ]);
    return {
      items: rows.map((r) => toAdminReturn(r, r.order)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Moves a return along. Completing a return can put the items back in stock and refund
   * the shopper; each step emails them.
   */
  async update(id: string, input: ReturnUpdateInput, adminId: string): Promise<AdminReturnDto> {
    const { status, note, restock: putBack, refundAmount } = returnUpdateSchema.parse(input);
    const current = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { order: { include: { items: true } } },
    });
    if (!current) throw new HttpError(404, 'Return not found', 'not_found');
    if (!NEXT[current.status].includes(status)) {
      throw new HttpError(
        409,
        `A ${current.status.toLowerCase()} return cannot be marked ${status.toLowerCase()}`,
        'invalid_state',
      );
    }
    const order = current.order;
    const refunding = status === 'COMPLETED' && current.type === 'RETURN' && !!refundAmount;
    // Catch a refund that cannot work (cash on delivery, too much) before completing the return.
    if (refunding) await this.adminOrders.checkRefund(order.id, refundAmount);
    const lines = toAdminReturn(current, order).items;

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.returnRequest.updateMany({
        where: { id, status: current.status },
        data: { status },
      });
      if (!moved.count)
        throw new HttpError(409, 'The return changed meanwhile; reload it', 'invalid_state');
      if (status === 'COMPLETED') {
        if (putBack) {
          await restock(
            tx,
            lines.map((l) => ({
              variantId: order.items.find((i) => i.id === l.orderItemId)?.variantId ?? null,
              quantity: l.quantity,
            })),
            order.id,
            adminId,
            current.type === 'EXCHANGE' ? 'exchange' : 'return',
          );
        }
        if (current.type === 'RETURN') {
          await tx.order.updateMany({
            where: { id: order.id, status: 'DELIVERED' },
            data: { status: 'RETURNED' },
          });
        }
      }
      const kind = current.type === 'EXCHANGE' ? 'Exchange' : 'Return';
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: `return_${status.toLowerCase()}`,
          message: `${kind} ${status.toLowerCase()}${note ? `: ${note}` : ''}`,
          adminUserId: adminId,
        },
      });
      await audit(tx, adminId, `return_${status.toLowerCase()}`, 'return', id, { note });
      await this.outbox.queueForOrder(tx, 'return_update', order.id, {
        key: `${id}:${status}`,
        return: {
          type: current.type,
          status,
          reason: current.reason,
          items: lines,
          note,
        },
      });
    });

    if (refunding) {
      await this.adminOrders.issueRefund(
        order.id,
        refundAmount,
        `Return of ${lines.map((l) => `${l.name} (${l.title}) x ${l.quantity}`).join(', ')}`,
        adminId,
        true,
      );
    }
    this.outbox.kick();
    const updated = await this.prisma.returnRequest.findUniqueOrThrow({
      where: { id },
      include: { order: { include: { items: true } } },
    });
    return toAdminReturn(updated, updated.order);
  }
}
