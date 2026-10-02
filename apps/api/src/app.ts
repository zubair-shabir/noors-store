import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFound } from './lib/errors.js';
import { logger } from './lib/logger.js';
import type { PrismaClient } from './lib/prisma.js';
import { adminRouter, bannersRouter } from './modules/admin/admin.routes.js';
import { LocalImageStore, type ImageStore } from './modules/admin/uploads.service.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { CatalogService } from './modules/catalog/catalog.service.js';
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
}

export function createApp({
  corsOrigins,
  prisma,
  imageStore,
  uploadsDir = 'uploads',
  secureCookies = false,
  loginRateLimit,
}: AppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('query parser', 'simple');
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(pinoHttp({ logger }));
  // Webhook routes (Razorpay, Shiprocket) will mount before this so they can read the raw body.
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
