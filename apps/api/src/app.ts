import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFound } from './lib/errors.js';
import { logger } from './lib/logger.js';
import type { PrismaClient } from './lib/prisma.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { CatalogService } from './modules/catalog/catalog.service.js';
import { healthRouter } from './routes/health.js';

export interface AppOptions {
  corsOrigins: string[];
  prisma: PrismaClient;
}

export function createApp({ corsOrigins, prisma }: AppOptions): Express {
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

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
