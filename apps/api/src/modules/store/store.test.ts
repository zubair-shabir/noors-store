import type { CartDto, CheckoutResultDto, OrderDto } from '@noors/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createProduct, resetDatabase, testPrisma } from '../../../test/db.js';
import { createApp } from '../../app.js';
import { LogEmailSender } from '../../lib/email.js';
import { MockGateway } from '../../lib/payments.js';
import { createServices } from '../../services.js';

const prisma = testPrisma();
const gateway = new MockGateway();
const email = new LogEmailSender();
const services = createServices({ prisma, paymentGateway: gateway, emailSender: email });
const app = createApp({
  corsOrigins: ['http://localhost:3000'],
  prisma,
  services,
  storeRateLimits: { otp: 1000, checkout: 1000 },
});
const { orders } = services;

const address = {
  name: 'Zoya Mir',
  phone: '+91 98765 43210',
  line1: '12 Residency Road',
  city: 'Srinagar',
  state: 'Jammu and Kashmir',
  pincode: '190001',
};

let hoodie: { m: string; l: string; xl: string };
let tee: string;

async function variantId(sku: string) {
  return (await prisma.variant.findUniqueOrThrow({ where: { sku } })).id;
}

beforeEach(async () => {
  await resetDatabase(prisma);
  const category = await prisma.category.create({ data: { slug: 'hoodies', name: 'Hoodies' } });
  await createProduct(prisma, {
    slug: 'heritage',
    name: 'Heritage Hoodie',
    categoryId: category.id,
    variants: [
      { size: 'M', price: 249900, stock: 5 },
      { size: 'L', price: 259900, stock: 1 },
      { size: 'XL', price: 249900, stock: 0 },
    ],
  });
  await createProduct(prisma, {
    slug: 'tee',
    name: 'Chinar Tee',
    categoryId: category.id,
    variants: [{ size: 'M', price: 99900, stock: 20 }],
  });
  hoodie = {
    m: await variantId('HERITAGE-M-X'),
    l: await variantId('HERITAGE-L-X'),
    xl: await variantId('HERITAGE-XL-X'),
  };
  tee = await variantId('TEE-M-X');
});

afterAll(async () => {
  await prisma.$disconnect();
});

const shopper = () => request.agent(app);

async function addToCart(agent: ReturnType<typeof shopper>, id: string, quantity = 1) {
  const res = await agent.post('/api/v1/cart/items').send({ variantId: id, quantity });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as CartDto;
}

async function checkout(agent: ReturnType<typeof shopper>, body: Record<string, unknown> = {}) {
  return agent.post('/api/v1/checkout').send({ email: 'zoya@example.com', address, ...body });
}

async function pay(agent: ReturnType<typeof shopper>, result: CheckoutResultDto) {
  const signed = gateway.pay(result.payment.razorpayOrderId);
  return agent.post('/api/v1/checkout/verify').send({ orderNumber: result.orderNumber, ...signed });
}

async function signIn(agent: ReturnType<typeof shopper>, address = 'zoya@example.com') {
  const sent = await agent.post('/api/v1/auth/otp/request').send({ email: address });
  expect(sent.status).toBe(200);
  const res = await agent
    .post('/api/v1/auth/otp/verify')
    .send({ email: address, code: sent.body.devCode });
  expect(res.status).toBe(200);
  return res.body.customer as { id: string; email: string };
}

const variant = (id: string) => prisma.variant.findUniqueOrThrow({ where: { id } });

describe('cart', () => {
  it('starts empty without creating anything', async () => {
    const res = await shopper().get('/api/v1/cart');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], itemCount: 0, total: 0, ready: false });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await prisma.cart.count()).toBe(0);
  });

  it('keeps a guest cart in an httpOnly cookie and prices it on the server', async () => {
    const agent = shopper();
    const first = await agent.post('/api/v1/cart/items').send({ variantId: tee, quantity: 1 });
    expect(first.headers['set-cookie']?.[0]).toMatch(/^noors_cart=.+HttpOnly/);
    const cart = await addToCart(agent, tee, 1);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({
      name: 'Chinar Tee',
      title: 'M',
      quantity: 2,
      unitPrice: 99900,
      lineTotal: 199800,
      issue: null,
    });
    // ₹1,998 is under the ₹1,999 free-shipping line.
    expect(cart).toMatchObject({ subtotal: 199800, shippingFee: 9900, total: 209700, ready: true });

    const more = await addToCart(agent, hoodie.m);
    expect(more).toMatchObject({ itemCount: 3, shippingFee: 0, total: 199800 + 249900 });
  });

  it('refuses more than is in stock, sold-out sizes and unknown items', async () => {
    const agent = shopper();
    await addToCart(agent, hoodie.l);
    const tooMany = await agent.post('/api/v1/cart/items').send({ variantId: hoodie.l });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error.message).toBe('Only 1 left in stock');

    const soldOut = await agent.post('/api/v1/cart/items').send({ variantId: hoodie.xl });
    expect(soldOut.status).toBe(409);
    const unknown = await agent.post('/api/v1/cart/items').send({ variantId: 'nope' });
    expect(unknown.status).toBe(404);
    const overLimit = await agent.post('/api/v1/cart/items').send({ variantId: tee, quantity: 11 });
    expect(overLimit.status).toBe(400);
  });

  it('updates and removes lines, and flags lines whose stock ran out', async () => {
    const agent = shopper();
    const cart = await addToCart(agent, hoodie.m, 2);
    const line = cart.items[0]!;

    const changed = await agent.patch(`/api/v1/cart/items/${line.id}`).send({ quantity: 4 });
    expect(changed.body.items[0].quantity).toBe(4);

    await prisma.variant.update({ where: { id: hoodie.m }, data: { stock: 3 } });
    const flagged = (await agent.get('/api/v1/cart')).body as CartDto;
    expect(flagged.items[0]).toMatchObject({ issue: 'not_enough_stock', maxQuantity: 3 });
    expect(flagged.ready).toBe(false);
    expect((await checkout(agent)).status).toBe(409);

    // Lowering is allowed even below the old quantity.
    const lowered = await agent.patch(`/api/v1/cart/items/${line.id}`).send({ quantity: 3 });
    expect(lowered.body.ready).toBe(true);

    const removed = await agent.delete(`/api/v1/cart/items/${line.id}`);
    expect(removed.body.items).toEqual([]);
  });

  it("can't touch another shopper's lines", async () => {
    const mine = await addToCart(shopper(), tee);
    const res = await shopper()
      .patch(`/api/v1/cart/items/${mine.items[0]!.id}`)
      .send({ quantity: 2 });
    expect(res.status).toBe(404);
  });

  it('blocks cart changes posted from another site', async () => {
    const res = await shopper()
      .post('/api/v1/cart/items')
      .set('Origin', 'https://evil.example')
      .send({ variantId: tee });
    expect(res.status).toBe(403);
  });
});

describe('coupons', () => {
  it('applies a percentage code with its cap and minimum', async () => {
    await prisma.coupon.create({
      data: {
        code: 'WINTER50',
        type: 'PERCENT',
        value: 50,
        maxDiscount: 100000,
        minOrderValue: 200000,
      },
    });
    const agent = shopper();
    await addToCart(agent, tee);
    const tooSmall = await agent.post('/api/v1/cart/coupon').send({ code: 'winter50' });
    expect(tooSmall.status).toBe(422);
    expect(tooSmall.body.error.message).toBe('Add ₹1,001 more to use this code');

    await addToCart(agent, hoodie.m);
    const res = await agent.post('/api/v1/cart/coupon').send({ code: ' winter50 ' });
    expect(res.status).toBe(200);
    // 50% of ₹3,498 is ₹1,749, capped at ₹1,000. ₹2,498 left, so shipping is free.
    expect(res.body).toMatchObject({
      subtotal: 349800,
      discount: 100000,
      shippingFee: 0,
      total: 249800,
      coupon: { code: 'WINTER50', description: '50% off, up to ₹1,000' },
    });

    // Dropping below the minimum keeps the code on the cart but stops the discount.
    const hoodieLine = (res.body as CartDto).items.find((i) => i.variantId === hoodie.m)!;
    const smaller = await agent.delete(`/api/v1/cart/items/${hoodieLine.id}`);
    expect(smaller.body).toMatchObject({ discount: 0, coupon: null });
    expect(smaller.body.couponError).toMatch(/more to use this code/);

    const cleared = await agent.delete('/api/v1/cart/coupon');
    expect(cleared.body.couponError).toBeNull();
  });

  it('rounds percentage discounts down to whole rupees', async () => {
    await prisma.coupon.create({ data: { code: 'HALF', type: 'PERCENT', value: 50 } });
    const agent = shopper();
    await addToCart(agent, hoodie.m);
    const res = await agent.post('/api/v1/cart/coupon').send({ code: 'HALF' });
    // 50% of ₹2,499 is ₹1,249.50.
    expect(res.body).toMatchObject({ discount: 124900, shippingFee: 9900, total: 125000 + 9900 });
  });

  it('rejects unknown, expired and used-up codes', async () => {
    await prisma.coupon.createMany({
      data: [
        { code: 'OLD', type: 'FLAT', value: 10000, expiresAt: new Date(Date.now() - 1000) },
        { code: 'GONE', type: 'FLAT', value: 10000, usageLimit: 1, usedCount: 1 },
      ],
    });
    const agent = shopper();
    await addToCart(agent, tee);
    const messages = await Promise.all(
      ['NOPE', 'OLD', 'GONE'].map(async (code) => {
        const res = await agent.post('/api/v1/cart/coupon').send({ code });
        expect(res.status).toBe(422);
        return res.body.error.message;
      }),
    );
    expect(messages).toEqual([
      'This code is not valid',
      'This code has expired',
      'This code has been fully used',
    ]);
  });
});

describe('customer sign-in', () => {
  it('signs in with an emailed code and merges the guest cart', async () => {
    const agent = shopper();
    await addToCart(agent, tee, 2);
    const sent = await agent.post('/api/v1/auth/otp/request').send({ email: 'Zoya@Example.com' });
    expect(sent.body).toMatchObject({ expiresIn: 600, devCode: expect.stringMatching(/^\d{6}$/) });
    expect(email.sent.at(-1)).toMatchObject({ to: 'zoya@example.com' });
    expect(email.sent.at(-1)!.text).toContain(sent.body.devCode);
    const stored = await prisma.otpCode.findFirstOrThrow();
    expect(stored.codeHash).not.toContain(sent.body.devCode);

    const res = await agent
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'zoya@example.com', code: sent.body.devCode });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => /^noors_customer=.+HttpOnly/.test(c))).toBe(true);
    expect(cookies.some((c) => /^noors_cart=;/.test(c))).toBe(true);

    expect((await agent.get('/api/v1/me')).body.customer).toMatchObject({
      email: 'zoya@example.com',
    });
    const cart = (await agent.get('/api/v1/cart')).body as CartDto;
    expect(cart.itemCount).toBe(2);
    const carts = await prisma.cart.findMany();
    expect(carts).toHaveLength(1);
    expect(carts[0]!.customerId).not.toBeNull();

    // The code works once.
    const again = await shopper()
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'zoya@example.com', code: sent.body.devCode });
    expect(again.status).toBe(400);

    await agent.post('/api/v1/auth/logout');
    expect((await agent.get('/api/v1/me')).body.customer).toBeNull();
  });

  it('locks a code after five wrong guesses', async () => {
    const agent = shopper();
    const sent = await agent.post('/api/v1/auth/otp/request').send({ email: 'a@example.com' });
    const wrong = sent.body.devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const res = await agent
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'a@example.com', code: wrong });
      expect(res.status).toBe(400);
    }
    const locked = await agent
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'a@example.com', code: sent.body.devCode });
    expect(locked.status).toBe(429);
  });

  it('limits how many codes one address can be sent', async () => {
    const agent = shopper();
    for (let i = 0; i < 3; i++) {
      expect(
        (await agent.post('/api/v1/auth/otp/request').send({ email: 'b@example.com' })).status,
      ).toBe(200);
    }
    expect(
      (await agent.post('/api/v1/auth/otp/request').send({ email: 'b@example.com' })).status,
    ).toBe(429);
  });

  it('manages saved addresses with one default', async () => {
    const agent = shopper();
    expect((await agent.get('/api/v1/me/addresses')).status).toBe(401);
    await signIn(agent);
    const first = await agent.post('/api/v1/me/addresses').send(address);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ phone: '9876543210', isDefault: true, line2: null });
    const second = await agent
      .post('/api/v1/me/addresses')
      .send({ ...address, line1: '4 Boulevard', isDefault: true });
    const list = (await agent.get('/api/v1/me/addresses')).body.items;
    expect(list.map((a: { id: string }) => a.id)).toEqual([second.body.id, first.body.id]);
    expect(list[1].isDefault).toBe(false);

    const bad = await agent.post('/api/v1/me/addresses').send({ ...address, pincode: '012345' });
    expect(bad.status).toBe(400);

    await agent.delete(`/api/v1/me/addresses/${second.body.id}`);
    const after = (await agent.get('/api/v1/me/addresses')).body.items;
    expect(after).toHaveLength(1);
    expect(after[0].isDefault).toBe(true);

    // Someone else's address is out of reach.
    const other = shopper();
    await signIn(other, 'other@example.com');
    expect((await other.delete(`/api/v1/me/addresses/${first.body.id}`)).status).toBe(404);
  });
});

describe('checkout', () => {
  it('holds stock, takes payment and confirms the order', async () => {
    await prisma.coupon.create({ data: { code: 'FLAT300', type: 'FLAT', value: 30000 } });
    const agent = shopper();
    await addToCart(agent, hoodie.m, 2);
    await agent.post('/api/v1/cart/coupon').send({ code: 'FLAT300' });

    const res = await checkout(agent, { notes: 'Gift wrap please' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const result = res.body as CheckoutResultDto;
    expect(result.orderNumber).toBe('NR-100001');
    expect(result.payment).toMatchObject({
      mode: 'mock',
      amount: 499800 - 30000,
      currency: 'INR',
      prefill: { email: 'zoya@example.com', contact: '9876543210', name: 'Zoya Mir' },
    });

    const held = await variant(hoodie.m);
    expect(held).toMatchObject({ stock: 5, reserved: 2 });
    expect(await prisma.coupon.findUnique({ where: { code: 'FLAT300' } })).toMatchObject({
      usedCount: 1,
    });
    // Others now see only 3 free.
    const other = shopper();
    const tooMany = await other
      .post('/api/v1/cart/items')
      .send({ variantId: hoodie.m, quantity: 4 });
    expect(tooMany.status).toBe(409);

    const pending = await agent.get(
      `/api/v1/orders/${result.orderNumber}?key=${result.accessToken}`,
    );
    expect(pending.body).toMatchObject({ status: 'PENDING_PAYMENT', total: 469800 });
    expect(pending.body.expiresAt).toBe(result.expiresAt);

    const paid = await pay(agent, result);
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    const order = paid.body as OrderDto;
    expect(order).toMatchObject({
      number: 'NR-100001',
      status: 'PAID',
      subtotal: 499800,
      discount: 30000,
      shippingFee: 0,
      total: 469800,
      couponCode: 'FLAT300',
      expiresAt: null,
      shippingAddress: { ...address, phone: '9876543210', line2: null },
      items: [
        { name: 'Heritage Hoodie', title: 'M', sku: 'HERITAGE-M-X', quantity: 2, slug: 'heritage' },
      ],
    });
    expect(await variant(hoodie.m)).toMatchObject({ stock: 3, reserved: 0 });
    expect((await agent.get('/api/v1/cart')).body).toMatchObject({ items: [], coupon: null });
    const log = await prisma.inventoryLog.findMany();
    expect(log).toMatchObject([{ variantId: hoodie.m, change: -2, reason: 'order' }]);

    // Paying twice (checkout page and webhook) changes nothing more.
    const again = await pay(agent, result);
    expect(again.status).toBe(200);
    expect(await variant(hoodie.m)).toMatchObject({ stock: 3, reserved: 0 });
    const events = await prisma.orderEvent.findMany({ orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.type)).toEqual(['created', 'paid']);
  });

  it('never trusts a forged payment signature', async () => {
    const agent = shopper();
    await addToCart(agent, tee);
    const result = (await checkout(agent)).body as CheckoutResultDto;
    const res = await agent.post('/api/v1/checkout/verify').send({
      orderNumber: result.orderNumber,
      razorpayOrderId: result.payment.razorpayOrderId,
      razorpayPaymentId: 'pay_fake',
      razorpaySignature: 'f'.repeat(64),
    });
    expect(res.status).toBe(400);
    expect((await prisma.order.findFirstOrThrow()).status).toBe('PENDING_PAYMENT');

    // A real signature for a different order doesn't confirm this one either.
    const otherAgent = shopper();
    await addToCart(otherAgent, tee);
    const other = (await checkout(otherAgent)).body as CheckoutResultDto;
    const signed = gateway.pay(other.payment.razorpayOrderId);
    const swapped = await agent
      .post('/api/v1/checkout/verify')
      .send({ orderNumber: result.orderNumber, ...signed });
    expect(swapped.status).toBe(404);
  });

  it('lets only one of two shoppers buy the last unit', async () => {
    const a = shopper();
    const b = shopper();
    await addToCart(a, hoodie.l);
    await addToCart(b, hoodie.l);
    const results = await Promise.all([checkout(a), checkout(b)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await variant(hoodie.l)).toMatchObject({ stock: 1, reserved: 1 });
    expect(await prisma.order.count()).toBe(1);
  });

  it('refuses an empty bag and a bad address', async () => {
    const agent = shopper();
    expect((await checkout(agent)).status).toBe(400);
    await addToCart(agent, tee);
    const res = await checkout(agent, { address: { ...address, phone: '12345' } });
    expect(res.status).toBe(400);
  });

  it('releases stock and the coupon when an order is not paid in time', async () => {
    await prisma.coupon.create({
      data: { code: 'ONCE', type: 'FLAT', value: 10000, usageLimit: 1 },
    });
    const agent = shopper();
    await addToCart(agent, hoodie.m, 3);
    await agent.post('/api/v1/cart/coupon').send({ code: 'ONCE' });
    const result = (await checkout(agent)).body as CheckoutResultDto;
    expect(await variant(hoodie.m)).toMatchObject({ reserved: 3 });

    expect(await orders.releaseExpired(new Date())).toBe(0);
    expect(await orders.releaseExpired(new Date(Date.now() + 31 * 60 * 1000))).toBe(1);
    expect(await variant(hoodie.m)).toMatchObject({ stock: 5, reserved: 0 });
    expect(await prisma.coupon.findUnique({ where: { code: 'ONCE' } })).toMatchObject({
      usedCount: 0,
    });
    const order = await agent.get(`/api/v1/orders/${result.orderNumber}?key=${result.accessToken}`);
    expect(order.body.status).toBe('CANCELLED');
    // The cart is untouched, so the shopper can try again.
    expect((await agent.get('/api/v1/cart')).body.itemCount).toBe(3);
  });

  it('confirms a payment that arrives after expiry when the stock is still there', async () => {
    const agent = shopper();
    await addToCart(agent, hoodie.m, 2);
    const result = (await checkout(agent)).body as CheckoutResultDto;
    await orders.releaseExpired(new Date(Date.now() + 31 * 60 * 1000));

    const paid = await pay(agent, result);
    expect(paid.body.status).toBe('PAID');
    expect(await variant(hoodie.m)).toMatchObject({ stock: 3, reserved: 0 });
  });

  it('flags a refund when a late payment finds the items sold out', async () => {
    const late = shopper();
    await addToCart(late, hoodie.l);
    const result = (await checkout(late)).body as CheckoutResultDto;
    await orders.releaseExpired(new Date(Date.now() + 31 * 60 * 1000));

    const fast = shopper();
    await addToCart(fast, hoodie.l);
    await pay(fast, (await checkout(fast)).body as CheckoutResultDto);

    const res = await pay(late, result);
    expect(res.body.status).toBe('CANCELLED');
    const order = await prisma.order.findUniqueOrThrow({
      where: { number: result.orderNumber },
      include: { payments: true, events: true },
    });
    expect(order.payments[0]!.status).toBe('CAPTURED');
    expect(order.events.map((e) => e.type)).toContain('payment_needs_refund');
    expect(await variant(hoodie.l)).toMatchObject({ stock: 0, reserved: 0 });
  });

  it('gives up an unpaid order when the shopper starts again', async () => {
    const agent = shopper();
    await addToCart(agent, hoodie.m);
    const result = (await checkout(agent)).body as CheckoutResultDto;
    const wrong = await agent
      .post('/api/v1/checkout/abandon')
      .send({ orderNumber: result.orderNumber, accessToken: 'nope' });
    expect(wrong.status).toBe(404);
    const res = await agent
      .post('/api/v1/checkout/abandon')
      .send({ orderNumber: result.orderNumber, accessToken: result.accessToken });
    expect(res.status).toBe(204);
    expect(await variant(hoodie.m)).toMatchObject({ reserved: 0 });
  });

  it('keeps order pages private to their link and their customer', async () => {
    const agent = shopper();
    await addToCart(agent, tee);
    const result = (await checkout(agent)).body as CheckoutResultDto;
    await pay(agent, result);
    expect((await shopper().get(`/api/v1/orders/${result.orderNumber}?key=wrong`)).status).toBe(
      404,
    );
    expect((await shopper().get(`/api/v1/orders/${result.orderNumber}`)).status).toBe(400);

    // The guest's order shows up once they sign in with the same email.
    const account = shopper();
    await signIn(account, 'zoya@example.com');
    const list = await account.get('/api/v1/me/orders');
    expect(list.body.items).toMatchObject([
      { number: result.orderNumber, status: 'PAID', itemCount: 1, total: 99900 + 9900 },
    ]);
    expect((await account.get(`/api/v1/me/orders/${result.orderNumber}`)).status).toBe(200);

    const stranger = shopper();
    await signIn(stranger, 'someone@example.com');
    expect((await stranger.get(`/api/v1/me/orders/${result.orderNumber}`)).status).toBe(404);
  });

  it('saves the address and details of a signed-in shopper', async () => {
    const agent = shopper();
    await signIn(agent);
    await addToCart(agent, tee);
    const res = await checkout(agent, { email: 'ignored@example.com', saveAddress: true });
    expect(res.status).toBe(201);
    const order = await prisma.order.findFirstOrThrow();
    expect(order.email).toBe('zoya@example.com');
    expect(order.customerId).not.toBeNull();
    const customer = await prisma.customer.findFirstOrThrow({ include: { addresses: true } });
    expect(customer).toMatchObject({ name: 'Zoya Mir', phone: '9876543210' });
    expect(customer.addresses).toMatchObject([{ line1: '12 Residency Road', isDefault: true }]);
  });

  it('applies first-order codes only to first orders', async () => {
    await prisma.coupon.create({
      data: { code: 'WELCOME10', type: 'PERCENT', value: 10, firstOrderOnly: true },
    });
    const first = shopper();
    await addToCart(first, tee);
    await pay(first, (await checkout(first)).body as CheckoutResultDto);

    const second = shopper();
    await addToCart(second, tee);
    // A guest isn't known yet, so the code goes on; checkout checks the email.
    expect((await second.post('/api/v1/cart/coupon').send({ code: 'WELCOME10' })).status).toBe(200);
    const res = await checkout(second);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('This code is for first orders only');
  });
});

describe('Razorpay webhooks', () => {
  const send = (body: unknown, opts: { signature?: string; eventId?: string } = {}) => {
    const raw = JSON.stringify(body);
    return request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', opts.signature ?? gateway.signWebhook(raw))
      .set('X-Razorpay-Event-Id', opts.eventId ?? `evt_${Math.random()}`)
      .send(raw);
  };

  const captured = (orderId: string, amount: number) => ({
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: 'pay_webhook1', order_id: orderId, amount, method: 'upi' } },
    },
  });

  let result: CheckoutResultDto;
  beforeEach(async () => {
    const agent = shopper();
    await addToCart(agent, hoodie.m);
    result = (await checkout(agent)).body as CheckoutResultDto;
  });

  it('confirms the order when the shopper closed the tab after paying', async () => {
    const res = await send(captured(result.payment.razorpayOrderId, result.payment.amount), {
      eventId: 'evt_1',
    });
    expect(res.status).toBe(200);
    const order = await prisma.order.findUniqueOrThrow({
      where: { number: result.orderNumber },
      include: { payments: true },
    });
    expect(order.status).toBe('PAID');
    expect(order.payments[0]).toMatchObject({
      status: 'CAPTURED',
      razorpayPaymentId: 'pay_webhook1',
      method: 'upi',
    });

    const repeat = await send(captured(result.payment.razorpayOrderId, result.payment.amount), {
      eventId: 'evt_1',
    });
    expect(repeat.body).toEqual({ status: 'duplicate' });
    expect(await variant(hoodie.m)).toMatchObject({ stock: 4, reserved: 0 });
  });

  it('rejects a bad signature', async () => {
    const res = await send(captured(result.payment.razorpayOrderId, result.payment.amount), {
      signature: 'bad',
    });
    expect(res.status).toBe(400);
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it("doesn't confirm a payment for the wrong amount", async () => {
    await send(captured(result.payment.razorpayOrderId, 100));
    const order = await prisma.order.findUniqueOrThrow({
      where: { number: result.orderNumber },
      include: { events: true },
    });
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.events.map((e) => e.type)).toContain('payment_mismatch');
  });

  it('records a failed attempt and keeps the order open', async () => {
    await send({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_x',
            order_id: result.payment.razorpayOrderId,
            amount: result.payment.amount,
            error_description: 'Payment was cancelled by the user',
          },
        },
      },
    });
    const order = await prisma.order.findUniqueOrThrow({
      where: { number: result.orderNumber },
      include: { payments: true, events: true },
    });
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.payments[0]!.status).toBe('FAILED');
    expect(order.events.at(-1)!.message).toContain('cancelled by the user');

    // A retry that succeeds still confirms it.
    const ok = await pay(shopper(), result);
    expect(ok.body.status).toBe('PAID');
  });

  it('ignores events for orders that are not ours', async () => {
    const res = await send(captured('order_someone_else', 5000));
    expect(res.status).toBe(200);
  });
});

beforeAll(() => {
  expect(process.env.DATABASE_URL).toMatch(/_test/);
});
