import type {
  AddressFields,
  AdminOrderDto,
  AdminOrderListQuery,
  AdminOrderRowDto,
  AdminReturnDto,
  Paginated,
  TrackingScanDto,
} from '@noors/shared';
import { adminOrderListQuerySchema } from '@noors/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { PaymentGateway } from '../../lib/payments.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { EmailOutbox } from '../notify/outbox.js';
import type { FulfilmentService } from '../shipping/fulfilment.service.js';
import type { OrderService } from '../store/orders.service.js';
import { audit } from './audit.js';

type Tx = Prisma.TransactionClient;

const IST_OFFSET = '+05:30';

const listInclude = {
  events: { select: { type: true } },
  shipments: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { status: true, attempts: true, nextAttemptAt: true },
  },
  returns: { select: { status: true } },
  refunds: { select: { status: true } },
  payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
  items: { select: { quantity: true } },
} satisfies Prisma.OrderInclude;
type OrderForRow = Prisma.OrderGetPayload<{ include: typeof listInclude }>;

const detailInclude = {
  customer: { select: { id: true, email: true, name: true } },
  items: { include: { variant: { select: { productId: true } } } },
  payments: { orderBy: { createdAt: 'asc' } },
  refunds: { orderBy: { createdAt: 'asc' } },
  shipments: { orderBy: { createdAt: 'desc' } },
  events: { orderBy: { createdAt: 'asc' }, include: { adminUser: { select: { name: true } } } },
  returns: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.OrderInclude;
type OrderForDetail = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;

/** What needs a person on an order, if anything. */
function attentionOf(o: {
  status: string;
  events: { type: string }[];
  shipments: { status: string; attempts: number; nextAttemptAt: Date | null }[];
  returns: { status: string }[];
  refunds: { status: string }[];
}): string | null {
  const types = new Set(o.events.map((e) => e.type));
  if (types.has('payment_needs_refund') && !o.refunds.some((r) => r.status !== 'FAILED')) {
    return 'Payment to refund';
  }
  if (types.has('payment_mismatch')) return 'Check payment amount';
  if (o.refunds.some((r) => r.status === 'FAILED')) return 'Refund failed';
  const shipment = o.shipments[0];
  if (
    o.status === 'PAID' &&
    shipment?.status === 'PENDING' &&
    !shipment.nextAttemptAt &&
    shipment.attempts > 0
  ) {
    return 'Shipment not booked';
  }
  if (shipment?.status === 'RTO') return 'Returning to us';
  if (o.returns.some((r) => r.status === 'REQUESTED')) return 'Return requested';
  return null;
}

/** Start of a day in Indian time. */
const istDay = (date: string, addDays = 0) =>
  new Date(new Date(`${date}T00:00:00${IST_OFFSET}`).getTime() + addDays * 86_400_000);

export function toOrderRow(o: OrderForRow): AdminOrderRowDto {
  const a = o.shippingAddress as unknown as AddressFields;
  return {
    number: o.number,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    placedAt: o.placedAt?.toISOString() ?? null,
    name: a.name,
    email: o.email,
    phone: o.phone,
    city: a.city,
    total: o.total,
    itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
    paymentMethod: o.paymentMethod,
    paymentStatus: o.payments[0]?.status ?? null,
    attention: attentionOf(o),
  };
}

export { listInclude as orderRowInclude };

/** Orders in the dashboard: finding them, and everything staff do to them. */
export class AdminOrderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orders: OrderService,
    private readonly gateway: PaymentGateway,
    private readonly fulfilment: FulfilmentService,
    private readonly outbox: EmailOutbox,
  ) {}

  async list(input: AdminOrderListQuery): Promise<Paginated<AdminOrderRowDto>> {
    const { q, status, payment, from, to, page, limit } = adminOrderListQuerySchema.parse(input);
    const and: Prisma.OrderWhereInput[] = [];
    if (status === 'OPEN') and.push({ status: { not: 'PENDING_PAYMENT' } });
    else if (status === 'TO_SHIP') and.push({ status: { in: ['PAID', 'READY_TO_SHIP'] } });
    else if (status !== 'ALL') and.push({ status });
    if (payment) and.push({ paymentMethod: payment });
    if (from) and.push({ createdAt: { gte: istDay(from) } });
    if (to) and.push({ createdAt: { lt: istDay(to, 1) } });
    if (q) {
      const digits = q.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
      and.push({
        OR: [
          { number: { contains: q.toUpperCase() } },
          { email: { contains: q, mode: 'insensitive' } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }
    const where: Prisma.OrderWhereInput = { AND: and };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: listInclude,
      }),
    ]);
    return {
      items: rows.map(toOrderRow),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async get(number: string): Promise<AdminOrderDto> {
    return toDetail(await this.load(this.prisma, number));
  }

  async addNote(number: string, message: string, adminId: string) {
    const order = await this.load(this.prisma, number);
    await this.prisma.orderEvent.create({
      data: { orderId: order.id, type: 'note', message, adminUserId: adminId },
    });
    return this.get(number);
  }

  /** Books (or re-tries booking) with Shiprocket now, and waits for the result. */
  async book(number: string, adminId: string): Promise<AdminOrderDto> {
    const order = await this.load(this.prisma, number);
    if (order.status !== 'PAID') {
      throw new HttpError(
        409,
        'Only confirmed orders that are not packed yet can be booked',
        'invalid_state',
      );
    }
    const queued = await this.prisma.$transaction(async (tx) => {
      const ok = await this.fulfilment.requestBooking(tx, order.id);
      if (ok) await audit(tx, adminId, 'book_shipment', 'order', order.id);
      return ok;
    });
    if (!queued) throw new HttpError(409, 'This order already has a shipment', 'invalid_state');
    await this.fulfilment.bookDue();
    return this.get(number);
  }

  /** Records a shipment booked outside the dashboard and marks the order shipped. */
  async markShipped(
    number: string,
    input: { courier: string; awb: string; trackingUrl: string | null },
    adminId: string,
  ): Promise<AdminOrderDto> {
    const order = await this.load(this.prisma, number);
    if (order.status !== 'PAID' && order.status !== 'READY_TO_SHIP') {
      throw new HttpError(
        409,
        'Only orders waiting to ship can be marked shipped',
        'invalid_state',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const live = order.shipments.find((s) => s.status !== 'CANCELLED');
      const data = {
        courier: input.courier,
        awb: input.awb,
        trackingUrl: input.trackingUrl,
        status: 'IN_TRANSIT' as const,
        nextAttemptAt: null,
        lastError: null,
      };
      if (live) await tx.shipment.update({ where: { id: live.id }, data });
      else await tx.shipment.create({ data: { orderId: order.id, ...data } });
      await this.fulfilment.advanceOrder(
        tx,
        order.id,
        'SHIPPED',
        `Shipped with ${input.courier} (AWB ${input.awb})`,
        adminId,
      );
      await audit(tx, adminId, 'mark_shipped', 'order', order.id, input);
    });
    this.outbox.kick();
    return this.get(number);
  }

  async markDelivered(number: string, adminId: string): Promise<AdminOrderDto> {
    const order = await this.load(this.prisma, number);
    await this.prisma.$transaction(async (tx) => {
      const moved = await this.fulfilment.advanceOrder(
        tx,
        order.id,
        'DELIVERED',
        'Marked delivered',
        adminId,
      );
      if (!moved)
        throw new HttpError(409, 'This order cannot be marked delivered', 'invalid_state');
      await tx.shipment.updateMany({
        where: { orderId: order.id, status: { notIn: ['CANCELLED', 'RTO'] } },
        data: { status: 'DELIVERED', nextAttemptAt: null },
      });
      await audit(tx, adminId, 'mark_delivered', 'order', order.id);
    });
    this.outbox.kick();
    return this.get(number);
  }

  /**
   * Cancels an order that hasn't left yet: cancels its Shiprocket booking, puts the items
   * back on sale, and refunds what was paid. The shopper is emailed.
   */
  async cancel(
    number: string,
    input: { reason: string; refund: boolean; restock: boolean },
    adminId: string,
  ): Promise<AdminOrderDto> {
    const order = await this.load(this.prisma, number);
    if (order.status === 'PENDING_PAYMENT') {
      await this.orders.cancel(order.id, 'cancelled', `Cancelled: ${input.reason}`);
      await audit(this.prisma, adminId, 'cancel', 'order', order.id, { reason: input.reason });
      return this.get(number);
    }
    if (order.status !== 'PAID' && order.status !== 'READY_TO_SHIP') {
      throw new HttpError(
        409,
        'This order is already with the courier. Wait for it to come back, or handle it as a return.',
        'invalid_state',
      );
    }
    for (const shipment of order.shipments.filter((s) => s.status !== 'CANCELLED')) {
      try {
        await this.fulfilment.cancelShipment(shipment.id);
      } catch (err) {
        logger.warn({ err, order: number }, 'Shipment could not be cancelled');
        throw new HttpError(
          502,
          `Shiprocket did not cancel the shipment (${err instanceof Error ? err.message : 'error'}). Cancel it in the Shiprocket panel, then try again.`,
          'shipping_error',
        );
      }
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: { in: ['PAID', 'READY_TO_SHIP'] } },
        data: { status: 'CANCELLED' },
      });
      if (!moved.count) return false;
      if (input.restock) await restock(tx, order.items, order.id, adminId, 'cancelled');
      if (order.couponId) {
        await tx.$executeRaw`
          UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = ${order.couponId}`;
      }
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'cancelled',
          message: `Cancelled: ${input.reason}`,
          adminUserId: adminId,
        },
      });
      await audit(tx, adminId, 'cancel', 'order', order.id, input);
      return true;
    });
    if (!cancelled)
      throw new HttpError(409, 'The order changed meanwhile; reload it', 'invalid_state');

    let refunded = 0;
    const refundable = refundableOf(order);
    if (input.refund && refundable > 0) {
      try {
        await this.issueRefund(
          order.id,
          refundable,
          `Order cancelled: ${input.reason}`,
          adminId,
          false,
        );
        refunded = refundable;
      } catch (err) {
        // Recorded on the order as a failed refund; the cancellation stands.
        logger.error({ err, order: number }, 'Refund on cancellation failed');
      }
    }
    await this.prisma.$transaction((tx) =>
      this.outbox.queueForOrder(tx, 'order_cancelled', order.id, { amount: refunded }),
    );
    this.outbox.kick();
    return this.get(number);
  }

  /** Refunds part or all of what was paid online, through Razorpay. */
  async refund(number: string, amount: number, reason: string, adminId: string) {
    const order = await this.load(this.prisma, number);
    await this.issueRefund(order.id, amount, reason, adminId, true);
    return this.get(number);
  }

  /**
   * Records the refund first (so two clicks can't both refund), then asks Razorpay, then
   * settles the record with Razorpay's answer.
   */
  async issueRefund(
    orderId: string,
    amount: number,
    reason: string,
    adminId: string,
    email: boolean,
  ): Promise<void> {
    const { refund, paymentId } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { payments: true, refunds: true },
      });
      const payment = order.payments.find(
        (p) =>
          p.provider === 'RAZORPAY' &&
          p.razorpayPaymentId &&
          ['CAPTURED', 'PARTIALLY_REFUNDED'].includes(p.status),
      );
      if (!payment) {
        throw new HttpError(
          400,
          order.paymentMethod === 'COD'
            ? 'Cash-on-delivery orders are refunded outside the store, by bank transfer or UPI'
            : 'There is no online payment on this order to refund',
          'nothing_to_refund',
        );
      }
      const left = refundableOf(order);
      if (amount > left) {
        throw new HttpError(
          400,
          `At most ₹${(left / 100).toLocaleString('en-IN')} can be refunded`,
          'too_much',
        );
      }
      const created = await tx.refund.create({
        data: { orderId, paymentId: payment.id, amount, reason },
      });
      return { refund: created, paymentId: payment.razorpayPaymentId! };
    });

    let result: { id: string; status: 'processed' | 'pending' };
    try {
      result = await this.gateway.refund(paymentId, amount, { reason: reason.slice(0, 250) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.$transaction([
        this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } }),
        this.prisma.orderEvent.create({
          data: {
            orderId,
            type: 'refund_failed',
            message: `Refund of ₹${amount / 100} failed: ${message.slice(0, 300)}`,
            adminUserId: adminId,
          },
        }),
      ]);
      throw new HttpError(
        502,
        `Razorpay did not take the refund: ${message.slice(0, 200)}`,
        'refund_failed',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.refund.update({
        where: { id: refund.id },
        data: {
          razorpayRefundId: result.id,
          status: result.status === 'processed' ? 'PROCESSED' : 'PENDING',
        },
      });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { payments: true, refunds: true },
      });
      const payment = order.payments.find((p) => p.id === refund.paymentId)!;
      const refundedOnPayment = order.refunds
        .filter((r) => r.paymentId === payment.id && r.status !== 'FAILED')
        .reduce((sum, r) => sum + r.amount, 0);
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: refundedOnPayment >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'refunded',
          message: `Refunded ₹${(amount / 100).toLocaleString('en-IN')}: ${reason}`,
          adminUserId: adminId,
        },
      });
      await audit(tx, adminId, 'refund', 'order', orderId, { amount, reason });
      if (email) {
        await this.outbox.queueForOrder(tx, 'refund_issued', orderId, { amount, key: refund.id });
      }
    });
    this.outbox.kick();
  }

  private async load(db: PrismaClient | Tx, number: string): Promise<OrderForDetail> {
    const order = await db.order.findUnique({
      where: { number: number.toUpperCase() },
      include: detailInclude,
    });
    if (!order) throw new HttpError(404, 'Order not found', 'not_found');
    return order;
  }
}

/** Puts order items back in stock and logs it. */
export async function restock(
  tx: Tx,
  items: { variantId: string | null; quantity: number }[],
  orderId: string,
  adminId: string | null,
  reason: string,
) {
  for (const item of items) {
    if (!item.variantId || item.quantity <= 0) continue;
    await tx.$executeRaw`
      UPDATE variants SET stock = stock + ${item.quantity}, updated_at = now()
      WHERE id = ${item.variantId}`;
    await tx.inventoryLog.create({
      data: {
        variantId: item.variantId,
        change: item.quantity,
        reason,
        orderId,
        adminUserId: adminId,
      },
    });
  }
}

/** Paid online and not refunded yet. */
function refundableOf(o: {
  payments: {
    provider: string;
    status: string;
    amount: number;
    razorpayPaymentId: string | null;
  }[];
  refunds: { status: string; amount: number }[];
}): number {
  const paid = o.payments
    .filter(
      (p) =>
        p.provider === 'RAZORPAY' &&
        p.razorpayPaymentId &&
        ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status),
    )
    .reduce((sum, p) => sum + p.amount, 0);
  const refunded = o.refunds
    .filter((r) => r.status !== 'FAILED')
    .reduce((sum, r) => sum + r.amount, 0);
  return Math.max(paid - refunded, 0);
}

export function toAdminReturn(
  r: {
    id: string;
    type: 'RETURN' | 'EXCHANGE';
    status: AdminReturnDto['status'];
    reason: string;
    items: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  },
  order: {
    number: string;
    email: string;
    shippingAddress: Prisma.JsonValue;
    items: {
      id: string;
      productName: string;
      variantTitle: string;
      sku: string;
      imageUrl: string | null;
      unitPrice: number;
    }[];
  },
): AdminReturnDto {
  const lines = (Array.isArray(r.items) ? r.items : []) as {
    orderItemId: string;
    quantity: number;
  }[];
  const items = lines.flatMap((l) => {
    const i = order.items.find((x) => x.id === l.orderItemId);
    return i
      ? [
          {
            orderItemId: i.id,
            name: i.productName,
            title: i.variantTitle,
            sku: i.sku,
            image: i.imageUrl,
            unitPrice: i.unitPrice,
            quantity: l.quantity,
          },
        ]
      : [];
  });
  return {
    id: r.id,
    orderNumber: order.number,
    type: r.type,
    status: r.status,
    reason: r.reason,
    email: order.email,
    name: (order.shippingAddress as unknown as AddressFields).name,
    items,
    itemsValue: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toDetail(o: OrderForDetail): AdminOrderDto {
  const live = o.shipments.find((s) => s.status !== 'CANCELLED');
  const refundable = refundableOf(o);
  const waiting = o.status === 'PAID' || o.status === 'READY_TO_SHIP';
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    placedAt: o.placedAt?.toISOString() ?? null,
    email: o.email,
    phone: o.phone,
    notes: o.notes,
    customer: o.customer,
    items: o.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      productId: i.variant?.productId ?? null,
      name: i.productName,
      title: i.variantTitle,
      sku: i.sku,
      image: i.imageUrl,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      hsnCode: i.hsnCode,
    })),
    subtotal: o.subtotal,
    discount: o.discount,
    shippingFee: o.shippingFee,
    total: o.total,
    couponCode: o.couponCode,
    shippingAddress: o.shippingAddress as unknown as AddressFields,
    paymentMethod: o.paymentMethod,
    payments: o.payments.map((p) => ({
      id: p.id,
      provider: p.provider,
      status: p.status,
      amount: p.amount,
      razorpayPaymentId: p.razorpayPaymentId,
      method: p.method,
      createdAt: p.createdAt.toISOString(),
    })),
    refunds: o.refunds.map((r) => ({
      id: r.id,
      amount: r.amount,
      reason: r.reason,
      status: r.status,
      razorpayRefundId: r.razorpayRefundId,
      createdAt: r.createdAt.toISOString(),
    })),
    refundable,
    shipments: o.shipments.map((s) => ({
      id: s.id,
      status: s.status,
      courier: s.courier,
      awb: s.awb,
      trackingUrl: s.trackingUrl,
      labelUrl: s.labelUrl,
      estimatedDelivery: s.estimatedDelivery?.toISOString() ?? null,
      attempts: s.attempts,
      lastError: s.lastError,
      retrying: Boolean(s.nextAttemptAt) && (s.status === 'PENDING' || s.status === 'AWB_ASSIGNED'),
      scans: (Array.isArray(s.events) ? s.events : []) as unknown as TrackingScanDto[],
      createdAt: s.createdAt.toISOString(),
    })),
    events: o.events.map((e) => ({
      type: e.type,
      message: e.message,
      at: e.createdAt.toISOString(),
      by: e.adminUser?.name ?? null,
    })),
    returns: o.returns.map((r) => toAdminReturn(r, o)),
    can: {
      book:
        o.status === 'PAID' &&
        (!live ||
          ((live.status === 'PENDING' || live.status === 'AWB_ASSIGNED') && !live.nextAttemptAt)),
      markShipped: waiting,
      markDelivered: ['PAID', 'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status),
      cancel: waiting || o.status === 'PENDING_PAYMENT',
      refund: refundable > 0,
    },
  };
}
