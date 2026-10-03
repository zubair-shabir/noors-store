import { orderAccessSchema, serviceabilityQuerySchema, trackQuerySchema } from '@noors/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { OrderService } from '../store/orders.service.js';
import type { FulfilmentService } from './fulfilment.service.js';

const mockTrackSchema = orderAccessSchema.extend({
  status: z.enum(['IN TRANSIT', 'OUT FOR DELIVERY', 'DELIVERED', 'RTO INITIATED']),
});

/** Delivery estimates by pincode and the public order tracking page. */
export function shippingRouter(opts: {
  prisma: PrismaClient;
  orders: OrderService;
  fulfilment: FulfilmentService;
  /** Tracking lookups per IP per 15 minutes. */
  trackLimit?: number;
}): Router {
  const { prisma, orders, fulfilment } = opts;
  const router = Router();

  router.get('/shipping/serviceability', async (req, res) => {
    const { pincode } = serviceabilityQuerySchema.parse(req.query);
    try {
      const result = await fulfilment.serviceability(pincode);
      res.set('Cache-Control', 'public, max-age=3600');
      res.json(result);
    } catch (err) {
      logger.warn({ err, pincode }, 'Serviceability check failed');
      throw new HttpError(503, 'Delivery estimates are not available right now', 'unavailable');
    }
  });

  router.get(
    '/track',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: opts.trackLimit ?? 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(new HttpError(429, 'Too many lookups. Try again in a few minutes.', 'rate_limited')),
    }),
    async (req, res) => {
      const { order, phone } = trackQuerySchema.parse(req.query);
      res.set('Cache-Control', 'no-store');
      res.json(await orders.track(order, phone));
    },
  );

  // Development stand-in for the courier: moves a mock shipment along, as tracking would.
  if (fulfilment.mode === 'mock') {
    router.post('/shipping/mock-track', async (req, res) => {
      const { orderNumber, accessToken, status } = mockTrackSchema.parse(req.body);
      const order = await orders.byAccessToken(orderNumber, accessToken);
      const shipment = await prisma.shipment.findFirst({
        where: { orderId: order.id, status: { not: 'CANCELLED' }, awb: { not: null } },
      });
      if (!shipment?.awb) throw new HttpError(404, 'No shipment booked yet', 'not_found');
      const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString();
      await fulfilment.applyTracking({
        awb: shipment.awb,
        current_status: status,
        scans: [
          {
            date: `${now.slice(0, 10)} ${now.slice(11, 19)}`,
            activity: status,
            location: 'Srinagar Hub',
          },
        ],
      });
      res.status(204).end();
    });
  }

  return router;
}
