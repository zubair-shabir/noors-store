import type {
  BannerDto,
  BannerPlacement,
  CategoryDto,
  Paginated,
  ProductDetailDto,
  ProductListQuery,
  ProductSummaryDto,
  StoreInfoDto,
} from '@noors/shared';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { contactEmail } from './site';

/*
 * Server-side reads of the public catalogue API. Pages render per request (so builds never
 * need the API running), while each response is cached for a minute, matching the API's own
 * s-maxage. Dashboard edits therefore reach the store within about a minute.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const REVALIDATE_SECONDS = 60;

async function get<T>(path: string, tags: string[] = ['catalog']): Promise<T | null> {
  await connection();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    next: { revalidate: REVALIDATE_SECONDS, tags },
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

/** What the API's DEFAULT_SETTINGS give, for when the API cannot be reached. */
const DEFAULT_STORE_INFO: StoreInfoDto = {
  name: "Noor's",
  email: '',
  phone: '',
  address: 'Srinagar, Jammu and Kashmir',
  gstNumber: '',
  shipping: { fee: 9900, freeAbove: 199900 },
  cod: { enabled: false, fee: 0 },
  returns: { windowDays: 7 },
};

/**
 * Store details and shipping, COD and return terms from the live settings (policy pages, FAQ).
 * Never throws; a blank store email is filled in with the site's contact address.
 */
export async function getStoreInfo(): Promise<StoreInfoDto> {
  const info = await orFallback(
    async () =>
      (await get<StoreInfoDto>('/store-info', ['catalog', 'settings'])) ?? DEFAULT_STORE_INFO,
    DEFAULT_STORE_INFO,
  );
  return { ...info, email: info.email || contactEmail };
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
