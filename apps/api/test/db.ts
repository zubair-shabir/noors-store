import { createPrisma, type PrismaClient } from '../src/lib/prisma.js';
import { testDatabaseUrl } from './test-database-url.js';

/**
 * Integration tests run against a real Postgres database of their own (TEST_DATABASE_URL);
 * test/global-setup.ts creates it and applies migrations. Locally `pnpm db:up` is enough.
 */
export function testPrisma(): PrismaClient {
  return createPrisma(testDatabaseUrl());
}

/** Empties every table except Prisma's migration history, and restarts order numbers. */
export async function resetDatabase(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  // Not owned by a column, so RESTART IDENTITY leaves it alone.
  await prisma.$executeRawUnsafe('ALTER SEQUENCE IF EXISTS order_number_seq RESTART');
}

interface FixtureVariant {
  size: string;
  colour?: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  reserved?: number;
  isActive?: boolean;
}

interface FixtureProduct {
  slug: string;
  name: string;
  categoryId: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  isFeatured?: boolean;
  featuredRank?: number;
  tags?: string[];
  createdAt?: Date;
  images?: string[];
  variants: FixtureVariant[];
}

/** Creates a product with Size (and Colour, when any variant names one) options and variants. */
export async function createProduct(prisma: PrismaClient, p: FixtureProduct) {
  const product = await prisma.product.create({
    data: {
      slug: p.slug,
      name: p.name,
      categoryId: p.categoryId,
      status: p.status ?? 'ACTIVE',
      isFeatured: p.isFeatured ?? false,
      featuredRank: p.featuredRank,
      tags: p.tags ?? [],
      createdAt: p.createdAt,
      images: {
        create: (
          p.images ?? [`/img/${p.slug}-1.webp`, `/img/${p.slug}-2.webp`, `/img/${p.slug}-3.webp`]
        ).map((url, position) => ({ url, position })),
      },
    },
  });

  const sizes = [...new Set(p.variants.map((v) => v.size))];
  const colours = [...new Set(p.variants.flatMap((v) => (v.colour ? [v.colour] : [])))];
  const size = await prisma.productOption.create({
    data: {
      productId: product.id,
      name: 'Size',
      values: { create: sizes.map((value, position) => ({ value, position })) },
    },
    include: { values: true },
  });
  const colour = colours.length
    ? await prisma.productOption.create({
        data: {
          productId: product.id,
          name: 'Colour',
          position: 1,
          values: { create: colours.map((value, position) => ({ value, position })) },
        },
        include: { values: true },
      })
    : null;

  for (const [i, v] of p.variants.entries()) {
    const valueIds = [size.values.find((s) => s.value === v.size)!.id];
    if (v.colour) valueIds.push(colour!.values.find((c) => c.value === v.colour)!.id);
    await prisma.variant.create({
      data: {
        productId: product.id,
        sku: `${p.slug}-${v.size}-${v.colour ?? 'x'}`.toUpperCase(),
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        stock: v.stock,
        reserved: v.reserved ?? 0,
        isActive: v.isActive ?? true,
        position: i,
        optionValues: { create: valueIds.map((optionValueId) => ({ optionValueId })) },
      },
    });
  }
  return product;
}
