import { z } from 'zod';
import type { Paise } from './money.js';

/* Request and response shapes of the admin API (/api/v1/admin). Shared by the API and the dashboard. */

// ─── Auth ───────────────────────────────────────────────────────────────────

export const adminRoleSchema = z.enum(['OWNER', 'STAFF']);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export interface AdminMeDto {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

// ─── Shared pieces ──────────────────────────────────────────────────────────

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes');

/** Turns "Kashmir Heritage Hoodie" into "kashmir-heritage-hoodie". */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const paise = z.number().int().nonnegative();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Accepts an absolute http(s) URL or a site path such as /placeholder/hoodie.webp. */
export const imageUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v.startsWith('/') || /^https?:\/\//.test(v), 'Must be a URL or a path');

export const productStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export type ProductStatus = z.infer<typeof productStatusSchema>;

// ─── Products ───────────────────────────────────────────────────────────────

export const sizeChartRowSchema = z.object({
  size: z.string().trim().min(1).max(20),
  chestCm: z.number().nonnegative().nullable().optional(),
  lengthCm: z.number().nonnegative().nullable().optional(),
  shoulderCm: z.number().nonnegative().nullable().optional(),
  sleeveCm: z.number().nonnegative().nullable().optional(),
});
export type SizeChartRow = z.infer<typeof sizeChartRowSchema>;

const descriptionSchema = z.string().max(20000);
const tagsSchema = z.array(z.string().trim().toLowerCase().min(1).max(40)).max(30);

// No defaults here: under Zod 4 `.partial()` still fills defaults, which would make a
// partial update reset fields it never mentioned. Defaults live on productInputSchema only.
const productFields = z.object({
  name: z.string().trim().min(1).max(160),
  slug: slugSchema,
  /** Sanitised HTML from the rich text editor. */
  description: descriptionSchema,
  status: productStatusSchema,
  categoryId: z.string().min(1),
  tags: tagsSchema,
  fabric: optionalText(300),
  care: optionalText(1000),
  sizeChart: z.array(sizeChartRowSchema).max(20).nullish(),
  hsnCode: optionalText(20),
  seoTitle: optionalText(160),
  seoDescription: optionalText(320),
});

export const productInputSchema = productFields.extend({
  description: descriptionSchema.default(''),
  status: productStatusSchema.default('DRAFT'),
  tags: tagsSchema.default([]),
});
export type ProductInput = z.input<typeof productInputSchema>;

/** Creating a product also creates its first variant at this price (more come from options). */
export const productCreateSchema = productInputSchema.extend({ price: paise.default(0) });
export type ProductCreateInput = z.input<typeof productCreateSchema>;

/** Only the fields sent are changed. */
export const productUpdateSchema = productFields.partial();
export type ProductUpdateInput = z.input<typeof productUpdateSchema>;

export const adminProductListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: productStatusSchema.optional(),
  categoryId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminProductListQuery = z.input<typeof adminProductListQuerySchema>;

export interface AdminProductRowDto {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  category: { id: string; name: string };
  imageUrl: string | null;
  variantCount: number;
  /** Total units in stock across active variants. */
  stock: number;
  minPrice: Paise | null;
  maxPrice: Paise | null;
  isFeatured: boolean;
  updatedAt: string;
}

export interface AdminOptionValueDto {
  id: string;
  value: string;
  swatch: string | null;
}

export interface AdminOptionDto {
  id: string;
  name: string;
  values: AdminOptionValueDto[];
}

export interface AdminVariantDto {
  id: string;
  sku: string;
  /** e.g. "M / Olive". */
  title: string;
  optionValueIds: string[];
  price: Paise;
  compareAtPrice: Paise | null;
  stock: number;
  reserved: number;
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  isActive: boolean;
}

export interface AdminImageDto {
  id: string;
  url: string;
  alt: string | null;
  optionValueId: string | null;
}

export interface AdminProductDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: ProductStatus;
  categoryId: string;
  tags: string[];
  fabric: string | null;
  care: string | null;
  sizeChart: SizeChartRow[] | null;
  hsnCode: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  isFeatured: boolean;
  options: AdminOptionDto[];
  variants: AdminVariantDto[];
  images: AdminImageDto[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Replaces a product's options. The API then generates one variant per combination,
 * keeping existing variants whose combination still exists.
 */
export const productOptionsInputSchema = z.object({
  options: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        values: z
          .array(
            z.object({
              value: z.string().trim().min(1).max(40),
              swatch: z
                .string()
                .regex(/^#[0-9a-fA-F]{6}$/)
                .nullish()
                .transform((v) => v ?? null),
            }),
          )
          .min(1)
          .max(30),
      }),
    )
    .max(3)
    .refine(
      (opts) => new Set(opts.map((o) => o.name.toLowerCase())).size === opts.length,
      'Option names must be unique',
    )
    .refine(
      (opts) =>
        opts.every(
          (o) => new Set(o.values.map((v) => v.value.toLowerCase())).size === o.values.length,
        ),
      'Option values must be unique within an option',
    ),
  /** Price for newly created variants (defaults to the product's current lowest price). */
  defaultPrice: paise.optional(),
});
export type ProductOptionsInput = z.input<typeof productOptionsInputSchema>;

/** Bulk edit from the variant grid. Only the fields sent are changed. */
export const variantsUpdateSchema = z.object({
  variants: z
    .array(
      z.object({
        id: z.string().min(1),
        sku: z.string().trim().min(1).max(64).optional(),
        price: paise.optional(),
        compareAtPrice: paise.nullable().optional(),
        stock: z.number().int().nonnegative().optional(),
        weightGrams: z.number().int().positive().max(50000).optional(),
        lengthCm: z.number().int().positive().max(300).optional(),
        widthCm: z.number().int().positive().max(300).optional(),
        heightCm: z.number().int().positive().max(300).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type VariantsUpdateInput = z.input<typeof variantsUpdateSchema>;

/** The full ordered gallery; images left out are removed. */
export const productImagesInputSchema = z.object({
  images: z
    .array(
      z.object({
        url: imageUrlSchema,
        alt: optionalText(200),
        optionValueId: z
          .string()
          .nullish()
          .transform((v) => v ?? null),
      }),
    )
    .max(30),
});
export type ProductImagesInput = z.input<typeof productImagesInputSchema>;

// ─── Categories ─────────────────────────────────────────────────────────────

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slugSchema,
  description: optionalText(500),
  imageUrl: imageUrlSchema.nullish().transform((v) => v ?? null),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export interface AdminCategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  productCount: number;
}

export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).max(500),
});
export type ReorderInput = z.input<typeof reorderSchema>;

// ─── Collections ────────────────────────────────────────────────────────────

export const collectionRulesSchema = z.object({
  categorySlug: z.string().trim().min(1).optional(),
  tag: z.string().trim().toLowerCase().min(1).optional(),
  minPrice: paise.optional(),
  maxPrice: paise.optional(),
});
export type CollectionRules = z.infer<typeof collectionRulesSchema>;

export const collectionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: slugSchema,
    description: optionalText(500),
    imageUrl: imageUrlSchema.nullish().transform((v) => v ?? null),
    type: z.enum(['MANUAL', 'RULE']).default('MANUAL'),
    rules: collectionRulesSchema.nullish(),
    isActive: z.boolean().default(true),
    /** Ordered product ids for MANUAL collections. */
    productIds: z.array(z.string().min(1)).max(500).optional(),
  })
  .refine((c) => c.type !== 'RULE' || (c.rules && Object.keys(c.rules).length > 0), {
    message: 'A rule-based collection needs at least one rule',
    path: ['rules'],
  });
export type CollectionInput = z.input<typeof collectionInputSchema>;

export interface AdminCollectionDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  type: 'MANUAL' | 'RULE';
  rules: CollectionRules | null;
  isActive: boolean;
  productCount: number;
  products: { id: string; name: string; imageUrl: string | null; status: ProductStatus }[];
}

// ─── Featured ───────────────────────────────────────────────────────────────

export const featuredInputSchema = z.object({
  /** Featured products in home-page order; every other product is un-featured. */
  productIds: z.array(z.string().min(1)).max(50),
});
export type FeaturedInput = z.input<typeof featuredInputSchema>;

export interface AdminFeaturedDto {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  imageUrl: string | null;
}

// ─── Banners ────────────────────────────────────────────────────────────────

export const bannerPlacementSchema = z.enum(['HERO', 'ANNOUNCEMENT', 'CATEGORY_TILE']);
export type BannerPlacement = z.infer<typeof bannerPlacementSchema>;

const bannerFields = z.object({
  placement: bannerPlacementSchema,
  title: optionalText(160),
  subtitle: optionalText(300),
  imageUrl: imageUrlSchema.nullish().transform((v) => v ?? null),
  linkUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v.startsWith('/') || /^https?:\/\//.test(v), 'Must be a URL or a path')
    .nullish()
    .transform((v) => v ?? null),
  isActive: z.boolean(),
});

export const bannerInputSchema = bannerFields.extend({ isActive: z.boolean().default(true) });
export type BannerInput = z.input<typeof bannerInputSchema>;

/** Only the fields sent are changed. A banner keeps its placement. */
export const bannerUpdateSchema = bannerFields.omit({ placement: true }).partial();
export type BannerUpdateInput = z.input<typeof bannerUpdateSchema>;

export interface BannerDto {
  id: string;
  placement: BannerPlacement;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  position: number;
  isActive: boolean;
}

// ─── Uploads ────────────────────────────────────────────────────────────────

export interface UploadDto {
  url: string;
  width: number | null;
  height: number | null;
}
