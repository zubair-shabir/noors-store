import type { Prisma } from '../../generated/prisma/client.js';
import type { EmailSender } from '../../lib/email.js';
import { logger } from '../../lib/logger.js';
import type { PrismaClient } from '../../lib/prisma.js';
import * as templates from './templates.js';
import type { EmailOrder, EmailShipment, Rendered } from './templates.js';

type Tx = Prisma.TransactionClient;

export type OrderEmailKind =
  | 'order_confirmed'
  | 'new_order_alert'
  | 'payment_failed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'shipment_problem'
  | 'order_cancelled'
  | 'refund_issued'
  | 'return_update'
  | 'return_requested';

export interface QueueExtra {
  problem?: string;
  /** Delivered email: days a return can be asked for. */
  returnDays?: number;
  /** Cancellation and refund emails: amount refunded, in paise. */
  amount?: number;
  return?: templates.EmailReturn;
  /** Makes the email unique per event rather than per order (refunds, return updates). */
  key?: string;
}

const MAX_ATTEMPTS = 5;
/** A row stuck in SENDING this long (the process died mid-send) is tried again. */
const STALE_SENDING_MS = 5 * 60 * 1000;

export interface OutboxOptions {
  /** Public address of the store, for links and images in emails. */
  storeUrl: string;
  /** Where new-order and shipping-problem alerts go; none are sent when unset. */
  alertEmail?: string;
  /** Send right after queueing (production); tests call `dispatch` themselves. */
  autoDispatch?: boolean;
}

/**
 * Transactional email outbox. `queue*` writes the rendered email inside the caller's
 * transaction, so an email exists exactly when the change it announces was saved;
 * `dispatch` sends what is due, retrying failures with backoff.
 */
export class EmailOutbox {
  private dispatching: Promise<number> | null = null;
  private kickTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly sender: EmailSender,
    private readonly opts: OutboxOptions,
  ) {}

  get storeUrl() {
    return this.opts.storeUrl;
  }

  /** Queues one of the order emails. Each kind is sent at most once per order. */
  async queueForOrder(
    tx: Tx,
    kind: OrderEmailKind,
    orderId: string,
    extra: QueueExtra = {},
  ): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: true,
        shipments: { where: { status: { not: 'CANCELLED' } }, take: 1 },
      },
    });
    const data: EmailOrder = {
      number: order.number,
      email: order.email,
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount,
      shippingFee: order.shippingFee,
      total: order.total,
      couponCode: order.couponCode,
      paymentMethod: order.paymentMethod,
      shippingAddress: order.shippingAddress as unknown as EmailOrder['shippingAddress'],
    };
    const s = order.shipments[0];
    const shipment: EmailShipment = {
      courier: s?.courier ?? null,
      awb: s?.awb ?? null,
      trackingUrl: s?.trackingUrl ?? null,
      estimatedDelivery: s?.estimatedDelivery ?? null,
    };
    const url = this.opts.storeUrl;

    let to = order.email;
    let rendered: Rendered;
    switch (kind) {
      case 'order_confirmed':
        rendered = templates.orderConfirmed(url, data);
        break;
      case 'payment_failed':
        rendered = templates.paymentFailed(url, data, order.expiresAt);
        break;
      case 'shipped':
        rendered = templates.shipped(url, data, shipment);
        break;
      case 'out_for_delivery':
        rendered = templates.outForDelivery(url, data, shipment);
        break;
      case 'delivered':
        rendered = templates.delivered(url, data, extra.returnDays ?? 0);
        break;
      case 'order_cancelled':
        rendered = templates.orderCancelled(url, data, extra.amount ?? 0);
        break;
      case 'refund_issued':
        rendered = templates.refundIssued(url, data, extra.amount ?? 0);
        break;
      case 'return_update':
        rendered = templates.returnUpdate(url, data, extra.return!);
        break;
      case 'return_requested':
        if (!this.opts.alertEmail) return;
        to = this.opts.alertEmail;
        rendered = templates.returnRequestedAlert(url, data, extra.return!);
        break;
      case 'new_order_alert':
      case 'shipment_problem':
        if (!this.opts.alertEmail) return;
        to = this.opts.alertEmail;
        rendered =
          kind === 'new_order_alert'
            ? templates.newOrderAlert(url, data)
            : templates.shipmentProblem(url, data, extra.problem ?? 'Unknown error');
        break;
    }

    await tx.email.createMany({
      data: [
        {
          dedupeKey: `${kind}:${orderId}${extra.key ? `:${extra.key}` : ''}`,
          kind,
          orderId,
          to,
          ...rendered,
        },
      ],
      skipDuplicates: true,
    });
  }

  /** Sends due emails soon, without waiting for the next scheduled run. */
  kick() {
    if (!this.opts.autoDispatch || this.kickTimer) return;
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.dispatch().catch((err: unknown) => logger.error({ err }, 'Email dispatch failed'));
    }, 50);
    this.kickTimer.unref();
  }

  /** Sends every due email once. Returns how many were sent. Runs one batch at a time. */
  dispatch(limit = 25): Promise<number> {
    this.dispatching ??= this.sendDue(limit).finally(() => {
      this.dispatching = null;
    });
    return this.dispatching;
  }

  private async sendDue(limit: number): Promise<number> {
    const now = new Date();
    await this.prisma.email.updateMany({
      where: { status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
      data: { status: 'PENDING' },
    });
    const due = await this.prisma.email.findMany({
      where: { status: 'PENDING', sendAfter: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let sent = 0;
    for (const email of due) {
      const claimed = await this.prisma.email.updateMany({
        where: { id: email.id, status: 'PENDING' },
        data: { status: 'SENDING', attempts: { increment: 1 } },
      });
      if (claimed.count === 0) continue;
      try {
        await this.sender.send({
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        await this.prisma.email.update({
          where: { id: email.id },
          data: { status: 'SENT', sentAt: new Date(), lastError: null },
        });
        sent++;
      } catch (err) {
        const attempts = email.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ err, email: email.id, kind: email.kind, attempts }, 'Email not sent');
        await this.prisma.email.update({
          where: { id: email.id },
          data: {
            status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
            lastError: message.slice(0, 500),
            // 1, 4, 16, 64 minutes.
            sendAfter: new Date(Date.now() + 4 ** (attempts - 1) * 60_000),
          },
        });
      }
    }
    return sent;
  }
}
