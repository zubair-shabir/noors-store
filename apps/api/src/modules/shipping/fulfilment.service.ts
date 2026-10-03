import type { ServiceabilityDto, TrackingScanDto } from '@noors/shared';
import type { Prisma, ShipmentStatus } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { trackingUrl, type ShipmentRequest, type ShippingProvider } from '../../lib/shipping.js';
import type { EmailOutbox } from '../notify/outbox.js';
import { loadSetting } from '../settings/settings.service.js';

type Tx = Prisma.TransactionClient;

/** Booking gives up (and alerts the brand) after this many failed tries. */
export const MAX_BOOKING_ATTEMPTS = 5;
/** A booking in progress holds its shipment this long, so two workers don't book it twice. */
const BOOKING_LEASE_MS = 10 * 60 * 1000;
const SERVICEABILITY_TTL_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Booking and tracking switches, kept in the settings table under "fulfilment". */
export interface FulfilmentSettings {
  /** Book a Shiprocket shipment as soon as an order is paid. */
  autoShip: boolean;
}

export function fulfilmentSettings(db: PrismaClient | Tx): Promise<FulfilmentSettings> {
  return loadSetting(db, 'fulfilment');
}

/** What Shiprocket's tracking webhook sends (only the fields we use). */
export interface CourierUpdate {
  awb?: string | number;
  current_status?: string;
  etd?: string | null;
  scans?: { date?: string; activity?: string; status?: string; location?: string }[];
}

const RANK: Record<ShipmentStatus, number> = {
  PENDING: 0,
  AWB_ASSIGNED: 1,
  PICKUP_SCHEDULED: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
  RTO: 5,
  CANCELLED: 5,
};

/** Maps Shiprocket's status text onto ours; null for statuses that change nothing for us. */
export function shipmentStatusOf(text: string): ShipmentStatus | null {
  const s = text.trim().toUpperCase().replace(/_/g, ' ');
  if (!s) return null;
  if (s.startsWith('RTO')) return 'RTO';
  if (s.includes('CANCEL')) return 'CANCELLED';
  if (s === 'DELIVERED') return 'DELIVERED';
  if (s === 'OUT FOR DELIVERY') return 'OUT_FOR_DELIVERY';
  if (
    s.includes('PICKUP') ||
    s.includes('MANIFEST') ||
    s === 'AWB ASSIGNED' ||
    s === 'NEW' ||
    s === 'LABEL GENERATED'
  ) {
    return null;
  }
  // Picked up, shipped, in transit, reached hub, delayed, misrouted...
  return 'IN_TRANSIT';
}

/** Whether tracking may move a shipment from one status to another. Statuses only go forward. */
export function canMove(from: ShipmentStatus, to: ShipmentStatus): boolean {
  if (from === 'DELIVERED' || from === 'RTO' || from === 'CANCELLED') return false;
  if (to === 'CANCELLED') return RANK[from] < RANK.IN_TRANSIT;
  if (to === 'RTO') return true;
  return RANK[to] > RANK[from];
}

/** Shiprocket's "2026-10-03 14:05:00" timestamps are Indian time. */
export function parseCourierDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(value.trim());
  const date = m ? new Date(`${m[1]}T${m[2]}+05:30`) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** YYYY-MM-DD in Indian time. */
const istDate = (d: Date) =>
  new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * Shipping with Shiprocket: whether a pincode can be delivered to, booking paid orders
 * (create order, courier and AWB, pickup, label), and the courier's tracking updates.
 */
export class FulfilmentService {
  private cache = new Map<string, { value: ServiceabilityDto; expires: number }>();
  private booking: Promise<number> | null = null;
  private kickTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: ShippingProvider,
    private readonly outbox: EmailOutbox,
    private readonly opts: { autoDispatch?: boolean } = {},
  ) {}

  get mode() {
    return this.provider.mode;
  }

  verifyWebhook(token: string) {
    return this.provider.verifyWebhook(token);
  }

  /** Whether couriers deliver to a pincode, and roughly when. Cached for a few hours. */
  async serviceability(pincode: string, now = new Date()): Promise<ServiceabilityDto> {
    const hit = this.cache.get(pincode);
    if (hit && hit.expires > now.getTime()) return hit.value;
    const { serviceable, estimatedDays } = await this.provider.serviceability(pincode, 0.5);
    const value: ServiceabilityDto = {
      pincode,
      serviceable,
      estimatedDays,
      // A day to pack and hand over, then the courier's quote.
      estimatedDate:
        serviceable && estimatedDays
          ? istDate(new Date(now.getTime() + (estimatedDays + 1) * DAY_MS))
          : null,
    };
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(pincode, { value, expires: now.getTime() + SERVICEABILITY_TTL_MS });
    return value;
  }

  /**
   * False only when the courier network definitely can't reach the pincode. When Shiprocket
   * can't be asked, checkout goes ahead and the brand sorts out delivery by hand.
   */
  async canDeliver(pincode: string): Promise<boolean> {
    try {
      return (await this.serviceability(pincode)).serviceable;
    } catch (err) {
      logger.warn({ err, pincode }, 'Serviceability check failed; allowing checkout');
      return true;
    }
  }

  /** Inside the payment transaction: lines up a shipment for a newly paid order. */
  async queueBooking(tx: Tx, orderId: string): Promise<void> {
    if (!(await fulfilmentSettings(tx)).autoShip) return;
    await this.requestBooking(tx, orderId);
  }

  /**
   * Books now, whatever the auto-ship setting: a new shipment, or another try for one whose
   * booking stalled. Returns false when the order already has a booked shipment.
   */
  async requestBooking(tx: Tx, orderId: string): Promise<boolean> {
    const open = await tx.shipment.findFirst({
      where: { orderId, status: { not: 'CANCELLED' } },
    });
    if (!open) {
      await tx.shipment.create({ data: { orderId, nextAttemptAt: new Date() } });
      return true;
    }
    if (open.status !== 'PENDING' && open.status !== 'AWB_ASSIGNED') return false;
    await tx.shipment.update({
      where: { id: open.id },
      data: { attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    return true;
  }

  /** Cancels a shipment, with Shiprocket too when it was booked there. */
  async cancelShipment(shipmentId: string): Promise<void> {
    const shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (shipment.status === 'CANCELLED') return;
    if (RANK[shipment.status] >= RANK.IN_TRANSIT) {
      throw new Error('The courier already has this parcel');
    }
    if (shipment.shiprocketOrderId) await this.provider.cancelOrder(shipment.shiprocketOrderId);
    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: { status: 'CANCELLED', nextAttemptAt: null },
    });
  }

  /** Books due shipments soon, without waiting for the next scheduled run. */
  kick() {
    if (!this.opts.autoDispatch || this.kickTimer) return;
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.bookDue().catch((err: unknown) => logger.error({ err }, 'Booking failed'));
    }, 50);
    this.kickTimer.unref();
  }

  /** Books every shipment that is due. Returns how many were booked. One batch at a time. */
  bookDue(now = new Date()): Promise<number> {
    this.booking ??= this.runDue(now).finally(() => {
      this.booking = null;
    });
    return this.booking;
  }

  private async runDue(now: Date): Promise<number> {
    const due = await this.prisma.shipment.findMany({
      where: { status: { in: ['PENDING', 'AWB_ASSIGNED'] }, nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: 10,
    });
    let booked = 0;
    for (const shipment of due) {
      // Take a lease; another worker that read the same row finds it moved on.
      const claimed = await this.prisma.shipment.updateMany({
        where: { id: shipment.id, nextAttemptAt: shipment.nextAttemptAt },
        data: {
          nextAttemptAt: new Date(now.getTime() + BOOKING_LEASE_MS),
          attempts: { increment: 1 },
        },
      });
      if (claimed.count === 0) continue;
      if (await this.book(shipment.id, shipment.attempts + 1)) booked++;
    }
    return booked;
  }

  /**
   * Runs the booking steps that haven't happened yet. Each step's result is saved as soon
   * as it returns, so a retry picks up where the last try stopped.
   */
  private async book(shipmentId: string, attempt: number): Promise<boolean> {
    let shipment = await this.prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: {
        order: { include: { items: { include: { variant: true } } } },
      },
    });
    const order = shipment.order;
    try {
      if (order.status !== 'PAID') {
        // Cancelled or handled by hand meanwhile: nothing to book.
        await this.prisma.shipment.update({
          where: { id: shipmentId },
          data: { status: 'CANCELLED', nextAttemptAt: null },
        });
        return false;
      }
      if (!shipment.shiprocketShipmentId) {
        const ids = await this.provider.createOrder(shipmentRequest(order));
        shipment = await this.prisma.shipment.update({
          where: { id: shipmentId },
          data: { shiprocketOrderId: ids.orderId, shiprocketShipmentId: ids.shipmentId },
          include: { order: { include: { items: { include: { variant: true } } } } },
        });
      }
      const srShipmentId = shipment.shiprocketShipmentId!;
      if (!shipment.awb) {
        const { awb, courier } = await this.provider.assignAwb(srShipmentId);
        shipment = await this.prisma.shipment.update({
          where: { id: shipmentId },
          data: { awb, courier, trackingUrl: trackingUrl(awb), status: 'AWB_ASSIGNED' },
          include: { order: { include: { items: { include: { variant: true } } } } },
        });
      }
      await this.provider.schedulePickup(srShipmentId);
      const labelUrl = await this.provider.label(srShipmentId).catch((err: unknown) => {
        logger.warn({ err, order: order.number }, 'Shipping label not ready');
        return null;
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.shipment.update({
          where: { id: shipmentId },
          data: {
            status: 'PICKUP_SCHEDULED',
            labelUrl: labelUrl ?? undefined,
            nextAttemptAt: null,
            lastError: null,
          },
        });
        const moved = await tx.order.updateMany({
          where: { id: order.id, status: 'PAID' },
          data: { status: 'READY_TO_SHIP' },
        });
        if (moved.count) {
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'packed',
              message: `Shipment booked with ${shipment.courier ?? 'the courier'} (AWB ${shipment.awb}); pickup scheduled`,
            },
          });
        }
      });
      return true;
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      const givingUp = attempt >= MAX_BOOKING_ATTEMPTS;
      logger.warn({ err, order: order.number, attempt }, 'Shipment booking failed');
      await this.prisma.$transaction(async (tx) => {
        await tx.shipment.update({
          where: { id: shipmentId },
          data: {
            lastError: message,
            // 2, 8, 32, 128 minutes.
            nextAttemptAt: givingUp ? null : new Date(Date.now() + 2 * 4 ** (attempt - 1) * 60_000),
          },
        });
        if (givingUp) {
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'shipment_failed',
              message: `Shiprocket booking failed ${attempt} times: ${message}`,
            },
          });
          await this.outbox.queueForOrder(tx, 'shipment_problem', order.id, { problem: message });
        }
      });
      if (givingUp) this.outbox.kick();
      return false;
    }
  }

  /**
   * A tracking update from the courier. Moves the shipment and its order forward (never back),
   * keeps the scans, and emails the customer at shipped, out for delivery and delivered.
   * Returns false for AWBs that aren't ours.
   */
  async applyTracking(update: CourierUpdate): Promise<boolean> {
    const awb = update.awb == null ? '' : String(update.awb).trim();
    if (!awb) return false;
    const queued = await this.prisma.$transaction(async (tx) => {
      const found = await tx.shipment.findUnique({ where: { awb }, select: { id: true } });
      if (!found) return null;
      await tx.$queryRaw`SELECT id FROM shipments WHERE id = ${found.id} FOR UPDATE`;
      const shipment = await tx.shipment.findUniqueOrThrow({
        where: { id: found.id },
        include: { order: true },
      });

      const scans = mergeScans(shipment.events, update.scans ?? []);
      const etd = parseCourierDate(update.etd);
      const next = shipmentStatusOf(update.current_status ?? '');
      const moving = next !== null && canMove(shipment.status, next);
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          events: scans as unknown as Prisma.InputJsonValue,
          estimatedDelivery: etd ?? undefined,
          ...(moving && { status: next }),
        },
      });
      if (!moving) return false;

      const order = shipment.order;
      const orderId = order.id;
      const courier = shipment.courier ?? 'the courier';
      switch (next) {
        case 'IN_TRANSIT':
          return this.advanceOrder(tx, orderId, 'SHIPPED', `Picked up by ${courier}`);
        case 'OUT_FOR_DELIVERY':
          return this.advanceOrder(tx, orderId, 'OUT_FOR_DELIVERY', 'Out for delivery');
        case 'DELIVERED':
          return this.advanceOrder(tx, orderId, 'DELIVERED', 'Delivered');
        case 'RTO':
          await tx.orderEvent.create({
            data: {
              orderId,
              type: 'rto',
              message: `The courier is returning this shipment to the brand (${update.current_status ?? 'RTO'})`,
            },
          });
          await this.outbox.queueForOrder(tx, 'shipment_problem', orderId, {
            problem: `The courier marked AWB ${awb} for return to origin (${update.current_status ?? 'RTO'}).`,
          });
          return true;
        case 'CANCELLED':
          // Cancelled in the Shiprocket panel: the order waits to be shipped again.
          await tx.order.updateMany({
            where: { id: orderId, status: 'READY_TO_SHIP' },
            data: { status: 'PAID' },
          });
          await tx.orderEvent.create({
            data: { orderId, type: 'shipment_cancelled', message: `Shipment ${awb} was cancelled` },
          });
          return false;
        default:
          return false;
      }
    });
    if (queued === null) return false;
    if (queued) this.outbox.kick();
    return true;
  }

  /**
   * Moves an order forward to shipped, out for delivery or delivered (never back), notes it
   * and emails the shopper. Cash on delivery counts as paid once delivered.
   * Returns false when the order was already past that point.
   */
  async advanceOrder(
    tx: Tx,
    orderId: string,
    to: 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
    message: string,
    adminUserId?: string,
  ): Promise<boolean> {
    const from: Record<typeof to, ('PAID' | 'READY_TO_SHIP' | 'SHIPPED' | 'OUT_FOR_DELIVERY')[]> = {
      SHIPPED: ['PAID', 'READY_TO_SHIP'],
      OUT_FOR_DELIVERY: ['PAID', 'READY_TO_SHIP', 'SHIPPED'],
      DELIVERED: ['PAID', 'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY'],
    };
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: { in: from[to] } },
      data: { status: to },
    });
    if (!moved.count) return false;
    const type = to.toLowerCase();
    await tx.orderEvent.create({ data: { orderId, type, message, adminUserId } });
    if (to === 'DELIVERED') {
      await tx.payment.updateMany({
        where: { orderId, provider: 'COD', status: 'CREATED' },
        data: { status: 'CAPTURED' },
      });
      const { windowDays } = await loadSetting(tx, 'returns');
      await this.outbox.queueForOrder(tx, 'delivered', orderId, { returnDays: windowDays });
    } else {
      await this.outbox.queueForOrder(tx, type as 'shipped' | 'out_for_delivery', orderId);
    }
    return true;
  }
}

/** Adds new courier scans to the saved ones, newest first, without repeats. */
function mergeScans(saved: Prisma.JsonValue, incoming: CourierUpdate['scans'] & {}) {
  const list = (Array.isArray(saved) ? saved : []) as unknown as TrackingScanDto[];
  const byKey = new Map(list.map((s) => [`${s.at}|${s.status}`, s]));
  for (const scan of incoming) {
    const at = parseCourierDate(scan.date);
    const status = (scan.activity || scan.status || '').trim();
    if (!at || !status) continue;
    const entry: TrackingScanDto = {
      at: at.toISOString(),
      status: status.slice(0, 200),
      location: scan.location?.trim().slice(0, 200) || null,
    };
    byKey.set(`${entry.at}|${entry.status}`, entry);
  }
  return [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
}

type OrderForBooking = Prisma.OrderGetPayload<{
  include: { items: { include: { variant: true } } };
}>;

/** The Shiprocket order for one of ours: rupees, kilograms, and a box that fits everything. */
export function shipmentRequest(order: OrderForBooking): ShipmentRequest {
  const address = order.shippingAddress as unknown as {
    name: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  let grams = 0;
  let length = 10;
  let breadth = 10;
  let height = 0;
  for (const item of order.items) {
    const v = item.variant;
    grams += (v?.weightGrams ?? 500) * item.quantity;
    length = Math.max(length, v?.lengthCm ?? 30);
    breadth = Math.max(breadth, v?.widthCm ?? 25);
    height += (v?.heightCm ?? 5) * item.quantity;
  }
  return {
    orderNumber: order.number,
    orderDate: order.placedAt ?? order.createdAt,
    customer: { name: address.name, email: order.email, phone: order.phone },
    address: {
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    },
    items: order.items.map((i) => ({
      name: `${i.productName} (${i.variantTitle})`,
      sku: i.sku,
      units: i.quantity,
      sellingPrice: i.unitPrice / 100,
      hsn: i.hsnCode,
    })),
    paymentMethod: order.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
    subTotal: order.subtotal / 100,
    discount: order.discount / 100,
    shippingCharges: order.shippingFee / 100,
    package: {
      weightKg: Math.max(grams / 1000, 0.1),
      lengthCm: length,
      breadthCm: breadth,
      heightCm: Math.max(height, 1),
    },
  };
}
