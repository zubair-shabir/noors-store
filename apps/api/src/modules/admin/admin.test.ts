import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AdminProductDto } from '@noors/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase, testPrisma } from '../../../test/db.js';
import { createApp } from '../../app.js';
import { hashPassword } from '../../lib/password.js';
import { CloudinaryImageStore } from './uploads.service.js';

const prisma = testPrisma();
let uploadsDir: string;
let app: ReturnType<typeof createApp>;

const PASSWORD = 'correct-horse-battery';
let ownerCookie: string;
let staffCookie: string;
let categoryId: string;

const api = () => request(app);
const asOwner = {
  get: (url: string) => api().get(url).set('Cookie', ownerCookie),
  post: (url: string) => api().post(url).set('Cookie', ownerCookie),
  put: (url: string) => api().put(url).set('Cookie', ownerCookie),
  patch: (url: string) => api().patch(url).set('Cookie', ownerCookie),
  delete: (url: string) => api().delete(url).set('Cookie', ownerCookie),
};

async function login(email: string, password = PASSWORD) {
  const res = await api().post('/api/v1/admin/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  const cookie = res.headers['set-cookie'] as unknown as string[];
  return cookie[0]!.split(';')[0]!;
}

async function createProduct(body: Record<string, unknown> = {}): Promise<AdminProductDto> {
  const res = await asOwner.post('/api/v1/admin/products').send({
    name: 'Pheran Hoodie',
    slug: `pheran-hoodie-${Math.random().toString(36).slice(2, 8)}`,
    categoryId,
    price: 249900,
    ...body,
  });
  expect(res.status).toBe(201);
  return res.body;
}

const setOptions = (id: string, options: unknown, extra: Record<string, unknown> = {}) =>
  asOwner.put(`/api/v1/admin/products/${id}/options`).send({ options, ...extra });

const titles = (p: AdminProductDto) => p.variants.map((v) => v.title);

beforeAll(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), 'noors-uploads-'));
  app = createApp({
    corsOrigins: ['http://localhost:3000'],
    prisma,
    uploadsDir,
    loginRateLimit: 1000,
  });
  await resetDatabase(prisma);
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.adminUser.createMany({
    data: [
      { email: 'owner@test.in', name: 'Owner', role: 'OWNER', passwordHash },
      { email: 'staff@test.in', name: 'Staff', role: 'STAFF', passwordHash },
      { email: 'gone@test.in', name: 'Former', role: 'OWNER', passwordHash, isActive: false },
    ],
  });
  ownerCookie = await login('owner@test.in');
  staffCookie = await login('staff@test.in');
  categoryId = (await prisma.category.create({ data: { slug: 'hoodies', name: 'Hoodies' } })).id;
});

afterAll(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('admin auth', () => {
  it('rejects a wrong password and a disabled account the same way', async () => {
    for (const body of [
      { email: 'owner@test.in', password: 'nope-nope-nope' },
      { email: 'nobody@test.in', password: PASSWORD },
      { email: 'gone@test.in', password: PASSWORD },
    ]) {
      const res = await api().post('/api/v1/admin/auth/login').send(body);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('invalid_credentials');
    }
  });

  it('sets an httpOnly session cookie and stores only a hash of it', async () => {
    const res = await api()
      .post('/api/v1/admin/auth/login')
      .send({ email: 'OWNER@test.in ', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.admin).toMatchObject({ email: 'owner@test.in', role: 'OWNER' });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^noors_admin=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const token = cookie.split(';')[0]!.split('=')[1]!;
    expect(await prisma.adminSession.count({ where: { tokenHash: token } })).toBe(0);
  });

  it('needs a session for everything past login', async () => {
    expect((await api().get('/api/v1/admin/auth/me')).status).toBe(401);
    expect((await api().get('/api/v1/admin/products')).status).toBe(401);
    const me = await asOwner.get('/api/v1/admin/auth/me');
    expect(me.body.admin.email).toBe('owner@test.in');
    expect(me.headers['cache-control']).toBe('no-store');
  });

  it('logs out by deleting the session', async () => {
    const cookie = await login('owner@test.in');
    await api().post('/api/v1/admin/auth/logout').set('Cookie', cookie).expect(204);
    expect((await api().get('/api/v1/admin/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('blocks state changes sent from another site', async () => {
    const res = await asOwner
      .post('/api/v1/admin/categories')
      .set('Origin', 'https://evil.example')
      .send({ name: 'X', slug: 'x' });
    expect(res.status).toBe(403);
    const ok = await asOwner
      .post('/api/v1/admin/categories')
      .set('Origin', 'http://localhost:3000')
      .send({ name: 'Shawls', slug: 'shawls' });
    expect(ok.status).toBe(201);
  });

  it('keeps staff to reading the catalogue and changing stock', async () => {
    const product = await createProduct();
    const staff = (method: 'post' | 'patch', url: string) =>
      api()[method](url).set('Cookie', staffCookie);

    expect((await api().get('/api/v1/admin/products').set('Cookie', staffCookie)).status).toBe(200);
    expect((await staff('post', '/api/v1/admin/products').send({})).status).toBe(403);
    expect(
      (await staff('patch', `/api/v1/admin/products/${product.id}`).send({ name: 'Hacked' }))
        .status,
    ).toBe(403);

    const variantId = product.variants[0]!.id;
    const price = await staff('patch', `/api/v1/admin/products/${product.id}/variants`).send({
      variants: [{ id: variantId, price: 100 }],
    });
    expect(price.status).toBe(403);
    const stock = await staff('patch', `/api/v1/admin/products/${product.id}/variants`).send({
      variants: [{ id: variantId, stock: 12 }],
    });
    expect(stock.status).toBe(200);
    expect(stock.body.variants[0].stock).toBe(12);
  });
});

describe('admin products', () => {
  it('creates a draft with one default variant at the given price', async () => {
    const p = await createProduct({ tags: ['Winter', 'jacquard'] });
    expect(p.status).toBe('DRAFT');
    expect(p.tags).toEqual(['winter', 'jacquard']);
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0]).toMatchObject({ title: 'Default', price: 249900, stock: 0 });
    expect(p.variants[0]!.sku).toMatch(/^PHERAN-HOODIE-/);
  });

  it('refuses to publish without a priced variant', async () => {
    const res = await asOwner
      .post('/api/v1/admin/products')
      .send({ name: 'Free', slug: 'free', categoryId, status: 'ACTIVE' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('not_publishable');

    const p = await createProduct({ price: 0 });
    const publish = await asOwner
      .patch(`/api/v1/admin/products/${p.id}`)
      .send({ status: 'ACTIVE' });
    expect(publish.status).toBe(400);
  });

  it('reports a taken slug as a conflict and an unknown category as a bad reference', async () => {
    const p = await createProduct();
    const dupe = await asOwner
      .post('/api/v1/admin/products')
      .send({ name: 'Again', slug: p.slug, categoryId });
    expect(dupe.status).toBe(409);
    const badCat = await asOwner
      .post('/api/v1/admin/products')
      .send({ name: 'Lost', slug: 'lost', categoryId: 'nope' });
    expect(badCat.status).toBe(400);
  });

  it('changes only the fields a partial update sends', async () => {
    const p = await createProduct({
      status: 'ACTIVE',
      description: '<p>Hand embroidered</p>',
      tags: ['winter'],
    });
    const res = await asOwner.patch(`/api/v1/admin/products/${p.id}`).send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Renamed',
      status: 'ACTIVE',
      description: '<p>Hand embroidered</p>',
      tags: ['winter'],
    });
  });

  it('strips unsafe HTML from descriptions', async () => {
    const p = await createProduct({
      description:
        '<p onclick="x()">Soft <strong>wool</strong></p><script>alert(1)</script><a href="javascript:x">bad</a><a href="https://noors.in">ok</a>',
    });
    expect(p.description).toBe(
      '<p>Soft <strong>wool</strong></p><a rel="noopener noreferrer">bad</a><a href="https://noors.in" rel="noopener noreferrer">ok</a>',
    );
  });

  it('generates variants from options and keeps existing stock and prices', async () => {
    const p = await createProduct();
    const defaultId = p.variants[0]!.id;
    await asOwner
      .patch(`/api/v1/admin/products/${p.id}/variants`)
      .send({ variants: [{ id: defaultId, stock: 7 }] })
      .expect(200);

    // Adding Size: the default variant becomes the first size and keeps its stock.
    let res = await setOptions(p.id, [{ name: 'Size', values: [{ value: 'S' }, { value: 'M' }] }]);
    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(['S', 'M']);
    expect(res.body.variants[0]).toMatchObject({ id: defaultId, stock: 7 });
    expect(res.body.variants[1]).toMatchObject({ stock: 0, price: 249900 });

    // Adding Colour: existing sizes take the first colour; new combinations get the default price.
    res = await setOptions(
      p.id,
      [
        { name: 'Size', values: [{ value: 'S' }, { value: 'M' }] },
        {
          name: 'Colour',
          values: [
            { value: 'Black', swatch: '#111111' },
            { value: 'Olive', swatch: '#4b5320' },
          ],
        },
      ],
      { defaultPrice: 279900 },
    );
    expect(titles(res.body)).toEqual(['S / Black', 'S / Olive', 'M / Black', 'M / Olive']);
    expect(res.body.variants[0]).toMatchObject({ id: defaultId, stock: 7, price: 249900 });
    expect(res.body.variants[1].price).toBe(279900);
    const mBlackId = res.body.variants[2].id;

    // Removing a value removes its variants; the rest keep their ids.
    res = await setOptions(p.id, [
      { name: 'Size', values: [{ value: 'M' }, { value: 'L' }] },
      {
        name: 'Colour',
        values: [
          { value: 'Black', swatch: '#111111' },
          { value: 'Olive', swatch: '#4b5320' },
        ],
      },
    ]);
    expect(titles(res.body)).toEqual(['M / Black', 'M / Olive', 'L / Black', 'L / Olive']);
    expect(res.body.variants[0].id).toBe(mBlackId);

    // Removing an option merges variants that now share a combination.
    res = await setOptions(p.id, [{ name: 'Size', values: [{ value: 'M' }, { value: 'L' }] }]);
    expect(titles(res.body)).toEqual(['M', 'L']);
    expect(res.body.variants[0].id).toBe(mBlackId);
    expect(new Set(res.body.variants.map((v: { sku: string }) => v.sku)).size).toBe(2);
  });

  it('rejects duplicate option values', async () => {
    const p = await createProduct();
    const res = await setOptions(p.id, [
      { name: 'Size', values: [{ value: 'M' }, { value: 'm' }] },
    ]);
    expect(res.status).toBe(400);
  });

  it('bulk edits variants and logs stock changes', async () => {
    const p = await createProduct();
    const opts = await setOptions(p.id, [
      { name: 'Size', values: [{ value: 'S' }, { value: 'M' }] },
    ]);
    const [s, m] = opts.body.variants;
    const res = await asOwner.patch(`/api/v1/admin/products/${p.id}/variants`).send({
      variants: [
        { id: s.id, price: 199900, compareAtPrice: 249900, stock: 4 },
        { id: m.id, isActive: false, weightGrams: 650 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.variants[0]).toMatchObject({ price: 199900, compareAtPrice: 249900, stock: 4 });
    expect(res.body.variants[1]).toMatchObject({ isActive: false, weightGrams: 650 });
    const logs = await prisma.inventoryLog.findMany({ where: { variantId: s.id } });
    expect(logs).toMatchObject([{ change: 4, reason: 'admin_adjustment' }]);
  });

  it('validates compare-at prices, held stock and foreign variants', async () => {
    const p = await createProduct();
    const v = p.variants[0]!;
    const url = `/api/v1/admin/products/${p.id}/variants`;
    expect(
      (await asOwner.patch(url).send({ variants: [{ id: v.id, compareAtPrice: 100 }] })).body.error
        .code,
    ).toBe('invalid_price');

    await prisma.variant.update({ where: { id: v.id }, data: { stock: 5, reserved: 3 } });
    expect(
      (await asOwner.patch(url).send({ variants: [{ id: v.id, stock: 2 }] })).body.error.code,
    ).toBe('invalid_stock');

    const other = await createProduct();
    expect(
      (await asOwner.patch(url).send({ variants: [{ id: other.variants[0]!.id, stock: 1 }] }))
        .status,
    ).toBe(400);
  });

  it('keeps a live product publishable', async () => {
    const p = await createProduct({ status: 'ACTIVE' });
    const res = await asOwner
      .patch(`/api/v1/admin/products/${p.id}/variants`)
      .send({ variants: [{ id: p.variants[0]!.id, isActive: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('not_publishable');
  });

  it('replaces the gallery in order and links images to a colour', async () => {
    const p = await createProduct();
    const opts = await setOptions(p.id, [{ name: 'Colour', values: [{ value: 'Black' }] }]);
    const black = opts.body.options[0].values[0].id;
    const res = await asOwner.put(`/api/v1/admin/products/${p.id}/images`).send({
      images: [
        { url: 'https://res.cloudinary.com/x/b.webp', optionValueId: black, alt: 'Back' },
        { url: '/uploads/a.webp' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.images).toMatchObject([
      { url: 'https://res.cloudinary.com/x/b.webp', optionValueId: black, alt: 'Back' },
      { url: '/uploads/a.webp', optionValueId: null },
    ]);

    const other = await createProduct();
    const foreign = await asOwner
      .put(`/api/v1/admin/products/${other.id}/images`)
      .send({ images: [{ url: '/x.webp', optionValueId: black }] });
    expect(foreign.status).toBe(400);
  });

  it('duplicates a product as a draft with fresh SKUs and no stock', async () => {
    const p = await createProduct({ status: 'ACTIVE' });
    const opts = await setOptions(p.id, [
      { name: 'Size', values: [{ value: 'S' }, { value: 'M' }] },
    ]);
    await asOwner
      .patch(`/api/v1/admin/products/${p.id}/variants`)
      .send({ variants: opts.body.variants.map((v: { id: string }) => ({ id: v.id, stock: 9 })) });
    await asOwner
      .put(`/api/v1/admin/products/${p.id}/images`)
      .send({ images: [{ url: '/a.webp', optionValueId: opts.body.options[0].values[1].id }] });

    const res = await asOwner.post(`/api/v1/admin/products/${p.id}/duplicate`);
    expect(res.status).toBe(201);
    const copy: AdminProductDto = res.body;
    expect(copy).toMatchObject({
      name: 'Pheran Hoodie (copy)',
      slug: `${p.slug}-copy`,
      status: 'DRAFT',
    });
    expect(titles(copy)).toEqual(['S', 'M']);
    expect(copy.variants.every((v) => v.stock === 0)).toBe(true);
    expect(copy.variants.map((v) => v.sku)).not.toEqual(
      opts.body.variants.map((v: { sku: string }) => v.sku),
    );
    expect(copy.images[0]!.optionValueId).toBe(copy.options[0]!.values[1]!.id);

    const again = await asOwner.post(`/api/v1/admin/products/${p.id}/duplicate`);
    expect(again.body.slug).toBe(`${p.slug}-copy-2`);
  });

  it('lists with search, status filter and pagination', async () => {
    await createProduct({
      name: 'Zainakadal Overshirt',
      slug: 'zainakadal-overshirt',
      status: 'ACTIVE',
    });
    const res = await asOwner.get('/api/v1/admin/products?q=zainakadal&status=ACTIVE');
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      slug: 'zainakadal-overshirt',
      category: { name: 'Hoodies' },
      variantCount: 1,
      minPrice: 249900,
    });
    const page = await asOwner.get('/api/v1/admin/products?limit=2&page=2');
    expect(page.body.items).toHaveLength(2);
    expect(page.body.page).toBe(2);
  });

  it('deletes a product and records who did it', async () => {
    const p = await createProduct();
    await asOwner.delete(`/api/v1/admin/products/${p.id}`).expect(204);
    expect((await asOwner.get(`/api/v1/admin/products/${p.id}`)).status).toBe(404);
    const log = await prisma.auditLog.findFirst({ where: { entityId: p.id, action: 'delete' } });
    expect(log?.adminUserId).toBeTruthy();
  });
});

describe('admin categories, collections, featured and banners', () => {
  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  it('manages categories and refuses to delete one in use', async () => {
    const res = await asOwner
      .post('/api/v1/admin/categories')
      .send({ name: 'Pherans', slug: 'pherans' });
    expect(res.status).toBe(201);
    const p = await createProduct({ categoryId: res.body.id });
    const del = await asOwner.delete(`/api/v1/admin/categories/${res.body.id}`);
    expect(del.status).toBe(409);
    await asOwner.delete(`/api/v1/admin/products/${p.id}`).expect(204);
    await asOwner.delete(`/api/v1/admin/categories/${res.body.id}`).expect(204);

    const list = await asOwner.get('/api/v1/admin/categories');
    const ids: string[] = list.body.items.map((c: { id: string }) => c.id);
    const reordered = await asOwner
      .put('/api/v1/admin/categories/order')
      .send({ ids: [...ids].reverse() });
    expect(reordered.body.items.map((c: { id: string }) => c.id)).toEqual([...ids].reverse());
    expect(
      (await asOwner.put('/api/v1/admin/categories/order').send({ ids: ids.slice(1) })).status,
    ).toBe(400);
  });

  it('keeps manual collection order and previews rule collections', async () => {
    const a = await createProduct({ name: 'A', status: 'ACTIVE', tags: ['winter'] });
    const b = await createProduct({ name: 'B', status: 'ACTIVE', price: 399900 });
    const manual = await asOwner.post('/api/v1/admin/collections').send({
      name: 'Winter 26',
      slug: 'winter-26',
      productIds: [b.id, a.id],
    });
    expect(manual.status).toBe(201);
    expect(manual.body.products.map((p: { id: string }) => p.id)).toEqual([b.id, a.id]);

    const rule = await asOwner.post('/api/v1/admin/collections').send({
      name: 'Under 3k',
      slug: 'under-3k',
      type: 'RULE',
      rules: { maxPrice: 300000 },
    });
    expect(rule.body.products.map((p: { id: string }) => p.id)).toEqual([a.id]);

    const noRules = await asOwner
      .post('/api/v1/admin/collections')
      .send({ name: 'Empty', slug: 'empty', type: 'RULE', rules: {} });
    expect(noRules.status).toBe(400);

    const pub = await api().get('/api/v1/collections/winter-26');
    expect(pub.body.products.map((p: { id: string }) => p.id)).toEqual([b.id, a.id]);
  });

  it('sets featured products in order and un-features the rest', async () => {
    const a = await createProduct({ name: 'A', status: 'ACTIVE' });
    const b = await createProduct({ name: 'B', status: 'ACTIVE' });
    const c = await createProduct({ name: 'C', status: 'ACTIVE' });
    await asOwner
      .put('/api/v1/admin/featured')
      .send({ productIds: [a.id, b.id] })
      .expect(200);
    const res = await asOwner.put('/api/v1/admin/featured').send({ productIds: [c.id, a.id] });
    expect(res.body.items.map((p: { id: string }) => p.id)).toEqual([c.id, a.id]);
    expect((await prisma.product.findUnique({ where: { id: b.id } }))?.isFeatured).toBe(false);

    const pub = await api().get('/api/v1/featured');
    expect(pub.body.items.map((p: { id: string }) => p.id)).toEqual([c.id, a.id]);
    expect(
      (await asOwner.put('/api/v1/admin/featured').send({ productIds: ['nope'] })).status,
    ).toBe(400);
  });

  it('keeps a hidden banner hidden when only its title changes', async () => {
    const banner = await asOwner
      .post('/api/v1/admin/banners')
      .send({ placement: 'ANNOUNCEMENT', title: 'Old', isActive: false });
    const res = await asOwner
      .patch(`/api/v1/admin/banners/${banner.body.id}`)
      .send({ title: 'New', placement: 'HERO' });
    expect(res.body).toMatchObject({ title: 'New', isActive: false, placement: 'ANNOUNCEMENT' });
    await asOwner.delete(`/api/v1/admin/banners/${banner.body.id}`).expect(204);
  });

  it('edits banners and shows only active ones publicly', async () => {
    const hero = (title: string, isActive = true) =>
      asOwner
        .post('/api/v1/admin/banners')
        .send({ placement: 'HERO', title, imageUrl: '/h.webp', isActive });
    const one = (await hero('One')).body;
    const two = (await hero('Two')).body;
    await hero('Hidden', false);
    expect(two.position).toBe(1);

    const list = await asOwner.get('/api/v1/admin/banners?placement=HERO');
    const ids = list.body.items.map((b: { id: string }) => b.id);
    await asOwner
      .put('/api/v1/admin/banners/order')
      .send({ placement: 'HERO', ids: [ids[1], ids[0], ids[2]] })
      .expect(200);

    const pub = await api().get('/api/v1/banners?placement=HERO');
    expect(pub.body.items.map((b: { title: string }) => b.title)).toEqual(['Two', 'One']);

    await asOwner.patch(`/api/v1/admin/banners/${one.id}`).send({ isActive: false }).expect(200);
    await asOwner.delete(`/api/v1/admin/banners/${two.id}`).expect(204);
    expect((await api().get('/api/v1/banners?placement=HERO')).body.items).toEqual([]);
  });
});

describe('admin uploads', () => {
  // Smallest valid PNG header bytes are enough for type sniffing.
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(32, 1),
  ]);

  it('saves images locally and serves them', async () => {
    const res = await asOwner
      .post('/api/v1/admin/uploads')
      .attach('file', png, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/.+\.png$/);
    const file = await api().get(res.body.url);
    expect(file.status).toBe(200);
    expect(Buffer.compare(file.body as Buffer, png)).toBe(0);
  });

  it('rejects files that are not images, whatever they claim to be', async () => {
    const res = await asOwner
      .post('/api/v1/admin/uploads')
      .attach('file', Buffer.from('<?php echo 1; ?>  padding'), {
        filename: 'x.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(415);
  });

  it('does not let staff upload', async () => {
    const res = await api()
      .post('/api/v1/admin/uploads')
      .set('Cookie', staffCookie)
      .attach('file', png, 'p.png');
    expect(res.status).toBe(403);
  });

  it('signs Cloudinary uploads', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            secure_url: 'https://res.cloudinary.com/demo/a.png',
            width: 800,
            height: 1000,
          }),
        ),
    );
    const store = new CloudinaryImageStore(
      'cloudinary://123:abc@demo',
      'noors/products',
      fetchMock,
    );
    // Matches Cloudinary's documented example: sha1("eager=w_400&public_id=sample&timestamp=1315060510abcd").
    expect(store.sign({ timestamp: '1315060510', public_id: 'sample', eager: 'w_400' })).toBe(
      createHash('sha1')
        .update('eager=w_400&public_id=sample&timestamp=1315060510abc')
        .digest('hex'),
    );
    const saved = await store.save(png, 'png');
    expect(saved).toEqual({
      url: 'https://res.cloudinary.com/demo/a.png',
      width: 800,
      height: 1000,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    const form = init.body as FormData;
    expect(form.get('api_key')).toBe('123');
    expect(form.get('folder')).toBe('noors/products');
    expect(form.get('signature')).toMatch(/^[0-9a-f]{40}$/);
  });
});
