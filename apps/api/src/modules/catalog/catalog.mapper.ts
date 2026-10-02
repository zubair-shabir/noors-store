import type {
  ImageDto,
  OptionValueDto,
  ProductDetailDto,
  ProductSummaryDto,
  VariantDto,
} from '@noors/shared';
import type { Prisma } from '../../generated/prisma/client.js';

const LOW_STOCK = 5;

/** Relations loaded for every product we return. */
export const productInclude = {
  category: { select: { slug: true, name: true } },
  images: { orderBy: { position: 'asc' } },
  options: {
    orderBy: { position: 'asc' },
    include: { values: { orderBy: { position: 'asc' } } },
  },
  variants: {
    where: { isActive: true },
    orderBy: { position: 'asc' },
    include: { optionValues: { select: { optionValueId: true } } },
  },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

type VariantRow = ProductWithRelations['variants'][number];

export const availableUnits = (v: Pick<VariantRow, 'stock' | 'reserved'>) => v.stock - v.reserved;

/** The variant whose price represents the product: cheapest in stock, else cheapest overall. */
export function displayVariant(product: ProductWithRelations): VariantRow | undefined {
  const byPrice = [...product.variants].sort((a, b) => a.price - b.price);
  return byPrice.find((v) => availableUnits(v) > 0) ?? byPrice[0];
}

export function isInStock(product: ProductWithRelations): boolean {
  return product.variants.some((v) => availableUnits(v) > 0);
}

const toImage = (image: ProductWithRelations['images'][number]): ImageDto => ({
  url: image.url,
  alt: image.alt,
  optionValueId: image.optionValueId,
});

function optionValues(product: ProductWithRelations, name: string): OptionValueDto[] {
  const option = product.options.find((o) => o.name.toLowerCase() === name.toLowerCase());
  return (option?.values ?? []).map((v) => ({ id: v.id, value: v.value, swatch: v.swatch }));
}

export function toProductSummary(product: ProductWithRelations): ProductSummaryDto {
  const variant = displayVariant(product);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    price: variant?.price ?? 0,
    compareAtPrice: variant?.compareAtPrice ?? null,
    images: product.images.slice(0, 2).map(toImage),
    inStock: isInStock(product),
    sizes: optionValues(product, 'size').map((v) => v.value),
    colours: optionValues(product, 'colour'),
  };
}

const toVariant = (v: VariantRow): VariantDto => {
  const units = availableUnits(v);
  return {
    id: v.id,
    sku: v.sku,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    available: units > 0,
    lowStock: units > 0 && units < LOW_STOCK,
    optionValueIds: v.optionValues.map((o) => o.optionValueId),
  };
};

export function toProductDetail(product: ProductWithRelations): ProductDetailDto {
  return {
    ...toProductSummary(product),
    description: product.description,
    fabric: product.fabric,
    care: product.care,
    sizeChart: product.sizeChart,
    tags: product.tags,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    images: product.images.map(toImage),
    options: product.options.map((o) => ({
      name: o.name,
      values: o.values.map((v) => ({ id: v.id, value: v.value, swatch: v.swatch })),
    })),
    variants: product.variants.map(toVariant),
  };
}
