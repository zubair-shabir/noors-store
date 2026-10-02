/**
 * Development seed: the three categories and placeholder products from the design step,
 * each with Size (and some with Colour) variants. Safe to re-run: it replaces seeded
 * products by slug. Run with `pnpm db:seed`.
 *
 * Also creates a development owner account (owner@noors.local / noors-dev-password) and the
 * home page banners, both only when missing so dashboard edits survive a re-seed.
 */
import 'dotenv/config';
import { createPrisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const prisma = createPrisma(url);

const img = (name: string) => `/placeholder/${name}.webp`;
const rupees = (n: number) => n * 100;
const SIZES = ['S', 'M', 'L', 'XL'];

const categories = [
  { slug: 'hoodies', name: 'Hoodies', imageUrl: img('kashmir-heritage-hoodie-1'), sortOrder: 0 },
  { slug: 'jackets', name: 'Jackets', imageUrl: img('lookbook-1'), sortOrder: 1 },
  { slug: 'overshirts', name: 'Overshirts', imageUrl: img('lookbook-4'), sortOrder: 2 },
];

interface SeedProduct {
  slug: string;
  name: string;
  category: string;
  price: number;
  compareAt?: number;
  images: string[];
  colours?: { value: string; swatch: string }[];
  featuredRank?: number;
  tags: string[];
  fabric: string;
  /** Stock per size; a 0 shows the size as sold out. */
  stock: Record<string, number>;
}

const seedProducts: SeedProduct[] = [
  {
    slug: 'utility-jacket-ecru',
    name: 'Utility Jacket Ecru',
    category: 'jackets',
    price: 4999,
    compareAt: 5999,
    images: ['utility-jacket-ecru-1', 'utility-jacket-ecru-2'],
    featuredRank: 1,
    tags: ['denim', 'winter'],
    fabric: '100% cotton denim, garment washed',
    stock: { S: 6, M: 10, L: 8, XL: 3 },
  },
  {
    slug: 'kashmir-heritage-hoodie',
    name: 'Kashmir Heritage Hoodie',
    category: 'hoodies',
    price: 2499,
    compareAt: 2999,
    images: ['kashmir-heritage-hoodie-1', 'kashmir-heritage-hoodie-2'],
    featuredRank: 2,
    tags: ['heritage', 'jacquard', 'winter'],
    fabric: 'Cotton fleece body, jacquard sleeves',
    stock: { S: 4, M: 12, L: 9, XL: 0 },
  },
  {
    slug: 'midnight-floral-jacket',
    name: 'Midnight Floral Jacket',
    category: 'jackets',
    price: 5499,
    compareAt: 6499,
    images: ['midnight-floral-jacket-1'],
    featuredRank: 3,
    tags: ['floral', 'tapestry'],
    fabric: 'Woven tapestry with chain detailing',
    stock: { S: 2, M: 5, L: 5, XL: 2 },
  },
  {
    slug: 'stone-white-jacquard-hoodie',
    name: 'Stone White Jacquard Hoodie',
    category: 'hoodies',
    price: 2499,
    compareAt: 2999,
    images: ['stone-white-jacquard-hoodie-1', 'kashmir-heritage-hoodie-1'],
    colours: [
      { value: 'Stone White', swatch: '#e9e4dc' },
      { value: 'Charcoal', swatch: '#3a3a3a' },
    ],
    tags: ['jacquard', 'latest'],
    fabric: 'Brushed cotton fleece',
    stock: { S: 5, M: 8, L: 8, XL: 4 },
  },
  {
    slug: 'noor-black-overshirt',
    name: "Noor's Black Overshirt",
    category: 'overshirts',
    price: 3299,
    images: ['lookbook-4', 'lookbook-1'],
    tags: ['overshirt', 'latest'],
    fabric: 'Heavy cotton twill',
    stock: { S: 3, M: 6, L: 6, XL: 2 },
  },
];

async function main() {
  // "Latest Drip" is the storefront's newest-first listing, not a category. Older seeds made
  // one; remove it while it is still empty.
  await prisma.category.deleteMany({ where: { slug: 'latest', products: { none: {} } } });

  const categoryIds = new Map<string, string>();
  for (const c of categories) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: c,
    });
    categoryIds.set(c.slug, row.id);
  }

  await prisma.product.deleteMany({ where: { slug: { in: seedProducts.map((p) => p.slug) } } });

  for (const p of seedProducts) {
    const product = await prisma.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        status: 'ACTIVE',
        categoryId: categoryIds.get(p.category)!,
        description: `${p.name}. Designed in Kashmir, made to move with you.`,
        fabric: p.fabric,
        care: 'Machine wash cold, inside out. Do not tumble dry.',
        hsnCode: '6110',
        tags: p.tags,
        isFeatured: p.featuredRank !== undefined,
        featuredRank: p.featuredRank,
        images: {
          create: p.images.map((name, position) => ({ url: img(name), alt: p.name, position })),
        },
      },
    });

    const sizeOption = await prisma.productOption.create({
      data: {
        productId: product.id,
        name: 'Size',
        position: 0,
        values: { create: SIZES.map((value, position) => ({ value, position })) },
      },
      include: { values: true },
    });
    const colourOption = p.colours
      ? await prisma.productOption.create({
          data: {
            productId: product.id,
            name: 'Colour',
            position: 1,
            values: { create: p.colours.map((c, position) => ({ ...c, position })) },
          },
          include: { values: true },
        })
      : null;

    const colourValues = colourOption?.values ?? [null];
    let position = 0;
    for (const colour of colourValues) {
      for (const size of sizeOption.values) {
        const skuParts = [p.slug.toUpperCase().replace(/-/g, '').slice(0, 10), size.value];
        if (colour) skuParts.push(colour.value.replace(/\s/g, '').slice(0, 5).toUpperCase());
        await prisma.variant.create({
          data: {
            productId: product.id,
            sku: skuParts.join('-'),
            price: rupees(p.price),
            compareAtPrice: p.compareAt ? rupees(p.compareAt) : null,
            stock: p.stock[size.value] ?? 0,
            position: position++,
            optionValues: {
              create: [size, colour]
                .filter((v) => v !== null)
                .map((v) => ({ optionValueId: v.id })),
            },
          },
        });
      }
    }
  }

  const winter = await prisma.collection.upsert({
    where: { slug: 'winter-26' },
    create: { slug: 'winter-26', name: 'Winter 26', type: 'MANUAL' },
    update: {},
  });
  const winterProducts = await prisma.product.findMany({
    where: { tags: { has: 'winter' } },
    select: { id: true },
  });
  await prisma.collectionProduct.deleteMany({ where: { collectionId: winter.id } });
  await prisma.collectionProduct.createMany({
    data: winterProducts.map((p, i) => ({ collectionId: winter.id, productId: p.id, position: i })),
  });

  await prisma.collection.upsert({
    where: { slug: 'under-3000' },
    create: {
      slug: 'under-3000',
      name: 'Under ₹3,000',
      type: 'RULE',
      rules: { maxPrice: rupees(3000) },
    },
    update: {},
  });

  if (process.env.NODE_ENV !== 'production') {
    await prisma.adminUser.upsert({
      where: { email: 'owner@noors.local' },
      create: {
        email: 'owner@noors.local',
        name: 'Store Owner',
        role: 'OWNER',
        passwordHash: await hashPassword('noors-dev-password'),
      },
      update: {},
    });
  }

  if ((await prisma.banner.count()) === 0) {
    await prisma.banner.createMany({
      data: [
        { placement: 'ANNOUNCEMENT', title: 'Winter sale 50% off use coupon code: WINTER50' },
        ...[1, 2, 3, 4].map((n, i) => ({
          placement: 'HERO' as const,
          title: i === 0 ? 'Clothing beyond time.' : null,
          subtitle: i === 0 ? 'Wear your story, every single drop.' : null,
          imageUrl: img(`lookbook-${n}`),
          position: i,
        })),
        ...[
          ['Jackets', 'jackets', 'lookbook-1'],
          ['Hoodies', 'hoodies', 'kashmir-heritage-hoodie-1'],
          ['Overshirts', 'overshirts', 'lookbook-4'],
          ['Latest Drip', 'latest', 'lookbook-2'],
        ].map(([title, slug, image], i) => ({
          placement: 'CATEGORY_TILE' as const,
          title,
          imageUrl: img(image!),
          linkUrl: `/shop/${slug}`,
          position: i,
        })),
      ],
    });
  }

  const counts = {
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    variants: await prisma.variant.count(),
    banners: await prisma.banner.count(),
    admins: await prisma.adminUser.count(),
  };
  console.log('Seeded', counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
