import type { ProductSort } from '@noors/shared';

/** Price bands offered on listing pages. Bounds are in paise. */
export const priceBands = [
  { key: 'under-2000', label: 'Under ₹2,000', maxPrice: 199999 },
  { key: '2000-3000', label: '₹2,000 to ₹3,000', minPrice: 200000, maxPrice: 300000 },
  { key: '3000-5000', label: '₹3,000 to ₹5,000', minPrice: 300000, maxPrice: 500000 },
  { key: 'over-5000', label: 'Over ₹5,000', minPrice: 500001 },
] as const satisfies { key: string; label: string; minPrice?: number; maxPrice?: number }[];

export const sortOptions: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

export interface ListingFilters {
  size: string[];
  colour: string[];
  price: string | null;
  sort: ProductSort;
  page: number;
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(',') : (v ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads listing filters from a page's search params, ignoring anything unexpected. */
export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): ListingFilters {
  const sort = sortOptions.find((o) => o.value === one(params.sort))?.value ?? 'newest';
  const price = priceBands.find((b) => b.key === one(params.price))?.key ?? null;
  const page = Math.max(1, Math.min(500, Number.parseInt(one(params.page) ?? '1', 10) || 1));
  return { size: list(params.size), colour: list(params.colour), price, sort, page };
}

/** The API query for these filters. */
export function toApiQuery(f: ListingFilters) {
  const band = priceBands.find((b) => b.key === f.price);
  return {
    size: f.size,
    colour: f.colour,
    minPrice: band && 'minPrice' in band ? band.minPrice : undefined,
    maxPrice: band && 'maxPrice' in band ? band.maxPrice : undefined,
    sort: f.sort,
    page: f.page,
  };
}

/** Search string for a listing URL, leaving out defaults. */
export function filtersToSearch(f: Partial<ListingFilters> & { q?: string }): string {
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  if (f.size?.length) params.set('size', f.size.join(','));
  if (f.colour?.length) params.set('colour', f.colour.join(','));
  if (f.price) params.set('price', f.price);
  if (f.sort && f.sort !== 'newest') params.set('sort', f.sort);
  if (f.page && f.page > 1) params.set('page', String(f.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}
