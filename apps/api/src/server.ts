import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { LogEmailSender, ResendEmailSender } from './lib/email.js';
import { logger } from './lib/logger.js';
import { MockGateway, RazorpayGateway } from './lib/payments.js';
import { createPrisma } from './lib/prisma.js';
import { MockShippingProvider, ShiprocketProvider } from './lib/shipping.js';
import { CloudinaryImageStore } from './modules/admin/uploads.service.js';
import { createServices } from './services.js';

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
const shippingProvider =
  env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD
    ? new ShiprocketProvider({
        email: env.SHIPROCKET_EMAIL,
        password: env.SHIPROCKET_PASSWORD,
        pickupLocation: env.SHIPROCKET_PICKUP_LOCATION,
        pickupPincode: env.SHIPROCKET_PICKUP_PINCODE,
        webhookToken: env.SHIPROCKET_WEBHOOK_TOKEN ?? '',
      })
    : new MockShippingProvider(env.SHIPROCKET_WEBHOOK_TOKEN);

const services = createServices({
  prisma,
  paymentGateway,
  emailSender,
  shippingProvider,
  storeUrl: env.STORE_URL,
  alertEmail: env.ORDER_ALERT_EMAIL,
  autoDispatch: true,
});

const app = createApp({
  corsOrigins: env.CORS_ORIGINS,
  prisma,
  imageStore: env.CLOUDINARY_URL ? new CloudinaryImageStore(env.CLOUDINARY_URL) : undefined,
  uploadsDir: env.UPLOADS_DIR,
  secureCookies: env.NODE_ENV === 'production',
  services,
});
if (paymentGateway.mode === 'mock') {
  logger.warn('RAZORPAY_KEY_ID not set; checkout uses a test stand-in instead of Razorpay');
}
if (!env.RESEND_API_KEY) logger.warn('RESEND_API_KEY not set; emails go to this log');
if (shippingProvider.mode === 'mock') {
  logger.warn('SHIPROCKET_EMAIL not set; shipments are booked with a test stand-in');
}
if (!env.CLOUDINARY_URL)
  logger.warn(`CLOUDINARY_URL not set; admin uploads go to ./${env.UPLOADS_DIR}`);

/** Runs a background job now and then every `ms`, logging failures instead of crashing. */
function every(ms: number, name: string, job: () => Promise<number>) {
  const run = () =>
    job()
      .then((n) => n && logger.info(`${name}: ${n}`))
      .catch((err: unknown) => logger.error({ err }, `${name} failed`));
  void run();
  return setInterval(run, ms);
}

const timers = [
  // Unpaid orders hold stock for 30 minutes; give it back once that passes.
  every(60_000, 'Released unpaid orders', () => services.orders.releaseExpired()),
  every(15_000, 'Sent emails', () => services.outbox.dispatch()),
  every(30_000, 'Booked shipments', () => services.fulfilment.bookDue()),
];

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  timers.forEach(clearInterval);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
