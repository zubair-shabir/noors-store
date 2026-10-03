import { LogEmailSender, type EmailSender } from './lib/email.js';
import { MockGateway, type PaymentGateway } from './lib/payments.js';
import type { PrismaClient } from './lib/prisma.js';
import { SecretBox } from './lib/secrets.js';
import { MockShippingProvider, type ShippingProvider } from './lib/shipping.js';
import { AdminAuthService } from './modules/admin/auth.service.js';
import {
  CouponAdminService,
  CustomerAdminService,
  InventoryAdminService,
  ReportService,
  SettingsAdminService,
  StaffService,
} from './modules/admin/operations.service.js';
import { AdminOrderService } from './modules/admin/orders.service.js';
import { EmailOutbox } from './modules/notify/outbox.js';
import { FulfilmentService } from './modules/shipping/fulfilment.service.js';
import { CartService } from './modules/store/cart.service.js';
import { CustomerAuthService } from './modules/store/customer-auth.service.js';
import { OrderService } from './modules/store/orders.service.js';
import { ReturnService } from './modules/store/returns.service.js';

export interface ServiceOptions {
  prisma: PrismaClient;
  /** Razorpay, or a stand-in that signs its own payments (development and tests). */
  paymentGateway?: PaymentGateway;
  /** Resend, or writing emails to the log. */
  emailSender?: EmailSender;
  /** Shiprocket, or a stand-in that books made-up shipments. */
  shippingProvider?: ShippingProvider;
  /** The storefront's address, for links in emails. */
  storeUrl?: string;
  /** Where new-order and shipping-problem alerts go. */
  alertEmail?: string;
  /** Send emails and book shipments straight after the change that needs them. Off in tests. */
  autoDispatch?: boolean;
  /** Encrypts secrets kept in the database (two-factor keys). */
  appSecret?: string;
}

export type Services = ReturnType<typeof createServices>;

/** The shop's services, shared by the HTTP app and the background jobs. */
export function createServices({
  prisma,
  paymentGateway = new MockGateway(),
  emailSender = new LogEmailSender(),
  shippingProvider = new MockShippingProvider(),
  storeUrl = 'http://localhost:3000',
  alertEmail,
  autoDispatch = false,
  appSecret = 'development-only-secret',
}: ServiceOptions) {
  const outbox = new EmailOutbox(prisma, emailSender, { storeUrl, alertEmail, autoDispatch });
  const fulfilment = new FulfilmentService(prisma, shippingProvider, outbox, { autoDispatch });
  const carts = new CartService(prisma);
  const orders = new OrderService(prisma, carts, paymentGateway, outbox, fulfilment);
  const adminOrders = new AdminOrderService(prisma, orders, paymentGateway, fulfilment, outbox);
  const returns = new ReturnService(prisma, outbox, adminOrders);
  return {
    paymentGateway,
    outbox,
    fulfilment,
    carts,
    auth: new CustomerAuthService(prisma, emailSender, storeUrl),
    orders,
    returns,
    ops: {
      auth: new AdminAuthService(prisma, new SecretBox(appSecret)),
      adminOrders,
      returns,
      customers: new CustomerAdminService(prisma),
      coupons: new CouponAdminService(prisma),
      inventory: new InventoryAdminService(prisma),
      reports: new ReportService(prisma),
      settings: new SettingsAdminService(prisma, {
        payments:
          paymentGateway.mode === 'mock'
            ? 'mock'
            : paymentGateway.keyId.startsWith('rzp_live')
              ? 'live'
              : 'test',
        shipping: shippingProvider.mode,
        email: emailSender.delivers ? 'resend' : 'log',
      }),
      staff: new StaffService(prisma),
    },
  };
}
