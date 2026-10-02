import { z } from 'zod';
import type { Paise } from './money.js';

/* Response shapes of the public catalogue API (/api/v1). Shared by the API and the storefront. */

export interface CategoryDto {
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
}

export interface ImageDto {
  url: string;
  alt: string | null;
  /** Set when the image belongs to one colour's gallery. */
  optionValueId: string | null;
}

export interface OptionValueDto {
  id: string;
  value: string;
  swatch: string | null;
}

export interface OptionDto {
  name: string;
  values: OptionValueDto[];
}

export interface ProductSummaryDto {
  id: string;
  slug: string;
  name: string;
  category: { slug: string; name: string };
  /** Lowest price among in-stock variants (or all variants when sold out). */
  price: Paise;
  compareAtPrice: Paise | null;
  images: ImageDto[];
  inStock: boolean;
  sizes: string[];
  colours: OptionValueDto[];
}

export interface VariantDto {
  id: string;
  sku: string;
  price: Paise;
  compareAtPrice: Paise | null;
  available: boolean;
  /** True when fewer than 5 units are left. */
  lowStock: boolean;
  optionValueIds: string[];
}

export interface ProductDetailDto extends Omit<ProductSummaryDto, 'images'> {
  description: string;
  fabric: string | null;
  care: string | null;
  sizeChart: unknown;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  images: ImageDto[];
  options: OptionDto[];
  variants: VariantDto[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const productSortSchema = z.enum(['newest', 'price_asc', 'price_desc']);
export type ProductSort = z.infer<typeof productSortSchema>;

const commaList = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .optional();

/** Query string for GET /products. Prices are in paise. */
export const productListQuerySchema = z.object({
  category: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  size: commaList,
  colour: commaList,
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  sort: productSortSchema.default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
