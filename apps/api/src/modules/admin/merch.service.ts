import type {
  AdminCategoryDto,
  AdminCollectionDto,
  AdminFeaturedDto,
  BannerDto,
  BannerPlacement,
  bannerInputSchema,
  categoryInputSchema,
  collectionInputSchema,
  CollectionRules,
} from '@noors/shared';
import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { audit } from './audit.js';

type CategoryInput = z.output<typeof categoryInputSchema>;
type CollectionInput = z.output<typeof collectionInputSchema>;
type BannerInput = z.output<typeof bannerInputSchema>;

const firstImage = {
  images: { orderBy: { position: 'asc' }, take: 1 },
} satisfies Prisma.ProductInclude;

/** Checks that `ids` is exactly the set `current` in some order. */
function assertSameSet(ids: string[], current: string[], what: string) {
  const a = new Set(ids);
  if (a.size !== ids.length || a.size !== current.length || current.some((id) => !a.has(id))) {
    throw new HttpError(400, `Send every ${what} exactly once`, 'invalid_order');
  }
}

/** Categories, collections, featured products and banners. */
export class AdminMerchService {
  constructor(private readonly prisma: PrismaClient) {}

  // ─── Categories ───────────────────────────────────────────────────────────

  async listCategories(): Promise<AdminCategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map(({ _count, ...c }) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      sortOrder: c.sortOrder,
      productCount: _count.products,
    }));
  }

  async createCategory(input: CategoryInput, adminId: string) {
    const last = await this.prisma.category.aggregate({ _max: { sortOrder: true } });
    const category = await this.prisma.category.create({
      data: { ...input, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    await audit(this.prisma, adminId, 'create', 'category', category.id, { slug: category.slug });
    return category;
  }

  async updateCategory(id: string, input: Partial<CategoryInput>, adminId: string) {
    const category = await this.prisma.category.update({ where: { id }, data: input });
    await audit(this.prisma, adminId, 'update', 'category', id, { fields: Object.keys(input) });
    return category;
  }

  async deleteCategory(id: string, adminId: string) {
    const count = await this.prisma.product.count({ where: { categoryId: id } });
    if (count > 0) {
      throw new HttpError(
        409,
        `Move or delete its ${count} product${count === 1 ? '' : 's'} first`,
        'category_in_use',
      );
    }
    await this.prisma.category.delete({ where: { id } });
    await audit(this.prisma, adminId, 'delete', 'category', id);
  }

  async reorderCategories(ids: string[], adminId: string) {
    const current = await this.prisma.category.findMany({ select: { id: true } });
    assertSameSet(
      ids,
      current.map((c) => c.id),
      'category',
    );
    await this.prisma.$transaction(
      ids.map((id, sortOrder) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    await audit(this.prisma, adminId, 'reorder', 'category', '*');
    return this.listCategories();
  }

  // ─── Collections ──────────────────────────────────────────────────────────

  async listCollections(): Promise<AdminCollectionDto[]> {
    const rows = await this.prisma.collection.findMany({ orderBy: { name: 'asc' } });
    return Promise.all(rows.map((c) => this.getCollection(c.id)));
  }

  async getCollection(id: string): Promise<AdminCollectionDto> {
    const c = await this.prisma.collection.findUnique({
      where: { id },
      include: {
        products: { orderBy: { position: 'asc' }, include: { product: { include: firstImage } } },
      },
    });
    if (!c) throw new HttpError(404, 'Collection not found', 'not_found');
    const rules = (c.rules as CollectionRules | null) ?? null;
    const products =
      c.type === 'MANUAL'
        ? c.products.map((cp) => cp.product)
        : await this.prisma.product.findMany({
            where: ruleWhere(rules ?? {}),
            orderBy: { createdAt: 'desc' },
            include: firstImage,
            take: 200,
          });
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      type: c.type,
      rules,
      isActive: c.isActive,
      productCount: products.length,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        imageUrl: p.images[0]?.url ?? null,
      })),
    };
  }

  async createCollection(input: CollectionInput, adminId: string) {
    const { productIds, rules, ...fields } = input;
    const id = await this.prisma.$transaction(async (tx) => {
      const c = await tx.collection.create({
        data: { ...fields, rules: fields.type === 'RULE' && rules ? rules : Prisma.DbNull },
      });
      if (fields.type === 'MANUAL' && productIds?.length) {
        await tx.collectionProduct.createMany({
          data: productIds.map((productId, position) => ({
            collectionId: c.id,
            productId,
            position,
          })),
        });
      }
      await audit(tx, adminId, 'create', 'collection', c.id, { slug: c.slug });
      return c.id;
    });
    return this.getCollection(id);
  }

  async updateCollection(id: string, input: CollectionInput, adminId: string) {
    const { productIds, rules, ...fields } = input;
    await this.prisma.$transaction(async (tx) => {
      await tx.collection.update({
        where: { id },
        data: { ...fields, rules: fields.type === 'RULE' && rules ? rules : Prisma.DbNull },
      });
      if (fields.type === 'RULE') {
        await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
      } else if (productIds) {
        await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
        await tx.collectionProduct.createMany({
          data: productIds.map((productId, position) => ({
            collectionId: id,
            productId,
            position,
          })),
        });
      }
      await audit(tx, adminId, 'update', 'collection', id, { fields: Object.keys(input) });
    });
    return this.getCollection(id);
  }

  async deleteCollection(id: string, adminId: string) {
    await this.prisma.collection.delete({ where: { id } });
    await audit(this.prisma, adminId, 'delete', 'collection', id);
  }

  // ─── Featured ─────────────────────────────────────────────────────────────

  async listFeatured(): Promise<AdminFeaturedDto[]> {
    const rows = await this.prisma.product.findMany({
      where: { isFeatured: true },
      orderBy: [{ featuredRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: firstImage,
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      imageUrl: p.images[0]?.url ?? null,
    }));
  }

  /** Makes exactly these products featured, in this order. */
  async setFeatured(productIds: string[], adminId: string) {
    if (new Set(productIds).size !== productIds.length) {
      throw new HttpError(400, 'A product is listed twice', 'invalid_order');
    }
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.product.count({ where: { id: { in: productIds } } });
      if (found !== productIds.length) {
        throw new HttpError(400, 'Unknown product in the list', 'invalid_reference');
      }
      await tx.product.updateMany({
        where: { isFeatured: true, id: { notIn: productIds } },
        data: { isFeatured: false, featuredRank: null },
      });
      for (const [rank, id] of productIds.entries()) {
        await tx.product.update({
          where: { id },
          data: { isFeatured: true, featuredRank: rank + 1 },
        });
      }
      await audit(tx, adminId, 'set_featured', 'product', '*', { productIds });
    });
    return this.listFeatured();
  }

  // ─── Banners ──────────────────────────────────────────────────────────────

  async listBanners(placement?: BannerPlacement, activeOnly = false): Promise<BannerDto[]> {
    const rows = await this.prisma.banner.findMany({
      where: { placement, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ placement: 'asc' }, { position: 'asc' }],
    });
    return rows.map((b) => ({
      id: b.id,
      placement: b.placement,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl,
      position: b.position,
      isActive: b.isActive,
    }));
  }

  async createBanner(input: BannerInput, adminId: string) {
    const last = await this.prisma.banner.aggregate({
      where: { placement: input.placement },
      _max: { position: true },
    });
    const banner = await this.prisma.banner.create({
      data: { ...input, position: (last._max.position ?? -1) + 1 },
    });
    await audit(this.prisma, adminId, 'create', 'banner', banner.id, {
      placement: banner.placement,
    });
    return banner;
  }

  async updateBanner(id: string, input: Partial<BannerInput>, adminId: string) {
    const banner = await this.prisma.banner.update({ where: { id }, data: input });
    await audit(this.prisma, adminId, 'update', 'banner', id, { fields: Object.keys(input) });
    return banner;
  }

  async deleteBanner(id: string, adminId: string) {
    await this.prisma.banner.delete({ where: { id } });
    await audit(this.prisma, adminId, 'delete', 'banner', id);
  }

  async reorderBanners(placement: BannerPlacement, ids: string[], adminId: string) {
    const current = await this.prisma.banner.findMany({
      where: { placement },
      select: { id: true },
    });
    assertSameSet(
      ids,
      current.map((b) => b.id),
      'banner',
    );
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.banner.update({ where: { id }, data: { position } })),
    );
    await audit(this.prisma, adminId, 'reorder', 'banner', placement);
    return this.listBanners(placement);
  }
}

/** Same rule semantics as the public catalogue: price rules apply to a single active variant. */
function ruleWhere(rules: CollectionRules): Prisma.ProductWhereInput {
  const price =
    rules.minPrice !== undefined || rules.maxPrice !== undefined
      ? { gte: rules.minPrice, lte: rules.maxPrice }
      : undefined;
  return {
    status: 'ACTIVE',
    ...(rules.categorySlug ? { category: { slug: rules.categorySlug } } : {}),
    ...(rules.tag ? { tags: { has: rules.tag } } : {}),
    ...(price ? { variants: { some: { isActive: true, price } } } : {}),
  };
}
