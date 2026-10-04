import { contactSchema, type StoreInfoDto } from '@noors/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { sameOriginOnly } from '../admin/auth.middleware.js';
import type { EmailOutbox } from '../notify/outbox.js';
import { loadSetting, loadSettings } from '../settings/settings.service.js';

export interface ContentRouterOptions {
  prisma: PrismaClient;
  outbox: EmailOutbox;
  allowedOrigins: string[];
  /** Contact form messages per IP per 15 minutes. */
  contactLimit?: number;
}

/** Public store details for the policy pages, and the contact form. */
export function contentRouter({
  prisma,
  outbox,
  allowedOrigins,
  contactLimit = 5,
}: ContentRouterOptions): Router {
  const router = Router();

  // Changes only when the owner saves settings, so a short shared cache is safe.
  router.get('/store-info', async (_req, res) => {
    const s = await loadSettings(prisma);
    const info: StoreInfoDto = {
      name: s.store.name,
      email: s.store.email,
      phone: s.store.phone,
      address: s.store.address,
      gstNumber: s.store.gstNumber,
      shipping: { fee: s.shipping.flatFee, freeAbove: s.shipping.freeFrom },
      cod: { enabled: s.cod.enabled, fee: s.cod.fee },
      returns: { windowDays: s.returns.windowDays },
    };
    res.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.json(info);
  });

  const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: contactLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new HttpError(
          429,
          'You have sent a few messages already. Please try again in a little while.',
          'rate_limited',
        ),
      ),
  });

  router.post(
    '/contact',
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    },
    sameOriginOnly(allowedOrigins),
    contactLimiter,
    async (req, res) => {
      const { website, ...message } = contactSchema.parse(req.body);
      // Bots fill in the hidden field. Look like success so they don't learn anything.
      if (website?.trim()) {
        logger.info({ ip: req.ip }, 'Contact form honeypot triggered; message dropped');
        res.status(204).end();
        return;
      }
      const store = await loadSetting(prisma, 'store');
      const queued = await outbox.queueContactMessage(prisma, message, store.email);
      if (!queued) {
        logger.error(
          { from: message.email },
          'Contact message not queued: set the store email in Settings or ORDER_ALERT_EMAIL',
        );
        throw new HttpError(
          503,
          'We could not send your message just now. Please email us instead.',
          'contact_unavailable',
        );
      }
      outbox.kick();
      res.status(204).end();
    },
  );

  return router;
}
