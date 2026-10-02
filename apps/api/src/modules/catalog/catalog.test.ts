import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, resetDatabase, testPrisma } from '../../../test/db.js';
import { createApp } from '../../app.js';

const prisma = testPrisma();
const app = createApp({ corsOrigins: [], prisma });
const api = () => request(app);

const day = (n: number) => new Date(Date.UTC(2026, 8, n));

beforeAll(async () => {
  await resetDatabase(prisma);
  const hoodies = await prisma.category.create({
    data: { slug: 'hoodies', name: 'Hoodies', sortOrder: 1 },
  });
  const jackets = await prisma.category.create({
    data: { slug: 'jackets', name: 'Jackets', sortOrder: 0 },
  });

  // Cheapest in-stock variant is L at ₹2,499: S at ₹1,999 is sold out and M costs more.
  await createProduct(prisma, {
    slug: 'heritage-hoodie',
    name: 'Kashmir Heritage Hoodie',
    categoryId: hoodies.id,
    tags: ['winter', 'jacquard'],
    isFeatured: true,
    featuredRank: 2,
    createdAt: day(1),
    variants: [
      { size: 'S', price: 199900, stock: 0 },
      { size: 'M', price: 259900, stock: 10, reserved: 7 },
      { size: 'L', price: 249900, compareAtPrice: 299900, stock: 20 },
    ],
  });
  // M only comes in Black, L only in Olive.
  await createProduct(prisma, {
    slug: 'jacquard-hoodie',
    name: 'Stone White Jacquard Hoodie',
    categoryId: hoodies.id,
    tags: ['latest'],
    createdAt: day(3),
    variants: [
      { size: 'M', colour: 'Black', price: 279900, stock: 5 },
      { size: 'L', colour: 'Olive', price: 279900, stock: 5 },
      { size: 'XL', colour: 'Olive', price: 99900, stock: 50, isActive: false },
    ],
  });
  await createProduct(prisma, {
    slug: 'utility-jacket',
    name: 'Utility Jacket Ecru',
    categoryId: jackets.id,
    isFeatured: true,
    featuredRank: 1,
    createdAt: day(2),
    variants: [{ size: 'M', price: 499900, stock: 3 }],
  });
  await createProduct(prisma, {
    slug: 'sold-out-jacket',
    name: 'Midnight Floral Jacket',
    categoryId: jackets.id,
    isFeatured: true,
    createdAt: day(5),
    variants: [{ size: 'M', price: 549900, stock: 2, reserved: 2 }],
  });
  await createProduct(prisma, {
    slug: 'draft-jacket',
    name: 'Draft Jacket',
    categoryId: jackets.id,
    status: 'DRAFT',
    isFeatured: true,
    createdAt: day(6),
    variants: [{ size: 'M', price: 100, stock: 9 }],
  });

  const ids = Object.fromEntries(
    (await prisma.product.findMany({ select: { id: true, slug: true } })).map((p) => [
      p.slug,
      p.id,
    ]),
  );
  await prisma.collection.create({
    data: {
      slug: 'winter',
      name: 'Winter',
      products: {
        create: [
          { productId: ids['utility-jacket'], position: 0 },
          { productId: ids['heritage-hoodie'], position: 1 },
          { productId: ids['draft-jacket'], position: 2 },
        ],
      },
    },
  });
  await prisma.collection.create({
    data: { slug: 'under-2600', name: 'Under 2600', type: 'RULE', rules: { maxPrice: 260000 } },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const slugs = (res: request.Response) => res.body.items.map((p: { slug: string }) => p.slug);

describe('categories', () => {
  it('lists categories in sort order with counts of live products only', async () => {
    const res = await api().get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('s-maxage=60');
    expect(res.body.items).toEqual([
      expect.objectContaining({ slug: 'jackets', productCount: 2 }),
      expect.objectContaining({ slug: 'hoodies', productCount: 2 }),
    ]);
  });

  it('returns 404 for an unknown category', async () => {
    expect((await api().get('/api/v1/categories/shoes')).status).toBe(404);
  });
});

describe('GET /products', () => {
  it('hides drafts, lists newest first and puts sold-out products last', async () => {
    const res = await api().get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(slugs(res)).toEqual([
      'jacquard-hoodie',
      'utility-jacket',
      'heritage-hoodie',
      'sold-out-jacket',
    ]);
    expect(res.body).toMatchObject({ page: 1, limit: 24, total: 4, totalPages: 1 });
  });

  it('prices a product by its cheapest in-stock variant and ignores inactive variants', async () => {
    const res = await api().get('/api/v1/products?category=hoodies');
    const byslug = Object.fromEntries(res.body.items.map((p: { slug: string }) => [p.slug, p]));
    expect(byslug['heritage-hoodie']).toMatchObject({
      price: 249900,
      compareAtPrice: 299900,
      inStock: true,
      sizes: ['S', 'M', 'L'],
      category: { slug: 'hoodies', name: 'Hoodies' },
    });
    expect(byslug['heritage-hoodie'].images).toHaveLength(2);
    expect(byslug['jacquard-hoodie'].price).toBe(279900);
    expect(byslug['jacquard-hoodie'].colours.map((c: { value: string }) => c.value)).toEqual([
      'Black',
      'Olive',
    ]);
  });

  it('offers quick-add sizes in the colour of the price-setting variant', async () => {
    const res = await api().get('/api/v1/products?category=hoodies');
    const byslug = Object.fromEntries(res.body.items.map((p: { slug: string }) => [p.slug, p]));
    const labels = (slug: string) =>
      byslug[slug].quickAdd.map((q: { label: string; available: boolean }) => [
        q.label,
        q.available,
      ]);
    expect(labels('heritage-hoodie')).toEqual([
      ['S', false],
      ['M', true],
      ['L', true],
    ]);
    // Priced by M / Black, so only Black sizes are offered; XL is switched off.
    expect(labels('jacquard-hoodie')).toEqual([['M', true]]);
    expect(byslug['heritage-hoodie'].quickAdd[1].price).toBe(259900);
  });

  it('sorts by price in both directions', async () => {
    expect(slugs(await api().get('/api/v1/products?sort=price_asc'))).toEqual([
      'heritage-hoodie',
      'jacquard-hoodie',
      'utility-jacket',
      'sold-out-jacket',
    ]);
    expect(slugs(await api().get('/api/v1/products?sort=price_desc'))).toEqual([
      'utility-jacket',
      'jacquard-hoodie',
      'heritage-hoodie',
      'sold-out-jacket',
    ]);
  });

  it('matches size and colour on the same variant', async () => {
    expect(slugs(await api().get('/api/v1/products?size=M&colour=black'))).toEqual([
      'jacquard-hoodie',
    ]);
    expect(slugs(await api().get('/api/v1/products?size=M&colour=Olive'))).toEqual([]);
    expect(slugs(await api().get('/api/v1/products?size=XL'))).toEqual([]);
  });

  it('filters by price range in paise, matching any variant in range', async () => {
    // The heritage hoodie shows ₹2,499 but its M variant at ₹2,599 is in range.
    expect(slugs(await api().get('/api/v1/products?minPrice=250000&maxPrice=500000'))).toEqual([
      'jacquard-hoodie',
      'utility-jacket',
      'heritage-hoodie',
    ]);
    expect(slugs(await api().get('/api/v1/products?maxPrice=250000'))).toEqual(['heritage-hoodie']);
  });

  it('paginates', async () => {
    const res = await api().get('/api/v1/products?limit=3&page=2');
    expect(slugs(res)).toEqual(['sold-out-jacket']);
    expect(res.body).toMatchObject({ page: 2, limit: 3, total: 4, totalPages: 2 });
  });

  it('rejects a bad query with a validation error', async () => {
    const res = await api().get('/api/v1/products?sort=cheapest');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});

describe('GET /products/:slug', () => {
  it('returns options, every image and per-variant availability net of reserved stock', async () => {
    const res = await api().get('/api/v1/products/heritage-hoodie');
    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(3);
    expect(res.body.options[0].name).toBe('Size');
    const bySku = Object.fromEntries(res.body.variants.map((v: { sku: string }) => [v.sku, v]));
    expect(bySku['HERITAGE-HOODIE-S-X']).toMatchObject({ available: false, lowStock: false });
    expect(bySku['HERITAGE-HOODIE-M-X']).toMatchObject({ available: true, lowStock: true });
    expect(bySku['HERITAGE-HOODIE-L-X']).toMatchObject({ available: true, lowStock: false });
    expect(bySku['HERITAGE-HOODIE-M-X'].optionValueIds).toHaveLength(1);
  });

  it('leaves out inactive variants', async () => {
    const res = await api().get('/api/v1/products/jacquard-hoodie');
    expect(res.body.variants).toHaveLength(2);
  });

  it('returns 404 for drafts and unknown slugs', async () => {
    expect((await api().get('/api/v1/products/draft-jacket')).status).toBe(404);
    expect((await api().get('/api/v1/products/nope')).status).toBe(404);
  });
});

describe('featured, search and collections', () => {
  it('lists live featured products by rank, unranked last', async () => {
    expect(slugs(await api().get('/api/v1/featured'))).toEqual([
      'utility-jacket',
      'heritage-hoodie',
      'sold-out-jacket',
    ]);
  });

  it('searches names, tags and category names', async () => {
    expect(slugs(await api().get('/api/v1/search?q=jacquard'))).toEqual([
      'jacquard-hoodie',
      'heritage-hoodie',
    ]);
    expect(slugs(await api().get('/api/v1/search?q=Jackets'))).toEqual([
      'utility-jacket',
      'sold-out-jacket',
    ]);
    expect((await api().get('/api/v1/search?q=')).status).toBe(400);
  });

  it('returns a manual collection in its set order without drafts', async () => {
    const res = await api().get('/api/v1/collections/winter');
    expect(res.status).toBe(200);
    expect(res.body.products.map((p: { slug: string }) => p.slug)).toEqual([
      'utility-jacket',
      'heritage-hoodie',
    ]);
  });

  it('applies the filters of a rule collection', async () => {
    const res = await api().get('/api/v1/collections/under-2600');
    expect(res.body.products.map((p: { slug: string }) => p.slug)).toEqual(['heritage-hoodie']);
    expect((await api().get('/api/v1/collections/nope')).status).toBe(404);
  });
});
