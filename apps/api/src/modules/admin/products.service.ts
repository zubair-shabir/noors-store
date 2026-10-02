import {
  slugify,
  type AdminProductDto,
  type adminProductListQuerySchema,
  type AdminProductRowDto,
  type AdminVariantDto,
  type Paginated,
  type productCreateSchema,
  type productImagesInputSchema,
  type productOptionsInputSchema,
  type productUpdateSchema,
  type SizeChartRow,
  type variantsUpdateSchema,
} from '@noors/shared';
import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { sanitizeDescription } from '../../lib/sanitize.js';
import { audit } from './audit.js';

type CreateInput = z.output<typeof productCreateSchema>;
type UpdateInput = z.output<typeof productUpdateSchema>;
type OptionsInput = z.output<typeof productOptionsInputSchema>;
type VariantsInput = z.output<typeof variantsUpdateSchema>;
type ImagesInput = z.output<typeof productImagesInputSchema>;
type Tx = Prisma.TransactionClient;

const detailInclude = {
  options: { orderBy: { position: 'asc' }, include: { values: { orderBy: { position: 'asc' } } } },
  variants: { orderBy: { position: 'asc' }, include: { optionValues: true } },
  images: { orderBy: { position: 'asc' } },
} satisfies Prisma.ProductInclude;

type ProductWithDetail = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

const optionalJson = (v: SizeChartRow[] | null | undefined) =>
  v === undefined ? undefined : v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);

/** "M / Olive", following option order; "Default" for a product without options. */
function variantTitle(product: ProductWithDetail, valueIds: string[]): string {
  const parts = product.options.flatMap((o) =>
    o.values.filter((v) => valueIds.includes(v.id)).map((v) => v.value),
  );
  return parts.length ? parts.join(' / ') : 'Default';
}

function toDto(p: ProductWithDetail): AdminProductDto {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    status: p.status,
    categoryId: p.categoryId,
    tags: p.tags,
    fabric: p.fabric,
    care: p.care,
    sizeChart: (p.sizeChart as SizeChartRow[] | null) ?? null,
    hsnCode: p.hsnCode,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    isFeatured: p.isFeatured,
    options: p.options.map((o) => ({
      id: o.id,
      name: o.name,
      values: o.values.map((v) => ({ id: v.id, value: v.value, swatch: v.swatch })),
    })),
    variants: p.variants.map((v): AdminVariantDto => {
      const optionValueIds = v.optionValues.map((ov) => ov.optionValueId);
      return {
        id: v.id,
        sku: v.sku,
        title: variantTitle(p, optionValueIds),
        optionValueIds,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        stock: v.stock,
        reserved: v.reserved,
        weightGrams: v.weightGrams,
        lengthCm: v.lengthCm,
        widthCm: v.widthCm,
        heightCm: v.heightCm,
        isActive: v.isActive,
      };
    }),
    images: p.images.map((i) => ({
      id: i.id,
      url: i.url,
      alt: i.alt,
      optionValueId: i.optionValueId,
    })),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Every combination of one value per option, in option order. */
function combinations(valueIdsPerOption: string[][]): string[][] {
  return valueIdsPerOption.reduce<string[][]>(
    (acc, ids) => acc.flatMap((combo) => ids.map((id) => [...combo, id])),
    [[]],
  );
}

// Option edits and duplicates touch many rows; give them more than the 5 s default.
const LONG_TX = { timeout: 20_000 };

const comboKey = (ids: string[]) => [...ids].sort().join('|');

export class AdminProductService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: z.output<typeof adminProductListQuerySchema>) {
    const { q, status, categoryId, page, limit } = query;
    const where: Prisma.ProductWhereInput = {
      status,
      categoryId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, name: true } },
          images: { orderBy: { position: 'asc' }, take: 1 },
          variants: { select: { price: true, stock: true, isActive: true } },
        },
      }),
    ]);
    const items = rows.map((p): AdminProductRowDto => {
      const prices = p.variants.map((v) => v.price);
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        category: p.category,
        imageUrl: p.images[0]?.url ?? null,
        variantCount: p.variants.length,
        stock: p.variants.filter((v) => v.isActive).reduce((sum, v) => sum + v.stock, 0),
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
        isFeatured: p.isFeatured,
        updatedAt: p.updatedAt.toISOString(),
      };
    });
    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    } satisfies Paginated<AdminProductRowDto>;
  }

  async get(id: string): Promise<AdminProductDto> {
    return toDto(await this.load(this.prisma, id));
  }

  async create(input: CreateInput, adminId: string): Promise<AdminProductDto> {
    const { price, sizeChart, description, ...fields } = input;
    if (fields.status === 'ACTIVE' && price <= 0) {
      throw new HttpError(400, 'Set a price before publishing', 'not_publishable');
    }
    const product = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          ...fields,
          description: sanitizeDescription(description),
          sizeChart: optionalJson(sizeChart),
          variants: { create: { sku: await uniqueSku(tx, fields.slug), price } },
        },
      });
      await audit(tx, adminId, 'create', 'product', product.id, { name: product.name });
      return product;
    });
    return this.get(product.id);
  }

  async update(id: string, input: UpdateInput, adminId: string): Promise<AdminProductDto> {
    const { sizeChart, description, ...fields } = input;
    await this.prisma.$transaction(async (tx) => {
      const current = await this.load(tx, id);
      if (input.status === 'ACTIVE' && current.status !== 'ACTIVE') assertPublishable(current);
      await tx.product.update({
        where: { id },
        data: {
          ...fields,
          ...(description !== undefined ? { description: sanitizeDescription(description) } : {}),
          sizeChart: optionalJson(sizeChart),
        },
      });
      await audit(tx, adminId, 'update', 'product', id, { fields: Object.keys(input) });
    });
    return this.get(id);
  }

  async remove(id: string, adminId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.delete({ where: { id } });
      await audit(tx, adminId, 'delete', 'product', id, { name: product.name, slug: product.slug });
    });
  }

  async duplicate(id: string, adminId: string): Promise<AdminProductDto> {
    const copyId = await this.prisma.$transaction(async (tx) => {
      const src = await this.load(tx, id);
      const slug = await uniqueSlug(tx, `${src.slug}-copy`);
      const copy = await tx.product.create({
        data: {
          name: `${src.name} (copy)`,
          slug,
          description: src.description,
          status: 'DRAFT',
          categoryId: src.categoryId,
          tags: src.tags,
          fabric: src.fabric,
          care: src.care,
          sizeChart: src.sizeChart ?? Prisma.DbNull,
          hsnCode: src.hsnCode,
          seoTitle: src.seoTitle,
          seoDescription: src.seoDescription,
        },
      });
      const valueMap = new Map<string, string>();
      for (const option of src.options) {
        const created = await tx.productOption.create({
          data: {
            productId: copy.id,
            name: option.name,
            position: option.position,
            values: {
              create: option.values.map((v) => ({
                value: v.value,
                swatch: v.swatch,
                position: v.position,
              })),
            },
          },
          include: { values: true },
        });
        for (const v of option.values) {
          valueMap.set(v.id, created.values.find((c) => c.value === v.value)!.id);
        }
      }
      for (const v of src.variants) {
        await tx.variant.create({
          data: {
            productId: copy.id,
            sku: await uniqueSku(
              tx,
              `${slug}-${variantTitle(
                src,
                v.optionValues.map((o) => o.optionValueId),
              )}`,
            ),
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            stock: 0,
            weightGrams: v.weightGrams,
            lengthCm: v.lengthCm,
            widthCm: v.widthCm,
            heightCm: v.heightCm,
            isActive: v.isActive,
            position: v.position,
            optionValues: {
              create: v.optionValues.map((o) => ({
                optionValueId: valueMap.get(o.optionValueId)!,
              })),
            },
          },
        });
      }
      await tx.productImage.createMany({
        data: src.images.map((i) => ({
          productId: copy.id,
          url: i.url,
          alt: i.alt,
          position: i.position,
          optionValueId: i.optionValueId ? (valueMap.get(i.optionValueId) ?? null) : null,
        })),
      });
      await audit(tx, adminId, 'duplicate', 'product', copy.id, { from: id });
      return copy.id;
    }, LONG_TX);
    return this.get(copyId);
  }

  /**
   * Replaces the product's options and regenerates variants: one per combination.
   * Existing variants keep their SKU, price and stock when their combination survives;
   * when a new option is added they take its first value. Variants for removed values go.
   */
  async setOptions(id: string, input: OptionsInput, adminId: string): Promise<AdminProductDto> {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.load(tx, id);
      const existingOptionNames = new Set(before.options.map((o) => o.name.toLowerCase()));

      // 1. Options and values: upsert by name, drop what is gone.
      const keptOptionIds: string[] = [];
      for (const [position, option] of input.options.entries()) {
        const match = before.options.find(
          (o) => o.name.toLowerCase() === option.name.toLowerCase(),
        );
        const saved = match
          ? await tx.productOption.update({
              where: { id: match.id },
              data: { name: option.name, position },
            })
          : await tx.productOption.create({ data: { productId: id, name: option.name, position } });
        keptOptionIds.push(saved.id);

        const keptValueIds: string[] = [];
        for (const [vPos, value] of option.values.entries()) {
          const existing = match?.values.find(
            (v) => v.value.toLowerCase() === value.value.toLowerCase(),
          );
          const v = existing
            ? await tx.optionValue.update({
                where: { id: existing.id },
                data: { value: value.value, swatch: value.swatch, position: vPos },
              })
            : await tx.optionValue.create({
                data: {
                  optionId: saved.id,
                  value: value.value,
                  swatch: value.swatch,
                  position: vPos,
                },
              });
          keptValueIds.push(v.id);
        }
        await tx.optionValue.deleteMany({
          where: { optionId: saved.id, id: { notIn: keptValueIds } },
        });
      }
      await tx.productOption.deleteMany({ where: { productId: id, id: { notIn: keptOptionIds } } });

      // 2. Map each existing variant onto the new options.
      const after = await this.load(tx, id);
      const optionValueIds = after.options.map((o) => o.values.map((v) => v.id));
      const claimed = new Map<string, string>(); // combo key -> variant id
      const remove: string[] = [];

      for (const variant of before.variants) {
        const oldValues = new Set(variant.optionValues.map((ov) => ov.optionValueId));
        const combo: string[] = [];
        let lost = false;
        for (const option of after.options) {
          const kept = option.values.find((v) => oldValues.has(v.id));
          if (kept) combo.push(kept.id);
          else if (!existingOptionNames.has(option.name.toLowerCase()))
            combo.push(option.values[0]!.id);
          else lost = true; // its value for this option was removed
        }
        const key = comboKey(combo);
        if (lost || claimed.has(key)) {
          remove.push(variant.id);
          continue;
        }
        claimed.set(key, variant.id);
        await tx.variantOptionValue.deleteMany({ where: { variantId: variant.id } });
        if (combo.length) {
          await tx.variantOptionValue.createMany({
            data: combo.map((optionValueId) => ({ variantId: variant.id, optionValueId })),
          });
        }
      }
      if (remove.length) await tx.variant.deleteMany({ where: { id: { in: remove } } });

      // 3. Create the missing combinations and order everything like the option grid.
      const prices = before.variants.map((v) => v.price);
      const price = input.defaultPrice ?? (prices.length ? Math.min(...prices) : 0);
      for (const [position, combo] of combinations(optionValueIds).entries()) {
        const key = comboKey(combo);
        const existingId = claimed.get(key);
        if (existingId) {
          await tx.variant.update({ where: { id: existingId }, data: { position } });
          continue;
        }
        const title = variantTitle(after, combo);
        await tx.variant.create({
          data: {
            productId: id,
            sku: await uniqueSku(tx, combo.length ? `${after.slug}-${title}` : after.slug),
            price,
            position,
            optionValues: { create: combo.map((optionValueId) => ({ optionValueId })) },
          },
        });
      }

      await audit(tx, adminId, 'set_options', 'product', id, {
        options: input.options.map((o) => `${o.name}: ${o.values.map((v) => v.value).join(', ')}`),
        removedVariants: remove.length,
      });
    }, LONG_TX);
    return this.get(id);
  }

  /** Bulk edit from the variant grid. Stock changes are written to the inventory log. */
  async updateVariants(
    id: string,
    input: VariantsInput,
    admin: { id: string; role: 'OWNER' | 'STAFF' },
  ): Promise<AdminProductDto> {
    if (admin.role === 'STAFF') {
      const extra = input.variants.flatMap((v) =>
        Object.keys(v).filter((k) => k !== 'id' && k !== 'stock'),
      );
      if (extra.length) throw new HttpError(403, 'Staff can only change stock', 'forbidden');
    }
    await this.prisma.$transaction(async (tx) => {
      const current = await this.load(tx, id);
      const byId = new Map(current.variants.map((v) => [v.id, v]));
      for (const change of input.variants) {
        const variant = byId.get(change.id);
        if (!variant)
          throw new HttpError(400, 'Variant does not belong to this product', 'invalid_reference');
        const { id: variantId, ...data } = change;
        const price = data.price ?? variant.price;
        const compareAt =
          data.compareAtPrice === undefined ? variant.compareAtPrice : data.compareAtPrice;
        if (compareAt !== null && compareAt <= price) {
          throw new HttpError(
            400,
            `${variant.sku}: compare-at price must be higher than the price`,
            'invalid_price',
          );
        }
        if (data.stock !== undefined && data.stock < variant.reserved) {
          throw new HttpError(
            400,
            `${variant.sku}: stock cannot go below the ${variant.reserved} units held by open checkouts`,
            'invalid_stock',
          );
        }
        await tx.variant.update({ where: { id: variantId }, data });
        if (data.stock !== undefined && data.stock !== variant.stock) {
          await tx.inventoryLog.create({
            data: {
              variantId,
              change: data.stock - variant.stock,
              reason: 'admin_adjustment',
              adminUserId: admin.id,
            },
          });
        }
      }
      if (current.status === 'ACTIVE') assertPublishable(await this.load(tx, id));
      await audit(tx, admin.id, 'update_variants', 'product', id, {
        variants: input.variants.map((v) => v.id),
      });
    });
    return this.get(id);
  }

  /** Replaces the gallery with the given ordered list. */
  async setImages(id: string, input: ImagesInput, adminId: string): Promise<AdminProductDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.load(tx, id);
      const valueIds = new Set(current.options.flatMap((o) => o.values.map((v) => v.id)));
      for (const image of input.images) {
        if (image.optionValueId && !valueIds.has(image.optionValueId)) {
          throw new HttpError(
            400,
            'Image linked to an option value of another product',
            'invalid_reference',
          );
        }
      }
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.productImage.createMany({
        data: input.images.map((image, position) => ({ ...image, productId: id, position })),
      });
      await audit(tx, adminId, 'set_images', 'product', id, { count: input.images.length });
    });
    return this.get(id);
  }

  private async load(db: PrismaClient | Tx, id: string): Promise<ProductWithDetail> {
    const product = await db.product.findUnique({ where: { id }, include: detailInclude });
    if (!product) throw new HttpError(404, 'Product not found', 'not_found');
    return product;
  }
}

/** A product can go live once it has at least one active variant with a price. */
function assertPublishable(p: ProductWithDetail) {
  if (!p.variants.some((v) => v.isActive && v.price > 0)) {
    throw new HttpError(
      400,
      'Add at least one active variant with a price before publishing',
      'not_publishable',
    );
  }
}

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await tx.product.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}

async function uniqueSku(tx: Tx, text: string): Promise<string> {
  const base = slugify(text).toUpperCase().slice(0, 56) || 'SKU';
  for (let n = 1; ; n++) {
    const sku = n === 1 ? base : `${base}-${n}`;
    if (!(await tx.variant.findUnique({ where: { sku }, select: { id: true } }))) return sku;
  }
}
