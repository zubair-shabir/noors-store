import type {
  BannerDto,
  BannerPlacement,
  CategoryDto,
  Paginated,
  ProductDetailDto,
  ProductListQuery,
  ProductSummaryDto,
} from '@noors/shared';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';

/*
 * Server-side reads of the public catalogue API. Pages render per request (so builds never
 * need the API running), while each response is cached for a minute, matching the API's own
 * s-maxage. Dashboard edits therefore reach the store within about a minute.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const REVALIDATE_SECONDS = 60;

async function get<T>(path: string): Promise<T | null> {
  await connection();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    next: { revalidate: REVALIDATE_SECONDS, tags: ['catalog'] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Catalogue API ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

type ListQuery = Partial<Omit<ProductListQuery, 'size' | 'colour'>> & {
  size?: string[];
  colour?: string[];
};

function toSearch(query: ListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0))
      continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function getCategories(): Promise<CategoryDto[]> {
  return (await get<{ items: CategoryDto[] }>('/categories'))?.items ?? [];
}

export const getCategory = (slug: string) =>
  get<CategoryDto>(`/categories/${encodeURIComponent(slug)}`);

export async function listProducts(query: ListQuery = {}): Promise<Paginated<ProductSummaryDto>> {
  const empty = { items: [], page: 1, limit: query.limit ?? 24, total: 0, totalPages: 1 };
  return (await get<Paginated<ProductSummaryDto>>(`/products${toSearch(query)}`)) ?? empty;
}

export const getProduct = (slug: string) =>
  get<ProductDetailDto>(`/products/${encodeURIComponent(slug)}`);

export async function getFeatured(): Promise<ProductSummaryDto[]> {
  return (await get<{ items: ProductSummaryDto[] }>('/featured'))?.items ?? [];
}

export async function getBanners(placement: BannerPlacement): Promise<BannerDto[]> {
  return (await get<{ items: BannerDto[] }>(`/banners?placement=${placement}`))?.items ?? [];
}

/** Like `fn()`, but logs and returns `fallback` when the API is unreachable. */
export async function orFallback<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Next signals dynamic rendering and notFound() by throwing; those must pass through.
    unstable_rethrow(err);
    console.error(err);
    return fallback;
  }
}
