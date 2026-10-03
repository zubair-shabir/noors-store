import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFound } from './lib/errors.js';
import { LogEmailSender, type EmailSender } from './lib/email.js';
import { logger } from './lib/logger.js';
import { MockGateway, type PaymentGateway } from './lib/payments.js';
import type { PrismaClient } from './lib/prisma.js';
import { adminRouter, bannersRouter } from './modules/admin/admin.routes.js';
import { LocalImageStore, type ImageStore } from './modules/admin/uploads.service.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { CatalogService } from './modules/catalog/catalog.service.js';
import { CartService } from './modules/store/cart.service.js';
import { CustomerAuthService } from './modules/store/customer-auth.service.js';
import { OrderService } from './modules/store/orders.service.js';
import { storeRouter, type StoreRouterOptions } from './modules/store/store.routes.js';
import { webhooksRouter } from './modules/store/webhooks.routes.js';
import { healthRouter } from './routes/health.js';

export interface AppOptions {
  corsOrigins: string[];
  prisma: PrismaClient;
  /** Where admin uploads go. Defaults to a local folder served at /uploads. */
  imageStore?: ImageStore;
  /** Folder for the local image store (and the /uploads route). */
  uploadsDir?: string;
  /** Send the admin session cookie over HTTPS only. On in production. */
  secureCookies?: boolean;
  loginRateLimit?: number;
  /** Razorpay, or a stand-in that signs its own payments (development and tests). */
  paymentGateway?: PaymentGateway;
  /** Sends sign-in codes. Defaults to writing them to the log. */
  emailSender?: EmailSender;
  storeRateLimits?: StoreRouterOptions['rateLimits'];
}

export function createApp({
  corsOrigins,
  prisma,
  imageStore,
  uploadsDir = 'uploads',
  secureCookies = false,
  loginRateLimit,
  paymentGateway = new MockGateway(),
  emailSender = new LogEmailSender(),
  storeRateLimits,
}: AppOptions): Express {
  const app = express();
  const carts = new CartService(prisma);
  const orders = new OrderService(prisma, carts, paymentGateway);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('query parser', 'simple');
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(pinoHttp({ logger }));
  // Webhooks read the raw body to check its signature, so they come before the JSON parser.
  app.use('/api/v1/webhooks', webhooksRouter({ prisma, orders, gateway: paymentGateway }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use(
    '/api/v1/health',
    healthRouter({
      pingDatabase: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
    }),
  );
  app.use('/api/v1', catalogRouter(new CatalogService(prisma)));
  app.use('/api/v1/banners', bannersRouter(prisma));
  app.use(
    '/api/v1/admin',
    adminRouter({
      prisma,
      imageStore: imageStore ?? new LocalImageStore(uploadsDir),
      allowedOrigins: corsOrigins,
      secureCookies,
      loginRateLimit,
    }),
  );
  // Store routes load the shopper's session, so they go after the catalogue and admin.
  app.use(
    '/api/v1',
    storeRouter({
      prisma,
      carts,
      auth: new CustomerAuthService(prisma, emailSender),
      orders,
      gateway: paymentGateway,
      allowedOrigins: corsOrigins,
      secureCookies,
      rateLimits: storeRateLimits,
    }),
  );
  if (!imageStore) {
    app.use(
      '/uploads',
      express.static(uploadsDir, {
        maxAge: '30d',
        immutable: true,
        setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
      }),
    );
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
