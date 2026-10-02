import { createHash } from 'node:crypto';
import express, { Router } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { PaymentGateway } from '../../lib/payments.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { OrderService } from './orders.service.js';

interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  method?: string;
  error_description?: string | null;
}

interface RazorpayEvent {
  event: string;
  payload: {
    payment?: { entity: RazorpayPayment };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  };
}

/**
 * Razorpay webhooks: the source of truth when a shopper pays and closes the tab before the
 * checkout page hears back. Must be mounted before express.json() so the raw body can be
 * checked against its signature.
 */
export function webhooksRouter(opts: {
  prisma: PrismaClient;
  orders: OrderService;
  gateway: PaymentGateway;
}): Router {
  const { prisma, orders, gateway } = opts;
  const router = Router();

  router.post('/razorpay', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.get('x-razorpay-signature') ?? '';
    if (!signature || !gateway.verifyWebhook(body, signature)) {
      throw new HttpError(400, 'Invalid signature', 'invalid_signature');
    }

    let event: RazorpayEvent;
    try {
      event = JSON.parse(body.toString('utf8')) as RazorpayEvent;
    } catch {
      throw new HttpError(400, 'Invalid JSON', 'invalid_body');
    }
    // Razorpay sends the same event id on retries; fall back to a hash of the body.
    const eventId =
      req.get('x-razorpay-event-id') ?? createHash('sha256').update(body).digest('hex');

    const recorded = await prisma.webhookEvent.createMany({
      data: [{ provider: 'razorpay', eventId, payload: event as unknown as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    if (recorded.count === 0) {
      const previous = await prisma.webhookEvent.findUnique({
        where: { provider_eventId: { provider: 'razorpay', eventId } },
      });
      // Already handled: acknowledge so Razorpay stops retrying.
      if (previous?.processedAt) return res.json({ status: 'duplicate' });
    }

    try {
      await handle(event);
    } catch (err) {
      // Leave it unprocessed; Razorpay retries and the next delivery tries again.
      logger.error({ err, eventId, type: event.event }, 'Razorpay webhook failed');
      throw err;
    }
    await prisma.webhookEvent.update({
      where: { provider_eventId: { provider: 'razorpay', eventId } },
      data: { processedAt: new Date() },
    });
    res.json({ status: 'ok' });
  });

  async function handle(event: RazorpayEvent) {
    const payment = event.payload.payment?.entity;
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid': {
        if (!payment?.order_id) return;
        const known = await prisma.payment.findUnique({
          where: { razorpayOrderId: payment.order_id },
        });
        if (!known) return; // Not one of ours (another integration on the same account).
        if (payment.amount !== known.amount) {
          logger.error(
            { order: payment.order_id, paid: payment.amount, expected: known.amount },
            'Razorpay amount does not match the order',
          );
          await prisma.orderEvent.create({
            data: {
              orderId: known.orderId,
              type: 'payment_mismatch',
              message: `Razorpay reported ₹${payment.amount / 100}, expected ₹${known.amount / 100}. Check this payment.`,
            },
          });
          return;
        }
        await orders.markPaid({
          razorpayOrderId: payment.order_id,
          razorpayPaymentId: payment.id,
          method: payment.method ?? null,
          raw: payment as unknown as Prisma.InputJsonValue,
          source: 'webhook',
        });
        return;
      }
      case 'payment.failed':
        if (payment?.order_id) {
          await orders.markFailed(
            payment.order_id,
            payment.error_description ?? null,
            payment as unknown as Prisma.InputJsonValue,
          );
        }
        return;
      case 'refund.processed': {
        const refund = event.payload.refund?.entity;
        if (refund) {
          await prisma.refund.updateMany({
            where: { razorpayRefundId: refund.id },
            data: { status: 'PROCESSED' },
          });
        }
        return;
      }
      default:
        return;
    }
  }

  return router;
}
