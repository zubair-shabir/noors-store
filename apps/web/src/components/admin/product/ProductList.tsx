'use client';

import {
  formatINR,
  type AdminCategoryDto,
  type AdminProductRowDto,
  type Paginated,
  type ProductStatus,
} from '@noors/shared';
import { Plus, Search, Star } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useAdminData } from '@/lib/admin/api';
import { useIsOwner } from '../AdminShell';
import { Thumb } from '../Thumb';
import {
  Button,
  ButtonLinkAdmin,
  EmptyState,
  ErrorNote,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
} from '../ui';

const LIMIT = 25;
const STATUSES: { value: '' | ProductStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

function priceRange(row: Pick<AdminProductRowDto, 'minPrice' | 'maxPrice'>): string {
  if (row.minPrice === null || row.maxPrice === null) return '—';
  return row.minPrice === row.maxPrice
    ? formatINR(row.minPrice)
    : `${formatINR(row.minPrice)} – ${formatINR(row.maxPrice)}`;
}

/** Product list with search and filters kept in the URL (?q=&status=&categoryId=&page=). */
export function ProductList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isOwner = useIsOwner();

  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page) });
  if (q) query.set('q', q);
  if (status) query.set('status', status);
  if (categoryId) query.set('categoryId', categoryId);
  const { data, error, loading } = useAdminData<Paginated<AdminProductRowDto>>(
    `/products?${query}`,
  );
  const { data: categories } = useAdminData<{ items: AdminCategoryDto[] }>('/categories');

  /** Writes filters to the URL. Changing a filter goes back to page 1. */
  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function onSearch(value: string) {
    setSearch(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ q: value.trim() }), 300);
  }

  const filtered = Boolean(q || status || categoryId);

  return (
    <>
      <PageHeader
        title="Products"
        description={data ? `${data.total} ${data.total === 1 ? 'product' : 'products'}` : ' '}
        actions={
          isOwner && (
            <ButtonLinkAdmin href="/admin/products/new" variant="primary">
              <Plus className="size-4" aria-hidden /> New product
            </ButtonLinkAdmin>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by name or SKU"
            aria-label="Search products"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => update({ status: e.target.value })}
            className="sm:w-36"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.value ? s.label : 'All statuses'}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Category"
            value={categoryId}
            onChange={(e) => update({ categoryId: e.target.value })}
            className="sm:w-44"
          >
            <option value="">All categories</option>
            {categories?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <ErrorNote error={error} />

      {!data ? (
        !error && <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title={filtered ? 'No products match' : 'No products yet'}>
          {filtered ? (
            <button
              type="button"
              className="underline"
              onClick={() => {
                setSearch('');
                router.replace(pathname);
              }}
            >
              Clear filters
            </button>
          ) : (
            isOwner && 'Create your first product to start selling.'
          )}
        </EmptyState>
      ) : (
        <div
          className={`overflow-hidden rounded-xl border border-line bg-background transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Status</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Category</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Stock</th>
                <th className="px-4 py-2.5 text-right font-medium sm:px-3">Price</th>
                <th className="hidden px-3 py-2.5 font-medium lg:table-cell">
                  <span className="sr-only">Featured</span>
                </th>
                <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/admin/products/${p.id}`)}
                  className="cursor-pointer hover:bg-surface/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Thumb src={p.imageUrl} />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/products/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="line-clamp-2 font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          <span className="sm:hidden">
                            <StatusBadge status={p.status} />
                          </span>
                          <span className="truncate">
                            {p.variantCount} {p.variantCount === 1 ? 'variant' : 'variants'}
                            <span className="sm:hidden"> · {p.stock} in stock</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted md:table-cell">{p.category.name}</td>
                  <td
                    className={`hidden px-3 py-2.5 text-right tabular-nums sm:table-cell ${p.stock === 0 ? 'text-red-700 dark:text-red-400' : ''}`}
                  >
                    {p.stock}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums sm:px-3">
                    {priceRange(p)}
                  </td>
                  <td className="hidden px-3 py-2.5 lg:table-cell">
                    {p.isFeatured && (
                      <Star
                        className="size-4 fill-amber-400 text-amber-500"
                        aria-label="Featured"
                      />
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right whitespace-nowrap text-muted lg:table-cell">
                    {dateFormat.format(new Date(p.updatedAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Pages">
          <p className="text-muted">
            {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of{' '}
            {data.total}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={data.page <= 1}
              onClick={() => update({ page: data.page > 2 ? String(data.page - 1) : '' })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              disabled={data.page >= data.totalPages}
              onClick={() => update({ page: String(data.page + 1) })}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}
