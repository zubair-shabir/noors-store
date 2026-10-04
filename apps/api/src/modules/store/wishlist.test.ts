import type { WishlistDto, WishlistIdsDto } from '@noors/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createProduct, resetDatabase, testPrisma } from '../../../test/db.js';
import { createApp } from '../../app.js';
import { LogEmailSender } from '../../lib/email.js';
import { MockGateway } from '../../lib/payments.js';
import { createServices } from '../../services.js';

const prisma = testPrisma();
const services = createServices({
  prisma,
  paymentGateway: new MockGateway(),
  emailSender: new LogEmailSender(),
});
const app = createApp({
  corsOrigins: ['http://localhost:3000'],
  prisma,
  services,
  storeRateLimits: { otp: 1000, checkout: 1000 },
});

let hoodie: string;
let tee: string;
let draft: string;

beforeEach(async () => {
  await resetDatabase(prisma);
  const category = await prisma.category.create({ data: { slug: 'hoodies', name: 'Hoodies' } });
  hoodie = (
    await createProduct(prisma, {
      slug: 'heritage',
      name: 'Heritage Hoodie',
      categoryId: category.id,
      variants: [
        { size: 'M', price: 249900, stock: 5 },
        { size: 'L', price: 259900, stock: 0 },
      ],
    })
  ).id;
  tee = (
    await createProduct(prisma, {
      slug: 'tee',
      name: 'Chinar Tee',
      categoryId: category.id,
      variants: [{ size: 'M', price: 99900, stock: 20 }],
    })
  ).id;
  draft = (
    await createProduct(prisma, {
      slug: 'draft',
      name: 'Unreleased',
      categoryId: category.id,
      status: 'DRAFT',
      variants: [{ size: 'M', price: 99900, stock: 20 }],
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const shopper = () => request.agent(app);

async function signIn(agent: ReturnType<typeof shopper>, email = 'zoya@example.com') {
  const sent = await agent.post('/api/v1/auth/otp/request').send({ email });
  expect(sent.status).toBe(200);
  const res = await agent.post('/api/v1/auth/otp/verify').send({ email, code: sent.body.devCode });
  expect(res.status).toBe(200);
  return agent;
}

async function save(agent: ReturnType<typeof shopper>, productId: string) {
  const res = await agent.put(`/api/v1/me/wishlist/${productId}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as WishlistIdsDto;
}

describe('wishlist', () => {
  it('requires a signed-in shopper', async () => {
    const guest = shopper();
    for (const res of [
      await guest.get('/api/v1/me/wishlist'),
      await guest.get('/api/v1/me/wishlist/ids'),
      await guest.put(`/api/v1/me/wishlist/${hoodie}`),
      await guest.delete(`/api/v1/me/wishlist/${hoodie}`),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthorized');
    }
    expect(await prisma.wishlistItem.count()).toBe(0);
  });

  it('saves idempotently and lists product cards newest first', async () => {
    const agent = await signIn(shopper());
    expect(await save(agent, hoodie)).toEqual({ productIds: [hoodie] });
    const again = await save(agent, hoodie);
    expect(again).toEqual({ productIds: [hoodie] });
    expect(await prisma.wishlistItem.count()).toBe(1);

    // Make the order deterministic: the tee is saved a moment later.
    await prisma.wishlistItem.updateMany({ data: { createdAt: new Date(Date.now() - 60_000) } });
    expect(await save(agent, tee)).toEqual({ productIds: [tee, hoodie] });

    const res = await agent.get('/api/v1/me/wishlist');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { items } = res.body as WishlistDto;
    expect(items.map((i) => i.product.slug)).toEqual(['tee', 'heritage']);
    expect(items[1]!.product).toMatchObject({
      id: hoodie,
      name: 'Heritage Hoodie',
      category: { slug: 'hoodies', name: 'Hoodies' },
      price: 249900,
      inStock: true,
      sizes: ['M', 'L'],
      quickAdd: [
        { label: 'M', available: true },
        { label: 'L', available: false },
      ],
    });
    expect(items[1]!.savedAt).toEqual(expect.any(String));
  });

  it('removes, and removing twice is fine', async () => {
    const agent = await signIn(shopper());
    await save(agent, hoodie);
    await save(agent, tee);
    const res = await agent.delete(`/api/v1/me/wishlist/${hoodie}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ productIds: [tee] });
    const again = await agent.delete(`/api/v1/me/wishlist/${hoodie}`);
    expect(again.body).toEqual({ productIds: [tee] });
    expect((await agent.get('/api/v1/me/wishlist/ids')).body).toEqual({ productIds: [tee] });
  });

  it('only accepts products that are on sale', async () => {
    const agent = await signIn(shopper());
    expect((await agent.put(`/api/v1/me/wishlist/${draft}`)).status).toBe(404);
    expect((await agent.put('/api/v1/me/wishlist/no-such-product')).status).toBe(404);
    expect(await prisma.wishlistItem.count()).toBe(0);
  });

  it('drops archived products from the list and the ids, and brings them back if relisted', async () => {
    const agent = await signIn(shopper());
    await save(agent, hoodie);
    await save(agent, tee);
    await prisma.product.update({ where: { id: hoodie }, data: { status: 'ARCHIVED' } });

    const list = (await agent.get('/api/v1/me/wishlist')).body as WishlistDto;
    expect(list.items.map((i) => i.product.id)).toEqual([tee]);
    expect((await agent.get('/api/v1/me/wishlist/ids')).body).toEqual({ productIds: [tee] });

    await prisma.product.update({ where: { id: hoodie }, data: { status: 'ACTIVE' } });
    const ids = (await agent.get('/api/v1/me/wishlist/ids')).body as WishlistIdsDto;
    expect(ids.productIds.sort()).toEqual([hoodie, tee].sort());
  });

  it('keeps each shopper’s wishlist to themselves', async () => {
    const zoya = await signIn(shopper());
    const aamir = await signIn(shopper(), 'aamir@example.com');
    await save(zoya, hoodie);
    expect((await aamir.get('/api/v1/me/wishlist/ids')).body).toEqual({ productIds: [] });
    expect((await aamir.delete(`/api/v1/me/wishlist/${hoodie}`)).body).toEqual({
      productIds: [],
    });
    expect((await zoya.get('/api/v1/me/wishlist/ids')).body).toEqual({ productIds: [hoodie] });
  });
});
