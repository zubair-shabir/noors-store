import { randomBytes } from 'node:crypto';
import type {
  AddressFields,
  CheckoutResultDto,
  CustomerDto,
  OrderDto,
  OrderSummaryDto,
  ShipmentDto,
  TimelineEntryDto,
  TrackingDto,
  TrackingScanDto,
} from '@noors/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { PaymentGateway } from '../../lib/payments.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { EmailOutbox } from '../notify/outbox.js';
import type { FulfilmentService } from '../shipping/fulfilment.service.js';
import {
  hashToken,
  lineOf,
  variantImage,
  variantTitle,
  type CartOwner,
  type CartService,
} from './cart.service.js';
import { loadSetting } from '../settings/settings.service.js';
import { couponDiscount, couponProblem, shippingSettings, totals } from './pricing.js';

/** How long stock is held for an unpaid order. */
export const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

type Tx = Prisma.TransactionClient;

const orderInclude = {
  items: { include: { variant: { select: { product: { select: { slug: true } } } } } },
  shipments: { where: { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 1 },
  events: { orderBy: { createdAt: 'asc' }, select: { type: true, createdAt: true } },
  returns: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;
type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Order events customers see, and how they read. Everything else is for the brand only. */
const TIMELINE_LABELS: Record<string, string> = {
  created: 'Order placed',
  paid: 'Payment received',
  cod_confirmed: 'Order confirmed (cash on delivery)',
  late_payment: 'Payment received',
  packed: 'Packed and handed to the courier',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  expired: 'Cancelled: not paid in time',
  abandoned: 'Cancelled',
  payment_setup_failed: 'Cancelled',
  cancelled: 'Cancelled',
  refunded: 'Refund issued',
};

export interface CheckoutRequest {
  email: string;
  address: AddressFields;
  saveAddress: boolean;
  notes: string | null;
  paymentMethod?: 'RAZORPAY' | 'COD';
}

export interface PaymentConfirmation {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  method?: string | null;
  raw?: Prisma.InputJsonValue;
  source: 'checkout' | 'webhook';
}

export class OrderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly carts: CartService,
    private readonly gateway: PaymentGateway,
    private readonly outbox: EmailOutbox,
    private readonly fulfilment: FulfilmentService,
  ) {}

  /**
   * Turns the cart into an order awaiting payment: re-prices everything on the server,
   * holds the stock (and the coupon use) for PAYMENT_WINDOW_MS, and opens a Razorpay order.
   */
  async checkout(
    owner: CartOwner,
    customer: CustomerDto | null,
    input: CheckoutRequest,
  ): Promise<CheckoutResultDto> {
    const cart = await this.carts.find(owner);
    if (!cart?.items.length) throw new HttpError(400, 'Your bag is empty', 'empty_cart');
    const lines = cart.items.map((item) => ({ item, line: lineOf(item) }));
    if (lines.some((l) => l.line.issue)) {
      throw new HttpError(
        409,
        'Some items in your bag have changed. Check your bag and try again.',
        'cart_changed',
      );
    }

    const subtotal = lines.reduce((sum, l) => sum + l.line.lineTotal, 0);
    const coupon = cart.couponCode
      ? await this.prisma.coupon.findUnique({ where: { code: cart.couponCode } })
      : null;
    if (cart.couponCode) {
      const hasOrdered = await this.carts.hasOrdered({
        customerId: customer?.id,
        email: input.email,
      });
      const problem = couponProblem(coupon, { subtotal, hasOrdered });
      if (problem) throw new HttpError(409, problem, 'coupon_invalid');
    }
    const discount = coupon ? couponDiscount(coupon, subtotal) : 0;
    const amounts = totals(subtotal, discount, await shippingSettings(this.prisma));
    const cod = input.paymentMethod === 'COD';
    if (cod) {
      const settings = await loadSetting(this.prisma, 'cod');
      if (!settings.enabled) {
        throw new HttpError(400, 'Cash on delivery is not available', 'cod_unavailable');
      }
      // The COD charge rides on the shipping line.
      amounts.shippingFee += settings.fee;
      amounts.total += settings.fee;
    }
    if (amounts.total < 100) {
      throw new HttpError(400, 'The order total must be at least ₹1', 'total_too_low');
    }

    if (!(await this.fulfilment.canDeliver(input.address.pincode))) {
      const message = "We can't deliver to this pincode yet";
      throw new HttpError(422, message, 'not_serviceable', [
        { path: ['address', 'pincode'], message },
      ]);
    }

    const accessToken = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_MS);

    const order = await this.prisma.$transaction(async (tx) => {
      for (const { item, line } of lines) {
        // Conditional update: two shoppers can't both take the last unit. Online orders hold
        // the stock until paid; cash-on-delivery orders take it straight away.
        const held = cod
          ? await tx.$executeRaw`
          UPDATE variants SET stock = stock - ${item.quantity}, updated_at = now()
          WHERE id = ${item.variantId} AND is_active AND stock - reserved >= ${item.quantity}`
          : await tx.$executeRaw`
          UPDATE variants SET reserved = reserved + ${item.quantity}, updated_at = now()
          WHERE id = ${item.variantId} AND is_active AND stock - reserved >= ${item.quantity}`;
        if (held === 0) {
          throw new HttpError(
            409,
            `${line.name} (${line.title}) just sold out. Check your bag and try again.`,
            'sold_out',
          );
        }
      }
      if (coupon) {
        const used = await tx.$executeRaw`
          UPDATE coupons SET used_count = used_count + 1, updated_at = now()
          WHERE id = ${coupon.id} AND (usage_limit IS NULL OR used_count < usage_limit)`;
        if (used === 0) throw new HttpError(409, 'This code has been fully used', 'coupon_invalid');
      }

      if (customer) await this.rememberCustomerDetails(tx, customer, input);

      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
      const created = await tx.order.create({
        data: {
          number: `NR-${n}`,
          customerId: customer?.id ?? null,
          email: input.email,
          phone: input.address.phone,
          paymentMethod: cod ? 'COD' : 'RAZORPAY',
          status: cod ? 'PAID' : 'PENDING_PAYMENT',
          placedAt: cod ? new Date() : null,
          ...amounts,
          couponCode: coupon?.code ?? null,
          couponId: coupon?.id ?? null,
          shippingAddress: input.address,
          notes: input.notes,
          accessTokenHash: hashToken(accessToken),
          expiresAt: cod ? null : expiresAt,
          cartId: cart.id,
          items: {
            create: lines.map(({ item, line }) => ({
              variantId: item.variantId,
              productName: line.name,
              variantTitle: variantTitle(item),
              sku: item.variant.sku,
              imageUrl: variantImage(item),
              unitPrice: line.unitPrice,
              quantity: item.quantity,
              hsnCode: item.variant.product.hsnCode,
            })),
          },
          events: {
            create: cod
              ? [
                  { type: 'created', message: 'Order placed' },
                  { type: 'cod_confirmed', message: 'Confirmed for cash on delivery' },
                ]
              : [{ type: 'created', message: 'Order placed, waiting for payment' }],
          },
        },
        include: { items: true },
      });
      if (cod) {
        await tx.payment.create({
          data: { orderId: created.id, provider: 'COD', amount: created.total },
        });
        await tx.inventoryLog.createMany({
          data: created.items.flatMap((i) =>
            i.variantId
              ? [
                  {
                    variantId: i.variantId,
                    change: -i.quantity,
                    reason: 'order',
                    orderId: created.id,
                  },
                ]
              : [],
          ),
        });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
        await this.outbox.queueForOrder(tx, 'order_confirmed', created.id);
        await this.outbox.queueForOrder(tx, 'new_order_alert', created.id);
        await this.fulfilment.queueBooking(tx, created.id);
      }
      return created;
    });

    if (cod) {
      this.outbox.kick();
      this.fulfilment.kick();
      return { orderNumber: order.number, accessToken, expiresAt: null, payment: null };
    }

    let razorpayOrderId: string;
    try {
      ({ id: razorpayOrderId } = await this.gateway.createOrder({
        amount: order.total,
        receipt: order.number,
        notes: { order_number: order.number },
      }));
    } catch (err) {
      logger.error({ err, order: order.number }, 'Could not create the Razorpay order');
      await this.cancel(order.id, 'payment_setup_failed', 'Payment could not be started');
      throw new HttpError(
        502,
        'Payments are not available right now. Please try again.',
        'payment_unavailable',
      );
    }
    await this.prisma.payment.create({
      data: { orderId: order.id, provider: 'RAZORPAY', amount: order.total, razorpayOrderId },
    });

    return {
      orderNumber: order.number,
      accessToken,
      expiresAt: expiresAt.toISOString(),
      payment: {
        mode: this.gateway.mode,
        keyId: this.gateway.keyId,
        razorpayOrderId,
        amount: order.total,
        currency: 'INR',
        prefill: { name: input.address.name, email: input.email, contact: input.address.phone },
      },
    };
  }

  /** Checks the signature Razorpay Checkout returned, then confirms the order. */
  async verifyPayment(input: {
    orderNumber: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<OrderDto> {
    const valid = this.gateway.verifyPayment(
      input.razorpayOrderId,
      input.razorpayPaymentId,
      input.razorpaySignature,
    );
    if (!valid) throw new HttpError(400, 'We could not verify this payment', 'invalid_signature');
    const payment = await this.prisma.payment.findUnique({
      where: { razorpayOrderId: input.razorpayOrderId },
      include: { order: { select: { number: true } } },
    });
    if (!payment || payment.order.number !== input.orderNumber) {
      throw new HttpError(404, 'Order not found', 'not_found');
    }
    await this.markPaid({
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      source: 'checkout',
    });
    return this.present(await this.load({ number: input.orderNumber }));
  }

  /**
   * Records a captured payment and confirms its order: stock moves from held to sold and
   * the cart empties. Safe to call twice (the checkout page and the webhook both do).
   * A payment for an order that already expired still confirms it when the stock is there;
   * otherwise the order stays cancelled and is flagged for a refund.
   */
  async markPaid(p: PaymentConfirmation): Promise<void> {
    const confirmed = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { razorpayOrderId: p.razorpayOrderId },
      });
      if (!payment) throw new HttpError(404, 'Payment not found', 'not_found');
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${payment.orderId} FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        include: { items: true },
      });

      if (payment.status !== 'CAPTURED') {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'CAPTURED',
            razorpayPaymentId: p.razorpayPaymentId,
            method: p.method ?? undefined,
            raw: p.raw,
          },
        });
      }

      if (order.status === 'PENDING_PAYMENT') {
        for (const item of order.items) {
          if (!item.variantId) continue;
          await tx.$executeRaw`
            UPDATE variants
            SET stock = GREATEST(stock - ${item.quantity}, 0),
                reserved = GREATEST(reserved - ${item.quantity}, 0),
                updated_at = now()
            WHERE id = ${item.variantId}`;
        }
      } else if (order.status === 'CANCELLED' && !order.placedAt) {
        if (!(await this.takeStockDirectly(tx, order.items))) {
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'payment_needs_refund',
              message:
                'Payment arrived after the order expired and the items had sold out. Refund this payment.',
            },
          });
          return false;
        }
        if (order.couponId) {
          await tx.$executeRaw`
            UPDATE coupons SET used_count = used_count + 1
            WHERE id = ${order.couponId} AND (usage_limit IS NULL OR used_count < usage_limit)`;
        }
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            type: 'late_payment',
            message: 'Payment arrived after the order expired; the items were still in stock.',
          },
        });
      } else {
        // Already confirmed (the other of checkout and webhook got here first).
        return false;
      }

      await tx.inventoryLog.createMany({
        data: order.items.flatMap((i) =>
          i.variantId
            ? [{ variantId: i.variantId, change: -i.quantity, reason: 'order', orderId: order.id }]
            : [],
        ),
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PAID', placedAt: new Date(), expiresAt: null },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'paid',
          message:
            p.source === 'webhook'
              ? 'Payment received (confirmed by Razorpay)'
              : 'Payment received',
        },
      });
      if (order.cartId) {
        await tx.cartItem.deleteMany({ where: { cartId: order.cartId } });
        await tx.cart.updateMany({ where: { id: order.cartId }, data: { couponCode: null } });
      }
      await this.outbox.queueForOrder(tx, 'order_confirmed', order.id);
      await this.outbox.queueForOrder(tx, 'new_order_alert', order.id);
      await this.fulfilment.queueBooking(tx, order.id);
      return true;
    });
    if (confirmed) {
      this.outbox.kick();
      this.fulfilment.kick();
    }
  }

  /** Notes a failed attempt; the order stays open so the shopper can pay again. */
  async markFailed(razorpayOrderId: string, reason: string | null, raw?: Prisma.InputJsonValue) {
    const payment = await this.prisma.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ['CREATED', 'AUTHORIZED'] } },
        data: { status: 'FAILED', raw },
      });
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: 'payment_failed',
          message: `Payment attempt failed${reason ? `: ${reason}` : ''}`,
        },
      });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        select: { status: true },
      });
      // Once per order: how to try again while the items are still held.
      if (order.status === 'PENDING_PAYMENT') {
        await this.outbox.queueForOrder(tx, 'payment_failed', payment.orderId);
      }
    });
    this.outbox.kick();
  }

  /** Cancels an unpaid order and gives back its held stock and coupon use. */
  async cancel(orderId: string, type: string, message: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order || order.status !== 'PENDING_PAYMENT') return false;
      for (const item of order.items) {
        if (!item.variantId) continue;
        await tx.$executeRaw`
          UPDATE variants SET reserved = GREATEST(reserved - ${item.quantity}, 0), updated_at = now()
          WHERE id = ${item.variantId}`;
      }
      if (order.couponId) {
        await tx.$executeRaw`
          UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = ${order.couponId}`;
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', expiresAt: null },
      });
      await tx.orderEvent.create({ data: { orderId: order.id, type, message } });
      return true;
    });
  }

  /** Cancels unpaid orders whose payment window has passed. Returns how many it cancelled. */
  async releaseExpired(now = new Date()): Promise<number> {
    const expired = await this.prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT', expiresAt: { lte: now } },
      select: { id: true },
      take: 100,
    });
    let released = 0;
    for (const { id } of expired) {
      if (await this.cancel(id, 'expired', 'Not paid in time; the items were released')) released++;
    }
    return released;
  }

  /** A guest giving up an unpaid order (e.g. starting checkout again after editing the bag). */
  async abandon(orderNumber: string, accessToken: string) {
    const order = await this.byAccessToken(orderNumber, accessToken);
    await this.cancel(order.id, 'abandoned', 'Checkout started again; the items were released');
  }

  async byAccessToken(orderNumber: string, accessToken: string) {
    const order = await this.prisma.order.findUnique({
      where: { number: orderNumber },
      include: orderInclude,
    });
    if (!order || order.accessTokenHash !== hashToken(accessToken)) {
      throw new HttpError(404, 'Order not found', 'not_found');
    }
    return order;
  }

  async publicOrder(orderNumber: string, accessToken: string): Promise<OrderDto> {
    return this.present(await this.byAccessToken(orderNumber, accessToken));
  }

  /** Orders placed with this account or its email address, newest first. */
  async listForCustomer(customer: CustomerDto): Promise<OrderSummaryDto[]> {
    const orders = await this.prisma.order.findMany({
      where: this.ownedBy(customer),
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { items: { select: { quantity: true, imageUrl: true } } },
    });
    return orders.map((o) => ({
      number: o.number,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      total: o.total,
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      firstImage: o.items[0]?.imageUrl ?? null,
    }));
  }

  async customerOrder(customer: CustomerDto, number: string): Promise<OrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { number, ...this.ownedBy(customer) },
      include: orderInclude,
    });
    if (!order) throw new HttpError(404, 'Order not found', 'not_found');
    return this.present(order);
  }

  /** The public tracking page: the order number and the phone number it was placed with. */
  async track(number: string, phone: string): Promise<TrackingDto> {
    const order = await this.prisma.order.findUnique({ where: { number }, include: orderInclude });
    if (!order || order.phone !== phone) {
      throw new HttpError(
        404,
        'We could not find an order with that number and phone number',
        'not_found',
      );
    }
    const dto = await this.present(order);
    const events = order.shipments[0]?.events;
    return {
      number: dto.number,
      status: dto.status,
      placedAt: dto.placedAt,
      items: dto.items,
      shipment: dto.shipment,
      scans: (Array.isArray(events) ? events : []) as unknown as TrackingScanDto[],
      timeline: dto.timeline,
      returns: dto.returns,
      returnableUntil: dto.returnableUntil,
    };
  }

  private ownedBy(customer: CustomerDto): Prisma.OrderWhereInput {
    return { OR: [{ customerId: customer.id }, { email: customer.email }] };
  }

  private load(where: Prisma.OrderWhereUniqueInput) {
    return this.prisma.order.findUniqueOrThrow({ where, include: orderInclude });
  }

  /** The order as its shopper sees it. */
  async present(o: OrderWithItems): Promise<OrderDto> {
    const { windowDays } = await loadSetting(this.prisma, 'returns');
    return this.toDto(o, windowDays);
  }

  private toDto(o: OrderWithItems, returnDays: number): OrderDto {
    return {
      number: o.number,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      placedAt: o.placedAt?.toISOString() ?? null,
      expiresAt: o.status === 'PENDING_PAYMENT' ? (o.expiresAt?.toISOString() ?? null) : null,
      email: o.email,
      phone: o.phone,
      items: o.items.map((i) => ({
        id: i.id,
        name: i.productName,
        title: i.variantTitle,
        sku: i.sku,
        image: i.imageUrl,
        slug: i.variant?.product.slug ?? null,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
      })),
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      subtotal: o.subtotal,
      discount: o.discount,
      shippingFee: o.shippingFee,
      total: o.total,
      couponCode: o.couponCode,
      shippingAddress: o.shippingAddress as unknown as AddressFields,
      paymentMethod: o.paymentMethod,
      shipment: shipmentDto(o.shipments[0]),
      timeline: timeline(o.events),
      returns: o.returns.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        items: returnItems(r.items, o.items),
      })),
      returnableUntil: returnableUntil(o, returnDays)?.toISOString() ?? null,
    };
  }

  /** For orders that expired before payment arrived: sells straight from free stock if it's there. */
  private async takeStockDirectly(
    tx: Tx,
    items: { variantId: string | null; quantity: number }[],
  ): Promise<boolean> {
    const ids = items.flatMap((i) => (i.variantId ? [i.variantId] : []));
    if (!ids.length) return false;
    const rows = await tx.$queryRaw<{ id: string; free: number }[]>`
      SELECT id, stock - reserved AS free FROM variants WHERE id = ANY(${ids}) FOR UPDATE`;
    const free = new Map(rows.map((r) => [r.id, Number(r.free)]));
    if (items.some((i) => !i.variantId || (free.get(i.variantId) ?? 0) < i.quantity)) return false;
    for (const item of items) {
      await tx.$executeRaw`
        UPDATE variants SET stock = stock - ${item.quantity}, updated_at = now()
        WHERE id = ${item.variantId}`;
    }
    return true;
  }

  /** Fills in a customer's name and phone from their first checkout, and saves the address. */
  private async rememberCustomerDetails(tx: Tx, customer: CustomerDto, input: CheckoutRequest) {
    if (!customer.name || !customer.phone) {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          name: customer.name ?? input.address.name,
          phone: customer.phone ?? input.address.phone,
        },
      });
    }
    if (!input.saveAddress) return;
    const saved = await tx.address.findMany({ where: { customerId: customer.id } });
    const a = input.address;
    const duplicate = saved.some(
      (s) =>
        s.line1 === a.line1 &&
        (s.line2 ?? null) === a.line2 &&
        s.pincode === a.pincode &&
        s.name === a.name &&
        s.phone === a.phone,
    );
    if (duplicate || saved.length >= 10) return;
    await tx.address.create({
      data: { customerId: customer.id, ...a, isDefault: saved.length === 0 },
    });
  }
}

function shipmentDto(s: OrderWithItems['shipments'][number] | undefined): ShipmentDto | null {
  if (!s) return null;
  return {
    status: s.status,
    courier: s.courier,
    awb: s.awb,
    trackingUrl: s.trackingUrl,
    estimatedDelivery: s.estimatedDelivery?.toISOString() ?? null,
  };
}

/** Customer-facing milestones, oldest first, each shown once. */
function timeline(events: { type: string; createdAt: Date }[]): TimelineEntryDto[] {
  const seen = new Set<string>();
  const entries: TimelineEntryDto[] = [];
  for (const e of events) {
    const label = TIMELINE_LABELS[e.type];
    if (!label || seen.has(label)) continue;
    seen.add(label);
    entries.push({ at: e.createdAt.toISOString(), label });
  }
  return entries;
}

/** The items of a return request, named from the order's lines. */
export function returnItems(
  json: Prisma.JsonValue,
  orderItems: { id: string; productName: string; variantTitle: string }[],
) {
  const lines = (Array.isArray(json) ? json : []) as { orderItemId: string; quantity: number }[];
  return lines.flatMap((l) => {
    const item = orderItems.find((i) => i.id === l.orderItemId);
    return item ? [{ name: item.productName, title: item.variantTitle, quantity: l.quantity }] : [];
  });
}

/**
 * Until when a delivered order can be returned: the window counts from delivery. Null when it
 * is not delivered, the window passed, or a return is already open or done.
 */
export function returnableUntil(
  o: {
    status: string;
    events: { type: string; createdAt: Date }[];
    returns: { status: string }[];
  },
  returnDays: number,
  now = new Date(),
): Date | null {
  if (o.status !== 'DELIVERED' || returnDays <= 0) return null;
  if (o.returns.some((r) => r.status !== 'REJECTED')) return null;
  const delivered = [...o.events].reverse().find((e) => e.type === 'delivered')?.createdAt;
  if (!delivered) return null;
  const until = new Date(delivered.getTime() + returnDays * 24 * 60 * 60 * 1000);
  return until > now ? until : null;
}
