import type {
  CategoryDto,
  Paginated,
  ProductDetailDto,
  ProductListQuery,
  ProductSummaryDto,
} from '@noors/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  displayVariant,
  isInStock,
  productInclude,
  toProductDetail,
  toProductSummary,
  type ProductWithRelations,
} from './catalog.mapper.js';

/** Filters a collection's rules may set. Prices in paise. */
export interface CollectionRules {
  categorySlug?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
}

type ListFilters = Omit<ProductListQuery, 'page' | 'limit' | 'sort'> & { tag?: string };

function optionFilter(name: string, values: string[] | undefined): Prisma.VariantWhereInput[] {
  if (!values?.length) return [];
  return [
    {
      optionValues: {
        some: {
          optionValue: {
            value: { in: values, mode: 'insensitive' },
            option: { name: { equals: name, mode: 'insensitive' } },
          },
        },
      },
    },
  ];
}

function buildWhere(f: ListFilters): Prisma.ProductWhereInput {
  // Size, colour and price must all match on the same variant.
  const variantMatch: Prisma.VariantWhereInput = {
    isActive: true,
    price: { gte: f.minPrice, lte: f.maxPrice },
    AND: [...optionFilter('size', f.size), ...optionFilter('colour', f.colour)],
  };
  const search = f.q
    ? {
        OR: [
          { name: { contains: f.q, mode: 'insensitive' } },
          { tags: { has: f.q.toLowerCase() } },
          { category: { name: { contains: f.q, mode: 'insensitive' } } },
        ] satisfies Prisma.ProductWhereInput[],
      }
    : {};
  return {
    status: 'ACTIVE',
    category: f.category ? { slug: f.category } : undefined,
    tags: f.tag ? { has: f.tag } : undefined,
    variants: { some: variantMatch },
    ...search,
  };
}

/**
 * Sorts in memory: the catalogue is a boutique range (tens to a few hundred products),
 * and price sorting needs each product's display variant, which SQL ordering can't see.
 * Sold-out products always go last, as the PRD asks.
 */
function sortProducts(products: ProductWithRelations[], sort: ProductListQuery['sort']) {
  const price = (p: ProductWithRelations) => displayVariant(p)?.price ?? 0;
  const bySort = (a: ProductWithRelations, b: ProductWithRelations) => {
    if (sort === 'price_asc') return price(a) - price(b);
    if (sort === 'price_desc') return price(b) - price(a);
    return b.createdAt.getTime() - a.createdAt.getTime();
  };
  return [...products].sort((a, b) => Number(isInStock(b)) - Number(isInStock(a)) || bySort(a, b));
}

export class CatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCategories(): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
    });
    return rows.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      imageUrl: c.imageUrl,
      productCount: c._count.products,
    }));
  }

  async getCategory(slug: string): Promise<CategoryDto | null> {
    const categories = await this.listCategories();
    return categories.find((c) => c.slug === slug) ?? null;
  }

  async listProducts(
    query: ProductListQuery & { tag?: string },
  ): Promise<Paginated<ProductSummaryDto>> {
    const rows = await this.prisma.product.findMany({
      where: buildWhere(query),
      include: productInclude,
    });
    const sorted = sortProducts(rows, query.sort);
    const start = (query.page - 1) * query.limit;
    return {
      items: sorted.slice(start, start + query.limit).map(toProductSummary),
      page: query.page,
      limit: query.limit,
      total: sorted.length,
      totalPages: Math.max(1, Math.ceil(sorted.length / query.limit)),
    };
  }

  async getProduct(slug: string): Promise<ProductDetailDto | null> {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: 'ACTIVE' },
      include: productInclude,
    });
    return product ? toProductDetail(product) : null;
  }

  async listFeatured(): Promise<ProductSummaryDto[]> {
    const rows = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', isFeatured: true },
      orderBy: [{ featuredRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: productInclude,
    });
    return rows.map(toProductSummary);
  }

  async search(q: string, limit = 8): Promise<ProductSummaryDto[]> {
    const { items } = await this.listProducts({ q, sort: 'newest', page: 1, limit });
    return items;
  }

  async getCollection(slug: string) {
    const collection = await this.prisma.collection.findFirst({
      where: { slug, isActive: true },
      include: {
        products: {
          orderBy: { position: 'asc' },
          where: { product: { status: 'ACTIVE' } },
          include: { product: { include: productInclude } },
        },
      },
    });
    if (!collection) return null;

    let products: ProductSummaryDto[];
    if (collection.type === 'MANUAL') {
      products = collection.products.map((cp) => toProductSummary(cp.product));
    } else {
      const rules = (collection.rules ?? {}) as CollectionRules;
      ({ items: products } = await this.listProducts({
        category: rules.categorySlug,
        tag: rules.tag,
        minPrice: rules.minPrice,
        maxPrice: rules.maxPrice,
        sort: 'newest',
        page: 1,
        limit: 60,
      }));
    }

    return {
      slug: collection.slug,
      name: collection.name,
      description: collection.description,
      imageUrl: collection.imageUrl,
      products,
    };
  }
}
