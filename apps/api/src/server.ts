import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { LogEmailSender, ResendEmailSender } from './lib/email.js';
import { logger } from './lib/logger.js';
import { MockGateway, RazorpayGateway } from './lib/payments.js';
import { createPrisma } from './lib/prisma.js';
import { CloudinaryImageStore } from './modules/admin/uploads.service.js';
import { CartService } from './modules/store/cart.service.js';
import { OrderService } from './modules/store/orders.service.js';

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);

const paymentGateway =
  env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
    ? new RazorpayGateway(
        env.RAZORPAY_KEY_ID,
        env.RAZORPAY_KEY_SECRET,
        env.RAZORPAY_WEBHOOK_SECRET ?? '',
      )
    : new MockGateway();
const emailSender = env.RESEND_API_KEY
  ? new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM)
  : new LogEmailSender();

const app = createApp({
  corsOrigins: env.CORS_ORIGINS,
  prisma,
  imageStore: env.CLOUDINARY_URL ? new CloudinaryImageStore(env.CLOUDINARY_URL) : undefined,
  uploadsDir: env.UPLOADS_DIR,
  secureCookies: env.NODE_ENV === 'production',
  paymentGateway,
  emailSender,
});
if (paymentGateway.mode === 'mock') {
  logger.warn('RAZORPAY_KEY_ID not set; checkout uses a test stand-in instead of Razorpay');
}
if (!env.RESEND_API_KEY) logger.warn('RESEND_API_KEY not set; sign-in codes go to this log');

// Unpaid orders hold stock for 30 minutes; give it back once that passes.
const orders = new OrderService(prisma, new CartService(prisma), paymentGateway);
const releaseExpired = () =>
  orders
    .releaseExpired()
    .then((n) => n && logger.info(`Released ${n} unpaid order(s)`))
    .catch((err: unknown) => logger.error({ err }, 'Releasing unpaid orders failed'));
const releaseTimer = setInterval(releaseExpired, 60_000);
void releaseExpired();
if (!env.CLOUDINARY_URL)
  logger.warn(`CLOUDINARY_URL not set; admin uploads go to ./${env.UPLOADS_DIR}`);

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  clearInterval(releaseTimer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
