import type {
  AdminCouponDto,
  AdminCustomerRowDto,
  AdminOrderDto,
  AdminOrderRowDto,
  AdminReturnDto,
  CheckoutResultDto,
  DashboardDto,
  OrderDto,
  Paginated,
} from '@noors/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createProduct, resetDatabase, testPrisma } from '../../../test/db.js';
import { createApp } from '../../app.js';
import { LogEmailSender } from '../../lib/email.js';
import { hashPassword } from '../../lib/password.js';
import { MockGateway } from '../../lib/payments.js';
import { MockShippingProvider } from '../../lib/shipping.js';
import { totpCode } from '../../lib/totp.js';
import { createServices } from '../../services.js';

const prisma = testPrisma();
const gateway = new MockGateway();
const shipping = new MockShippingProvider('courier-secret');
const services = createServices({
  prisma,
  paymentGateway: gateway,
  emailSender: new LogEmailSender(),
  shippingProvider: shipping,
  storeUrl: 'https://noors.in',
  alertEmail: 'team@noors.in',
});
const app = createApp({
  corsOrigins: ['http://localhost:3000'],
  prisma,
  services,
  loginRateLimit: 1000,
  storeRateLimits: { otp: 1000, checkout: 1000, track: 1000 },
});

const PASSWORD = 'correct-horse-battery';
let owner: string;
let staff: string;
let hoodie: string;
let tee: string;

const address = {
  name: 'Zoya Mir',
  phone: '9876543210',
  line1: '12 Residency Road',
  city: 'Srinagar',
  state: 'Jammu and Kashmir',
  pincode: '190001',
};

async function login(email: string, extra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/admin/auth/login')
    .send({ email, password: PASSWORD, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
}

const as = (cookie: string) => ({
  get: (url: string) => request(app).get(`/api/v1/admin${url}`).set('Cookie', cookie),
  post: (url: string) => request(app).post(`/api/v1/admin${url}`).set('Cookie', cookie),
  put: (url: string) => request(app).put(`/api/v1/admin${url}`).set('Cookie', cookie),
  patch: (url: string) => request(app).patch(`/api/v1/admin${url}`).set('Cookie', cookie),
  delete: (url: string) => request(app).delete(`/api/v1/admin${url}`).set('Cookie', cookie),
});

beforeEach(async () => {
  await resetDatabase(prisma);
  shipping.cancelled.length = 0;
  gateway.refunds.length = 0;
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.adminUser.createMany({
    data: [
      { email: 'owner@test.in', name: 'Owner', role: 'OWNER', passwordHash },
      { email: 'staff@test.in', name: 'Staff', role: 'STAFF', passwordHash },
    ],
  });
  owner = await login('owner@test.in');
  staff = await login('staff@test.in');
  const category = await prisma.category.create({ data: { slug: 'hoodies', name: 'Hoodies' } });
  await createProduct(prisma, {
    slug: 'heritage',
    name: 'Heritage Hoodie',
    categoryId: category.id,
    variants: [{ size: 'M', price: 249900, stock: 5 }],
  });
  await createProduct(prisma, {
    slug: 'tee',
    name: 'Chinar Tee',
    categoryId: category.id,
    variants: [{ size: 'M', price: 99900, stock: 20 }],
  });
  hoodie = (await prisma.variant.findUniqueOrThrow({ where: { sku: 'HERITAGE-M-X' } })).id;
  tee = (await prisma.variant.findUniqueOrThrow({ where: { sku: 'TEE-M-X' } })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A shopper's order: paid online unless `cod`. */
async function placeOrder(
  opts: {
    variant?: string;
    quantity?: number;
    cod?: boolean;
    email?: string;
    coupon?: string;
  } = {},
) {
  const agent = request.agent(app);
  await agent
    .post('/api/v1/cart/items')
    .send({ variantId: opts.variant ?? hoodie, quantity: opts.quantity ?? 2 });
  if (opts.coupon) await agent.post('/api/v1/cart/coupon').send({ code: opts.coupon });
  const res = await agent.post('/api/v1/checkout').send({
    email: opts.email ?? 'zoya@example.com',
    address,
    paymentMethod: opts.cod ? 'COD' : 'RAZORPAY',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const result = res.body as CheckoutResultDto;
  if (!opts.cod) {
    const signed = gateway.pay(result.payment!.razorpayOrderId);
    const paid = await agent
      .post('/api/v1/checkout/verify')
      .send({ orderNumber: result.orderNumber, ...signed });
    expect(paid.status).toBe(200);
  }
  return { agent, result, number: result.orderNumber };
}

const order = async (number: string) =>
  (await as(owner).get(`/orders/${number}`)).body as AdminOrderDto;
const stockOf = async (id: string) =>
  (await prisma.variant.findUniqueOrThrow({ where: { id } })).stock;
const emailKinds = async () =>
  (await prisma.email.findMany({ orderBy: { createdAt: 'asc' } })).map((e) => e.kind);

describe('orders', () => {
  it('lists, filters and searches orders', async () => {
    const a = await placeOrder();
    await placeOrder({ variant: tee, quantity: 1, email: 'aamir@example.com' });
    // An unpaid one stays out of the default list.
    const agent = request.agent(app);
    await agent.post('/api/v1/cart/items').send({ variantId: tee, quantity: 1 });
    await agent.post('/api/v1/checkout').send({ email: 'x@example.com', address });

    let res = await as(staff).get('/orders');
    const page = res.body as Paginated<AdminOrderRowDto>;
    expect(page.total).toBe(2);
    expect(page.items[0]).toMatchObject({
      name: 'Zoya Mir',
      city: 'Srinagar',
      paymentStatus: 'CAPTURED',
    });

    res = await as(staff).get('/orders?status=ALL');
    expect(res.body.total).toBe(3);
    res = await as(staff).get('/orders?q=aamir');
    expect(res.body.items.map((o: AdminOrderRowDto) => o.email)).toEqual(['aamir@example.com']);
    res = await as(staff).get(`/orders?q=${a.number.toLowerCase()}`);
    expect(res.body.items).toHaveLength(1);
    res = await as(staff).get('/orders?q=98765%2043210');
    expect(res.body.total).toBe(2);
    res = await as(staff).get('/orders?status=TO_SHIP&from=2020-01-01&to=2099-01-01');
    expect(res.body.total).toBe(2);
    res = await as(staff).get('/orders?from=2099-01-01');
    expect(res.body.total).toBe(0);

    const detail = await order(a.number);
    expect(detail).toMatchObject({
      number: a.number,
      paymentMethod: 'RAZORPAY',
      refundable: 499800,
      can: { book: false, markShipped: true, cancel: true, refund: true },
      items: [{ sku: 'HERITAGE-M-X', quantity: 2 }],
    });
    expect(detail.payments[0]).toMatchObject({ status: 'CAPTURED', amount: 499800 });
    expect(detail.shipments[0]).toMatchObject({ status: 'PENDING', retrying: true });
  });

  it('refunds part, then the rest, and never more than was paid', async () => {
    const { number } = await placeOrder();
    expect(
      (await as(staff).post(`/orders/${number}/refund`).send({ amount: 100, reason: 'x' })).status,
    ).toBe(403);

    let res = await as(owner)
      .post(`/orders/${number}/refund`)
      .send({ amount: 50000, reason: 'Late delivery' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    let o = res.body as AdminOrderDto;
    expect(o.refundable).toBe(449800);
    expect(o.payments[0]!.status).toBe('PARTIALLY_REFUNDED');
    expect(o.refunds[0]).toMatchObject({
      amount: 50000,
      status: 'PROCESSED',
      reason: 'Late delivery',
    });
    expect(o.events.at(-1)).toMatchObject({ type: 'refunded', by: 'Owner' });

    res = await as(owner).post(`/orders/${number}/refund`).send({ amount: 449801, reason: 'All' });
    expect(res.status).toBe(400);
    res = await as(owner).post(`/orders/${number}/refund`).send({ amount: 449800, reason: 'All' });
    o = res.body as AdminOrderDto;
    expect(o.payments[0]!.status).toBe('REFUNDED');
    expect(o.can.refund).toBe(false);
    expect(gateway.refunds.map((r) => r.amount)).toEqual([50000, 449800]);
    expect((await emailKinds()).filter((k) => k === 'refund_issued')).toHaveLength(2);
  });

  it('records a refund Razorpay turned down', async () => {
    const { number } = await placeOrder();
    gateway.failNextRefund = 'Payment too old';
    const res = await as(owner)
      .post(`/orders/${number}/refund`)
      .send({ amount: 1000, reason: 'x' });
    expect(res.status).toBe(502);
    const o = await order(number);
    expect(o.refunds[0]!.status).toBe('FAILED');
    expect(o.refundable).toBe(499800);
    const rows = (await as(owner).get('/orders')).body.items as AdminOrderRowDto[];
    expect(rows[0]!.attention).toBe('Refund failed');
  });

  it('cancels a booked order: Shiprocket, stock, coupon and refund', async () => {
    await prisma.coupon.create({ data: { code: 'FLAT300', type: 'FLAT', value: 30000 } });
    const { number } = await placeOrder({ coupon: 'FLAT300' });
    await services.fulfilment.bookDue();
    expect(await stockOf(hoodie)).toBe(3);
    expect((await as(staff).post(`/orders/${number}/cancel`).send({ reason: 'x' })).status).toBe(
      403,
    );

    const res = await as(owner).post(`/orders/${number}/cancel`).send({ reason: 'Customer asked' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const o = res.body as AdminOrderDto;
    expect(o.status).toBe('CANCELLED');
    expect(o.shipments[0]!.status).toBe('CANCELLED');
    expect(shipping.cancelled).toHaveLength(1);
    expect(o.refunds[0]).toMatchObject({ amount: 469800, status: 'PROCESSED' });
    expect(await stockOf(hoodie)).toBe(5);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code: 'FLAT300' } })).usedCount).toBe(
      0,
    );
    const cancelled = await prisma.email.findFirstOrThrow({ where: { kind: 'order_cancelled' } });
    expect(cancelled.text).toContain('₹4,698');
    expect(await emailKinds()).not.toContain('refund_issued');

    const again = await as(owner).post(`/orders/${number}/cancel`).send({ reason: 'again' });
    expect(again.status).toBe(409);
  });

  it('records a shipment booked by hand, then delivery', async () => {
    await prisma.setting.create({ data: { key: 'fulfilment', value: { autoShip: false } } });
    const { number } = await placeOrder();
    expect((await order(number)).can.book).toBe(true);

    let res = await as(staff)
      .post(`/orders/${number}/ship`)
      .send({ courier: 'India Post', awb: 'EK123456789IN', trackingUrl: '' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    let o = res.body as AdminOrderDto;
    expect(o.status).toBe('SHIPPED');
    expect(o.shipments[0]).toMatchObject({
      courier: 'India Post',
      awb: 'EK123456789IN',
      status: 'IN_TRANSIT',
    });
    expect(o.events.at(-1)).toMatchObject({ type: 'shipped', by: 'Staff' });

    res = await as(staff).post(`/orders/${number}/deliver`);
    o = res.body as AdminOrderDto;
    expect(o.status).toBe('DELIVERED');
    expect(o.shipments[0]!.status).toBe('DELIVERED');
    expect(await emailKinds()).toEqual(expect.arrayContaining(['shipped', 'delivered']));
    expect((await as(staff).post(`/orders/${number}/deliver`)).status).toBe(409);
  });

  it('books by hand when automatic shipping is off, and retries a stalled booking', async () => {
    await prisma.setting.create({ data: { key: 'fulfilment', value: { autoShip: false } } });
    const { number } = await placeOrder();
    shipping.failNext = 'Pickup address not verified';
    let o = (await as(staff).post(`/orders/${number}/book`)).body as AdminOrderDto;
    expect(o.shipments[0]).toMatchObject({
      lastError: 'Pickup address not verified',
      retrying: true,
    });
    expect(o.can.book).toBe(false);

    // Staff don't have to wait for the retry.
    await prisma.shipment.updateMany({ data: { nextAttemptAt: null } });
    o = (await as(staff).post(`/orders/${number}/book`)).body as AdminOrderDto;
    expect(o.status).toBe('READY_TO_SHIP');
    expect(o.shipments[0]).toMatchObject({
      status: 'PICKUP_SCHEDULED',
      awb: expect.stringMatching(/^MOCK/),
    });
    expect((await as(staff).post(`/orders/${number}/book`)).status).toBe(409);
  });

  it('keeps internal notes with who wrote them', async () => {
    const { number } = await placeOrder();
    const res = await as(staff).post(`/orders/${number}/notes`).send({ message: 'Gift wrap' });
    expect((res.body as AdminOrderDto).events.at(-1)).toMatchObject({
      type: 'note',
      message: 'Gift wrap',
      by: 'Staff',
    });
    // Not shown to the shopper.
    const { result } = await placeOrder();
    expect(result).toBeDefined();
  });
});

describe('cash on delivery', () => {
  it('is off by default', async () => {
    const options = await request(app).get('/api/v1/checkout/options');
    expect(options.body).toEqual({ cod: { enabled: false, fee: 0 } });
    const agent = request.agent(app);
    await agent.post('/api/v1/cart/items').send({ variantId: tee, quantity: 1 });
    const res = await agent
      .post('/api/v1/checkout')
      .send({ email: 'zoya@example.com', address, paymentMethod: 'COD' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('cod_unavailable');
  });

  it('places the order at once and counts it paid on delivery', async () => {
    await prisma.setting.create({ data: { key: 'cod', value: { enabled: true, fee: 4900 } } });
    const { agent, result, number } = await placeOrder({ cod: true });
    expect(result.payment).toBeNull();
    expect(await stockOf(hoodie)).toBe(3);
    expect((await agent.get('/api/v1/cart')).body.items).toEqual([]);

    const shopperView = (await agent.get(`/api/v1/orders/${number}?key=${result.accessToken}`))
      .body as OrderDto;
    expect(shopperView).toMatchObject({
      status: 'PAID',
      paymentMethod: 'COD',
      shippingFee: 4900,
      total: 499800 + 4900,
    });
    expect(shopperView.timeline.map((t) => t.label)).toContain(
      'Order confirmed (cash on delivery)',
    );

    await services.fulfilment.bookDue();
    expect(shipping.booked.at(-1)).toMatchObject({ paymentMethod: 'COD' });
    let o = await order(number);
    expect(o.payments[0]).toMatchObject({ provider: 'COD', status: 'CREATED' });
    expect(o.can.refund).toBe(false);

    o = (await as(staff).post(`/orders/${number}/deliver`)).body as AdminOrderDto;
    expect(o.payments[0]!.status).toBe('CAPTURED');
    expect(await emailKinds()).toEqual(
      expect.arrayContaining(['order_confirmed', 'new_order_alert', 'delivered']),
    );
  });
});

describe('returns', () => {
  async function deliveredOrder() {
    const placed = await placeOrder();
    await as(staff).post(`/orders/${placed.number}/deliver`);
    return placed;
  }

  it('lets a shopper ask once within the window, then staff complete it with a refund', async () => {
    const { agent, result, number } = await placeOrder();
    const items = (await order(number)).items;
    const body = {
      type: 'RETURN',
      reason: 'Too big',
      items: [{ orderItemId: items[0]!.id, quantity: 1 }],
    };
    const early = await agent
      .post(`/api/v1/orders/${number}/returns?key=${result.accessToken}`)
      .send(body);
    expect(early.status).toBe(409);

    await as(staff).post(`/orders/${number}/deliver`);
    const view = (await agent.get(`/api/v1/orders/${number}?key=${result.accessToken}`))
      .body as OrderDto;
    expect(view.returnableUntil).not.toBeNull();

    const tooMany = await agent
      .post(`/api/v1/orders/${number}/returns?key=${result.accessToken}`)
      .send({ ...body, items: [{ orderItemId: items[0]!.id, quantity: 3 }] });
    expect(tooMany.status).toBe(400);

    const res = await agent
      .post(`/api/v1/orders/${number}/returns?key=${result.accessToken}`)
      .send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((res.body as OrderDto).returns).toMatchObject([
      { type: 'RETURN', status: 'REQUESTED', items: [{ name: 'Heritage Hoodie', quantity: 1 }] },
    ]);
    expect((res.body as OrderDto).returnableUntil).toBeNull();
    expect(
      (await agent.post(`/api/v1/orders/${number}/returns?key=${result.accessToken}`).send(body))
        .status,
    ).toBe(409);
    expect(await emailKinds()).toEqual(
      expect.arrayContaining(['return_update', 'return_requested']),
    );

    const list = (await as(staff).get('/returns')).body as Paginated<AdminReturnDto>;
    expect(list.items).toHaveLength(1);
    const ret = list.items[0]!;
    expect(ret).toMatchObject({ orderNumber: number, itemsValue: 249900, name: 'Zoya Mir' });
    expect((await as(owner).get('/orders')).body.items[0].attention).toBe('Return requested');

    // Can't skip ahead from requested to received.
    expect((await as(staff).patch(`/returns/${ret.id}`).send({ status: 'RECEIVED' })).status).toBe(
      409,
    );
    expect(
      (
        await as(staff)
          .patch(`/returns/${ret.id}`)
          .send({ status: 'APPROVED', note: 'Pickup on Monday' })
      ).status,
    ).toBe(200);
    expect((await as(staff).patch(`/returns/${ret.id}`).send({ status: 'RECEIVED' })).status).toBe(
      200,
    );
    expect(
      (
        await as(staff)
          .patch(`/returns/${ret.id}`)
          .send({ status: 'COMPLETED', refundAmount: 249900 })
      ).status,
    ).toBe(403);
    const done = await as(owner)
      .patch(`/returns/${ret.id}`)
      .send({ status: 'COMPLETED', refundAmount: 249900, restock: true });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.status).toBe('COMPLETED');

    const o = await order(number);
    expect(o.status).toBe('RETURNED');
    expect(o.refunds[0]).toMatchObject({ amount: 249900, status: 'PROCESSED' });
    expect(await stockOf(hoodie)).toBe(4);
    const updates = await prisma.email.findMany({ where: { kind: 'return_update' } });
    expect(updates).toHaveLength(4); // requested, approved, received, completed
    expect(updates.find((e) => e.subject.includes('approved'))?.text).toContain('Pickup on Monday');
  });

  it('takes return requests from the tracking page with the phone number', async () => {
    const { number } = await deliveredOrder();
    const items = (await order(number)).items;
    const body = {
      order: number,
      phone: '9876543210',
      type: 'EXCHANGE',
      reason: 'Need a size L',
      items: [{ orderItemId: items[0]!.id, quantity: 1 }],
    };
    expect(
      (
        await request(app)
          .post('/api/v1/track/returns')
          .send({ ...body, phone: '9999999999' })
      ).status,
    ).toBe(404);
    const res = await request(app).post('/api/v1/track/returns').send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await prisma.returnRequest.count()).toBe(1);
  });

  it('respects the return window setting', async () => {
    await prisma.setting.create({ data: { key: 'returns', value: { windowDays: 0 } } });
    const { agent, result, number } = await deliveredOrder();
    const view = (await agent.get(`/api/v1/orders/${number}?key=${result.accessToken}`))
      .body as OrderDto;
    expect(view.returnableUntil).toBeNull();
  });
});

describe('customers', () => {
  it('lists customers with what they spent', async () => {
    const signedIn = request.agent(app);
    const code = await signedIn
      .post('/api/v1/auth/otp/request')
      .send({ email: 'zoya@example.com' });
    await signedIn
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'zoya@example.com', code: code.body.devCode });
    const { number } = await placeOrder();
    await placeOrder({ variant: tee, quantity: 1 });
    await as(owner).post(`/orders/${number}/refund`).send({ amount: 10000, reason: 'Goodwill' });

    const res = await as(staff).get('/customers?q=zoya');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = res.body as Paginated<AdminCustomerRowDto>;
    expect(rows.items).toMatchObject([
      { email: 'zoya@example.com', orderCount: 2, totalSpent: 499800 + 99900 + 9900 - 10000 },
    ]);
    const detail = await as(staff).get(`/customers/${rows.items[0]!.id}`);
    expect(detail.body.orders).toHaveLength(2);
  });
});

describe('coupons', () => {
  it('creates, edits and retires coupons; owners only', async () => {
    expect((await as(staff).get('/coupons')).status).toBe(403);
    const bad = await as(owner).post('/coupons').send({ code: 'BIG', type: 'PERCENT', value: 150 });
    expect(bad.status).toBe(400);
    const res = await as(owner).post('/coupons').send({
      code: 'diwali20',
      type: 'PERCENT',
      value: 20,
      maxDiscount: 50000,
      minOrderValue: '',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const coupon = res.body as AdminCouponDto;
    expect(coupon).toMatchObject({
      code: 'DIWALI20',
      description: '20% off, up to ₹500',
      minOrderValue: null,
    });

    const edited = await as(owner)
      .put(`/coupons/${coupon.id}`)
      .send({ code: 'DIWALI20', type: 'FLAT', value: 20000 });
    expect(edited.body).toMatchObject({ type: 'FLAT', maxDiscount: null });

    // A used coupon is switched off rather than deleted.
    await placeOrder({ coupon: 'DIWALI20' });
    expect((await as(owner).delete(`/coupons/${coupon.id}`)).body).toEqual({ deleted: false });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).isActive).toBe(
      false,
    );
  });
});

describe('inventory', () => {
  it('adjusts stock with a reason, never below held units, and logs who did it', async () => {
    let res = await as(staff)
      .post('/inventory/adjust')
      .send({ variantId: hoodie, change: 10, reason: 'restock', note: 'New batch' });
    expect(res.body).toEqual({ stock: 15 });

    // Two units held by an unpaid checkout.
    const agent = request.agent(app);
    await agent.post('/api/v1/cart/items').send({ variantId: hoodie, quantity: 2 });
    await agent.post('/api/v1/checkout').send({ email: 'x@example.com', address });
    res = await as(staff)
      .post('/inventory/adjust')
      .send({ variantId: hoodie, change: -14, reason: 'damaged' });
    expect(res.status).toBe(409);
    res = await as(staff)
      .post('/inventory/adjust')
      .send({ variantId: hoodie, change: -13, reason: 'damaged' });
    expect(res.body).toEqual({ stock: 2 });

    const log = (await as(staff).get(`/inventory/log?variantId=${hoodie}`)).body;
    expect(
      log.items.map((l: { change: number; reason: string; by: string }) => [
        l.change,
        l.reason,
        l.by,
      ]),
    ).toEqual([
      [-13, 'damaged', 'Staff'],
      [10, 'restock: New batch', 'Staff'],
    ]);

    const low = (await as(staff).get('/inventory?low=true')).body;
    expect(low.threshold).toBe(3);
    expect(low.items.map((r: { sku: string }) => r.sku)).toEqual(['HERITAGE-M-X']);
    expect((await as(staff).get('/inventory?q=chinar')).body.items).toMatchObject([
      { sku: 'TEE-M-X', stock: 20 },
    ]);
  });
});

describe('reports', () => {
  it('sums sales and lists best sellers; owners only', async () => {
    await placeOrder();
    await placeOrder({ variant: tee, quantity: 3 });
    expect((await as(staff).get('/reports/dashboard')).status).toBe(403);
    const res = await as(owner).get('/reports/dashboard?days=7');
    const d = res.body as DashboardDto;
    expect(d.revenue).toHaveLength(7);
    expect(d.today).toEqual({ sales: 499800 + 299700, orders: 2 });
    expect(d.totals).toMatchObject({ orders: 2, averageOrder: Math.round((499800 + 299700) / 2) });
    expect(d.toShip).toBe(2);
    expect(d.bestSellers.map((b) => [b.name, b.units])).toEqual([
      ['Chinar Tee', 3],
      ['Heritage Hoodie', 2],
    ]);
    expect(d.lowStock).toBe(1);
    expect((await as(owner).get('/reports/dashboard?days=12')).status).toBe(400);
  });
});

describe('settings', () => {
  it('saves settings that the shop uses straight away', async () => {
    expect((await as(staff).get('/settings')).status).toBe(403);
    const current = (await as(owner).get('/settings')).body;
    expect(current).toMatchObject({
      shipping: { flatFee: 9900, freeFrom: 199900 },
      returns: { windowDays: 7 },
      integrations: { payments: 'mock', shipping: 'mock', email: 'log' },
    });
    const rest = { ...current };
    delete rest.integrations;
    const bad = await as(owner)
      .put('/settings')
      .send({ ...rest, store: { ...rest.store, gstNumber: '123' } });
    expect(bad.status).toBe(400);
    const res = await as(owner)
      .put('/settings')
      .send({
        ...rest,
        shipping: { flatFee: 5000, freeFrom: null },
        store: { ...rest.store, gstNumber: '01abcde1234f1z5' },
      });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.store.gstNumber).toBe('01ABCDE1234F1Z5');

    const agent = request.agent(app);
    const cart = await agent.post('/api/v1/cart/items').send({ variantId: hoodie, quantity: 2 });
    expect(cart.body).toMatchObject({ shippingFee: 5000, freeShippingFrom: null });
  });
});

describe('staff and sign-in', () => {
  it('adds staff, keeps one owner, and signs out switched-off accounts', async () => {
    expect((await as(staff).get('/staff')).status).toBe(403);
    const res = await as(owner)
      .post('/staff')
      .send({ email: 'Packer@Test.in', name: 'Packer', password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ email: 'packer@test.in', role: 'STAFF', twoFactor: false });
    const packer = await login('packer@test.in');
    expect((await as(packer).get('/orders')).status).toBe(200);

    expect((await as(owner).patch(`/staff/${res.body.id}`).send({ isActive: false })).status).toBe(
      200,
    );
    expect((await as(packer).get('/orders')).status).toBe(401);

    const me = (await as(owner).get('/auth/me')).body.admin;
    const demote = await as(owner).patch(`/staff/${me.id}`).send({ role: 'STAFF' });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe('last_owner');
  });

  it('turns on two-factor sign-in and then asks for the code', async () => {
    const setup = (await as(staff).post('/auth/2fa/setup')).body as { secret: string; uri: string };
    expect(setup.uri).toContain('otpauth://totp/');
    const step = Math.floor(Date.now() / 30_000);
    expect(
      (await as(staff).post('/auth/2fa/enable').send({ secret: setup.secret, code: '000000' }))
        .status,
    ).toBe(400);
    const on = await as(staff)
      .post('/auth/2fa/enable')
      .send({ secret: setup.secret, code: totpCode(setup.secret, step) });
    expect(on.body.admin.twoFactor).toBe(true);
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'staff@test.in' } });
    expect(stored.totpSecret).not.toContain(setup.secret);

    const noCode = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'staff@test.in', password: PASSWORD });
    expect(noCode.status).toBe(401);
    expect(noCode.body.error.code).toBe('two_factor_required');
    const wrong = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'staff@test.in', password: PASSWORD, code: totpCode(setup.secret, step + 5) });
    expect(wrong.body.error.code).toBe('invalid_code');
    await login('staff@test.in', { code: totpCode(setup.secret, step) });

    // An owner can switch it off for someone who lost their phone.
    const id = stored.id;
    await as(owner).patch(`/staff/${id}`).send({ resetTwoFactor: true });
    await login('staff@test.in');
  });

  it('changes your own password', async () => {
    const wrong = await as(staff)
      .post('/auth/password')
      .send({ current: 'nope', next: 'a-new-password-1' });
    expect(wrong.status).toBe(400);
    expect(
      (await as(staff).post('/auth/password').send({ current: PASSWORD, next: 'short' })).status,
    ).toBe(400);
    expect(
      (await as(staff).post('/auth/password').send({ current: PASSWORD, next: 'a-new-password-1' }))
        .status,
    ).toBe(204);
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'staff@test.in', password: 'a-new-password-1' });
    expect(res.status).toBe(200);
  });
});
