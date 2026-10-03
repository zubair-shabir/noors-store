import type { CheckoutResultDto, OrderDto, ServiceabilityDto, TrackingDto } from '@noors/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createProduct, resetDatabase, testPrisma } from '../../../test/db.js';
import { createApp } from '../../app.js';
import type { EmailMessage, EmailSender } from '../../lib/email.js';
import { MockGateway } from '../../lib/payments.js';
import { MockShippingProvider } from '../../lib/shipping.js';
import { createServices } from '../../services.js';
import { canMove, parseCourierDate, shipmentStatusOf } from './fulfilment.service.js';

/** Records emails, and fails the next sends when told to. */
class TestSender implements EmailSender {
  readonly delivers = true;
  sent: EmailMessage[] = [];
  failures = 0;
  async send(message: EmailMessage) {
    if (this.failures > 0) {
      this.failures--;
      throw new Error('Resend is down');
    }
    this.sent.push(message);
  }
}

const prisma = testPrisma();
const gateway = new MockGateway();
const shipping = new MockShippingProvider('courier-secret');
const sender = new TestSender();
const services = createServices({
  prisma,
  paymentGateway: gateway,
  emailSender: sender,
  shippingProvider: shipping,
  storeUrl: 'https://noors.in',
  alertEmail: 'team@noors.in',
});
const app = createApp({
  corsOrigins: ['http://localhost:3000'],
  prisma,
  services,
  storeRateLimits: { otp: 1000, checkout: 1000, track: 1000 },
});
const { outbox, fulfilment } = services;

const address = {
  name: 'Zoya Mir',
  phone: '+91 98765 43210',
  line1: '12 Residency Road',
  city: 'Srinagar',
  state: 'Jammu and Kashmir',
  pincode: '190001',
};

let hoodie: string;

beforeEach(async () => {
  await resetDatabase(prisma);
  sender.sent = [];
  sender.failures = 0;
  shipping.booked.length = 0;
  shipping.failNext = null;
  const category = await prisma.category.create({ data: { slug: 'hoodies', name: 'Hoodies' } });
  await createProduct(prisma, {
    slug: 'heritage',
    name: 'Heritage Hoodie',
    categoryId: category.id,
    variants: [{ size: 'M', price: 249900, stock: 5 }],
  });
  hoodie = (await prisma.variant.findUniqueOrThrow({ where: { sku: 'HERITAGE-M-X' } })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function placeOrder(pincode = '190001') {
  const agent = request.agent(app);
  await agent.post('/api/v1/cart/items').send({ variantId: hoodie, quantity: 2 });
  const res = await agent
    .post('/api/v1/checkout')
    .send({ email: 'zoya@example.com', address: { ...address, pincode } });
  return { agent, res };
}

async function paidOrder() {
  const { agent, res } = await placeOrder();
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const result = res.body as CheckoutResultDto;
  const signed = gateway.pay(result.payment!.razorpayOrderId);
  const paid = await agent
    .post('/api/v1/checkout/verify')
    .send({ orderNumber: result.orderNumber, ...signed });
  expect(paid.status).toBe(200);
  return { agent, result };
}

const viewOrder = async (result: CheckoutResultDto) =>
  (await request(app).get(`/api/v1/orders/${result.orderNumber}?key=${result.accessToken}`))
    .body as OrderDto;

const courier = (body: Record<string, unknown>, token = 'courier-secret') =>
  request(app).post('/api/v1/webhooks/courier').set('x-api-key', token).send(body);

describe('delivery estimates', () => {
  it('quotes delivery by pincode', async () => {
    const res = await request(app).get('/api/v1/shipping/serviceability?pincode=190001');
    expect(res.status).toBe(200);
    const body = res.body as ServiceabilityDto;
    expect(body).toMatchObject({ pincode: '190001', serviceable: true, estimatedDays: 3 });
    expect(body.estimatedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const far = await request(app).get('/api/v1/shipping/serviceability?pincode=400001');
    expect(far.body).toMatchObject({ serviceable: true, estimatedDays: 5 });

    const none = await request(app).get('/api/v1/shipping/serviceability?pincode=901234');
    expect(none.body).toMatchObject({ serviceable: false, estimatedDate: null });

    const bad = await request(app).get('/api/v1/shipping/serviceability?pincode=12');
    expect(bad.status).toBe(400);
  });

  it('refuses checkout to a pincode couriers cannot reach', async () => {
    const { res } = await placeOrder('901234');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'not_serviceable',
      issues: [{ path: ['address', 'pincode'] }],
    });
    expect(await prisma.order.count()).toBe(0);
  });
});

describe('booking shipments', () => {
  it('books a paid order with Shiprocket and marks it packed', async () => {
    const { result } = await paidOrder();
    expect(await fulfilment.bookDue()).toBe(1);

    expect(shipping.booked).toHaveLength(1);
    expect(shipping.booked[0]).toMatchObject({
      orderNumber: result.orderNumber,
      customer: { name: 'Zoya Mir', phone: '9876543210', email: 'zoya@example.com' },
      address: { pincode: '190001', city: 'Srinagar' },
      items: [{ sku: 'HERITAGE-M-X', units: 2, sellingPrice: 2499 }],
      subTotal: 4998,
      package: { weightKg: 1, heightCm: 10 },
    });
    const order = await viewOrder(result);
    expect(order.status).toBe('READY_TO_SHIP');
    expect(order.shipment).toMatchObject({
      status: 'PICKUP_SCHEDULED',
      courier: 'Mock Express',
      awb: expect.stringMatching(/^MOCK/),
      trackingUrl: expect.stringContaining('shiprocket.co/tracking/MOCK'),
    });
    expect(order.timeline.map((t) => t.label)).toEqual([
      'Order placed',
      'Payment received',
      'Packed and handed to the courier',
    ]);
    // Nothing left to book.
    expect(await fulfilment.bookDue()).toBe(0);
  });

  it('does not book when automatic shipping is off', async () => {
    await prisma.setting.create({ data: { key: 'fulfilment', value: { autoShip: false } } });
    await paidOrder();
    expect(await fulfilment.bookDue()).toBe(0);
    expect(await prisma.shipment.count()).toBe(0);
  });

  it('retries a failed booking from the step that failed, then alerts the brand', async () => {
    const { result } = await paidOrder();
    shipping.failNext = 'Courier not available';
    expect(await fulfilment.bookDue()).toBe(0);
    let shipment = await prisma.shipment.findFirstOrThrow();
    expect(shipment).toMatchObject({ attempts: 1, lastError: 'Courier not available' });
    expect(shipment.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    // The next try (once due) succeeds and creates the Shiprocket order only once.
    expect(await fulfilment.bookDue(new Date(Date.now() + 3 * 60_000))).toBe(1);
    expect(shipping.booked).toHaveLength(1);
    shipment = await prisma.shipment.findFirstOrThrow();
    expect(shipment).toMatchObject({ status: 'PICKUP_SCHEDULED', lastError: null, attempts: 2 });
    expect((await viewOrder(result)).status).toBe('READY_TO_SHIP');
  });

  it('gives up after five failures and emails the brand', async () => {
    await paidOrder();
    let at = Date.now();
    for (let i = 0; i < 5; i++) {
      shipping.failNext = 'Pickup address not verified';
      at += 6 * 60 * 60_000;
      await fulfilment.bookDue(new Date(at));
    }
    const shipment = await prisma.shipment.findFirstOrThrow();
    expect(shipment).toMatchObject({ attempts: 5, nextAttemptAt: null, status: 'PENDING' });
    const events = await prisma.orderEvent.findMany({ where: { type: 'shipment_failed' } });
    expect(events).toHaveLength(1);

    await outbox.dispatch();
    const alerts = sender.sent.filter((m) => m.to === 'team@noors.in');
    expect(alerts).toHaveLength(2); // the new order, then the booking problem
    expect(alerts[1]!.text).toContain('Pickup address not verified');
  });
});

describe('tracking', () => {
  async function shippedOrder() {
    const paid = await paidOrder();
    await fulfilment.bookDue();
    const { awb } = await prisma.shipment.findFirstOrThrow();
    return { ...paid, awb: awb! };
  }

  it('rejects updates without the webhook token and ignores unknown AWBs', async () => {
    const { awb } = await shippedOrder();
    expect((await courier({ awb, current_status: 'DELIVERED' }, 'wrong')).status).toBe(401);
    expect((await courier({ awb, current_status: 'DELIVERED' }, '')).status).toBe(401);
    expect((await courier({ awb: 'NOT-OURS', current_status: 'DELIVERED' })).status).toBe(200);
    expect((await prisma.order.findFirstOrThrow()).status).toBe('READY_TO_SHIP');
  });

  it('moves the order forward with each update and emails the customer once per step', async () => {
    const { result, awb } = await shippedOrder();

    await courier({
      awb,
      current_status: 'PICKED UP',
      etd: '2026-10-07 18:00:00',
      scans: [
        { date: '2026-10-04 10:00:00', activity: 'Shipment picked up', location: 'Srinagar' },
      ],
    }).expect(200);
    let order = await viewOrder(result);
    expect(order.status).toBe('SHIPPED');
    expect(order.shipment!.estimatedDelivery).toBe('2026-10-07T12:30:00.000Z');

    // Repeats and older statuses arriving late change nothing.
    await courier({ awb, current_status: 'IN TRANSIT' }).expect(200);
    await courier({ awb, current_status: 'PICKUP SCHEDULED' }).expect(200);

    await courier({
      awb,
      current_status: 'OUT FOR DELIVERY',
      scans: [
        { date: '2026-10-04 10:00:00', activity: 'Shipment picked up', location: 'Srinagar' },
        { date: '2026-10-06 08:15:00', activity: 'Out for delivery', location: 'Delhi' },
      ],
    }).expect(200);
    await courier({ awb, current_status: 'IN TRANSIT' }).expect(200);
    order = await viewOrder(result);
    expect(order.status).toBe('OUT_FOR_DELIVERY');

    await courier({ awb, current_status: 'DELIVERED' }).expect(200);
    await courier({ awb, current_status: 'DELIVERED' }).expect(200);
    order = await viewOrder(result);
    expect(order.status).toBe('DELIVERED');
    expect(order.timeline.map((t) => t.label)).toEqual([
      'Order placed',
      'Payment received',
      'Packed and handed to the courier',
      'Shipped',
      'Out for delivery',
      'Delivered',
    ]);

    await outbox.dispatch();
    const toCustomer = sender.sent.filter((m) => m.to === 'zoya@example.com').map((m) => m.subject);
    expect(toCustomer).toEqual([
      'Order NR-100001 confirmed',
      'Order NR-100001 is on its way',
      'Order NR-100001 is out for delivery',
      'Order NR-100001 was delivered',
    ]);

    const scans = await prisma.shipment.findFirstOrThrow();
    expect(scans.events).toHaveLength(2);
  });

  it('lets a shopper track an order with its number and phone only', async () => {
    const { result, awb } = await shippedOrder();
    await courier({
      awb,
      current_status: 'IN TRANSIT',
      scans: [{ date: '2026-10-04 10:00:00', activity: 'In transit', location: 'Jammu' }],
    }).expect(200);

    const res = await request(app).get(
      `/api/v1/track?order=${result.orderNumber.toLowerCase()}&phone=%2B91%2098765%2043210`,
    );
    expect(res.status).toBe(200);
    const body = res.body as TrackingDto;
    expect(body).toMatchObject({
      number: result.orderNumber,
      status: 'SHIPPED',
      shipment: { awb, courier: 'Mock Express' },
      scans: [{ status: 'In transit', location: 'Jammu', at: '2026-10-04T04:30:00.000Z' }],
    });
    // Nothing that would identify the shopper.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('Residency');
    expect(raw).not.toContain('zoya@example.com');

    const wrongPhone = await request(app).get(
      `/api/v1/track?order=${result.orderNumber}&phone=9999999999`,
    );
    expect(wrongPhone.status).toBe(404);
    const noOrder = await request(app).get('/api/v1/track?order=NR-999999&phone=9876543210');
    expect(noOrder.status).toBe(404);
    expect(noOrder.body.error.message).toBe(wrongPhone.body.error.message);
  });

  it('alerts the brand when a shipment comes back', async () => {
    const { awb } = await shippedOrder();
    await courier({ awb, current_status: 'IN TRANSIT' }).expect(200);
    await courier({ awb, current_status: 'RTO INITIATED' }).expect(200);
    expect((await prisma.shipment.findFirstOrThrow()).status).toBe('RTO');
    await courier({ awb, current_status: 'DELIVERED' }).expect(200);
    expect((await prisma.order.findFirstOrThrow()).status).toBe('SHIPPED');
    await outbox.dispatch();
    expect(sender.sent.some((m) => m.to === 'team@noors.in' && m.text.includes(awb))).toBe(true);
  });
});

describe('emails', () => {
  it('queues order emails once and retries failed sends', async () => {
    const { result } = await paidOrder();
    // The checkout page and the webhook both confirm; still one of each.
    const signed = gateway.pay(result.payment!.razorpayOrderId);
    await services.orders.markPaid({
      razorpayOrderId: result.payment!.razorpayOrderId,
      razorpayPaymentId: signed.razorpayPaymentId,
      source: 'webhook',
    });
    const queued = await prisma.email.findMany({ orderBy: { kind: 'asc' } });
    expect(queued.map((e) => [e.kind, e.to])).toEqual([
      ['new_order_alert', 'team@noors.in'],
      ['order_confirmed', 'zoya@example.com'],
    ]);
    const confirmation = queued.find((e) => e.kind === 'order_confirmed')!;
    expect(confirmation.html).toContain('Heritage Hoodie');
    expect(confirmation.html).toContain(`https://noors.in/track?order=${result.orderNumber}`);
    expect(confirmation.html).toContain('₹4,998');

    sender.failures = 1;
    expect(await outbox.dispatch()).toBe(1);
    let rows = await prisma.email.findMany({ orderBy: { kind: 'asc' } });
    const failed = rows.find((r) => r.status === 'PENDING')!;
    expect(failed).toMatchObject({ attempts: 1, lastError: 'Resend is down' });
    expect(failed.sendAfter.getTime()).toBeGreaterThan(Date.now());

    // Not due yet.
    expect(await outbox.dispatch()).toBe(0);
    await prisma.email.update({ where: { id: failed.id }, data: { sendAfter: new Date() } });
    expect(await outbox.dispatch()).toBe(1);
    rows = await prisma.email.findMany();
    expect(rows.every((r) => r.status === 'SENT')).toBe(true);
    expect(sender.sent).toHaveLength(2);
  });

  it('stops after five failed sends', async () => {
    await paidOrder();
    sender.failures = 100;
    for (let i = 0; i < 6; i++) {
      await prisma.email.updateMany({ data: { sendAfter: new Date(0) } });
      await outbox.dispatch();
    }
    const rows = await prisma.email.findMany();
    expect(rows.every((r) => r.status === 'FAILED' && r.attempts === 5)).toBe(true);
  });

  it('emails the shopper once when a payment attempt fails', async () => {
    const { res } = await placeOrder();
    const result = res.body as CheckoutResultDto;
    await services.orders.markFailed(result.payment!.razorpayOrderId, 'Card declined');
    await services.orders.markFailed(result.payment!.razorpayOrderId, 'Card declined');
    const rows = await prisma.email.findMany();
    expect(rows.map((r) => r.kind)).toEqual(['payment_failed']);
    expect(rows[0]!.to).toBe('zoya@example.com');
  });

  it('sends sign-in codes as a branded email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ email: 'zoya@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.devCode).toBeUndefined();
    const mail = sender.sent.at(-1)!;
    expect(mail.subject).toMatch(/^\d{6} is your Noor's sign-in code$/);
    expect(mail.html).toContain("NOOR'S");
  });
});

describe('courier statuses', () => {
  it('maps Shiprocket statuses and only moves forward', () => {
    expect(shipmentStatusOf('Picked Up')).toBe('IN_TRANSIT');
    expect(shipmentStatusOf('REACHED AT DESTINATION HUB')).toBe('IN_TRANSIT');
    expect(shipmentStatusOf('OUT FOR DELIVERY')).toBe('OUT_FOR_DELIVERY');
    expect(shipmentStatusOf('Delivered')).toBe('DELIVERED');
    expect(shipmentStatusOf('RTO IN TRANSIT')).toBe('RTO');
    expect(shipmentStatusOf('CANCELED')).toBe('CANCELLED');
    expect(shipmentStatusOf('PICKUP SCHEDULED')).toBeNull();
    expect(canMove('IN_TRANSIT', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canMove('OUT_FOR_DELIVERY', 'IN_TRANSIT')).toBe(false);
    expect(canMove('DELIVERED', 'RTO')).toBe(false);
    expect(canMove('IN_TRANSIT', 'CANCELLED')).toBe(false);
    expect(parseCourierDate('2026-10-04 10:00:00')?.toISOString()).toBe('2026-10-04T04:30:00.000Z');
    expect(parseCourierDate('not a date')).toBeNull();
  });
});
