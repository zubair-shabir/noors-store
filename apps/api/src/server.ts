import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { logger } from './lib/logger.js';
import { createPrisma } from './lib/prisma.js';

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);

const app = createApp({ corsOrigins: env.CORS_ORIGINS, prisma });

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
