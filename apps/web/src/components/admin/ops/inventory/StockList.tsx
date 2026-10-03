'use client';

import type { AdminStockRowDto, Paginated } from '@noors/shared';
import { Info, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useAdminData } from '@/lib/admin/api';
import { Thumb } from '../../Thumb';
import { Badge, Button, cx, EmptyState, ErrorNote, Input, PageHeader, Spinner } from '../../ui';
import { Pager } from '../format';
import { AdjustStockModal } from './AdjustStockModal';
import { StockHistory } from './StockHistory';

const LIMIT = 50;
const HELD_HINT = 'Held by checkouts awaiting payment';

const TABS = [
  { value: 'low', label: 'Low stock' },
  { value: 'all', label: 'All variants' },
  { value: 'history', label: 'Stock history' },
] as const;
type Tab = (typeof TABS)[number]['value'];

type StockPage = Paginated<AdminStockRowDto> & { threshold: number };

/** Stock levels with tabs and search in the URL (?tab=&q=&page=&variantId=). */
export function StockList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const rawTab = params.get('tab');
  const tab: Tab = TABS.find((t) => t.value === rawTab)?.value ?? 'low';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const variantId = params.get('variantId') ?? '';

  const [search, setSearch] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [adjusting, setAdjusting] = useState<AdminStockRowDto | null>(null);

  const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (tab === 'low') query.set('low', 'true');
  if (q) query.set('q', q);
  const { data, error, loading, setData } = useAdminData<StockPage>(
    tab === 'history' ? null : `/inventory?${query}`,
  );

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

  function onAdjusted(id: string, stock: number) {
    if (data) {
      setData({
        ...data,
        items: data.items.map((r) => (r.variantId === id ? { ...r, stock } : r)),
      });
    }
    setAdjusting(null);
  }

  const threshold = data?.threshold;

  return (
    <>
      <PageHeader
        title="Stock"
        description={
          tab === 'low' && threshold !== undefined
            ? `At or below ${threshold} available`
            : tab === 'history'
              ? 'Every change to stock, newest first'
              : 'Stock for every variant'
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => update({ tab: t.value === 'low' ? '' : t.value, variantId: '' })}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition',
              tab === t.value
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <StockHistory
          variantId={variantId}
          page={page}
          onPage={(p) => update({ page: p > 1 ? String(p) : '' })}
          onClearVariant={() => update({ variantId: '' })}
        />
      ) : (
        <>
          <div className="relative mb-4">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search by product name or SKU"
              aria-label="Search stock"
              className="pl-9"
            />
          </div>

          <ErrorNote error={error} />

          {!data ? (
            !error && <Spinner />
          ) : data.items.length === 0 ? (
            <EmptyState
              title={
                q ? 'Nothing matches' : tab === 'low' ? 'Nothing is running low' : 'No variants yet'
              }
            >
              {q ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setSearch('');
                    update({ q: '' });
                  }}
                >
                  Clear search
                </button>
              ) : tab === 'low' ? (
                `Every active variant has more than ${data.threshold} available.`
              ) : null}
            </EmptyState>
          ) : (
            <div
              className={`overflow-hidden rounded-xl border border-line bg-background transition-opacity ${loading ? 'opacity-60' : ''}`}
            >
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="hidden px-3 py-2.5 font-medium lg:table-cell">SKU</th>
                    <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                      In stock
                    </th>
                    <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                      <span className="inline-flex items-center gap-1" title={HELD_HINT}>
                        Held
                        <Info className="size-3.5" aria-label={HELD_HINT} />
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">Available</th>
                    <th className="px-4 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((row) => {
                    const available = row.stock - row.reserved;
                    const low = available <= data.threshold;
                    return (
                      <tr key={row.variantId} className={row.isActive ? '' : 'opacity-70'}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <Thumb src={row.image} />
                            <div className="min-w-0">
                              <Link
                                href={`/admin/products/${row.productId}`}
                                className="line-clamp-2 font-medium hover:underline"
                              >
                                {row.productName}
                              </Link>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                                <span>{row.title}</span>
                                <span className="lg:hidden">{row.sku}</span>
                                {!row.isActive && <Badge>Hidden</Badge>}
                              </p>
                              <p className="mt-0.5 text-xs text-muted sm:hidden">
                                {row.stock} in stock
                                {row.reserved > 0 && `, ${row.reserved} held`}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted lg:table-cell">
                          {row.sku}
                        </td>
                        <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                          {row.stock}
                        </td>
                        <td
                          className="hidden px-3 py-2.5 text-right text-muted tabular-nums sm:table-cell"
                          title={row.reserved > 0 ? HELD_HINT : undefined}
                        >
                          {row.reserved}
                        </td>
                        <td
                          className={cx(
                            'px-3 py-2.5 text-right font-medium tabular-nums',
                            low && 'text-red-700 dark:text-red-400',
                          )}
                        >
                          {available}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setSearch('');
                                update({ tab: 'history', variantId: row.variantId, q: '' });
                              }}
                              className="text-xs text-muted hover:text-foreground hover:underline"
                            >
                              History
                            </button>
                            <Button size="sm" onClick={() => setAdjusting(row)}>
                              Adjust
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data && data.items.length > 0 && (
            <Pager
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onPage={(p) => update({ page: p > 1 ? String(p) : '' })}
            />
          )}
        </>
      )}

      <AdjustStockModal row={adjusting} onClose={() => setAdjusting(null)} onDone={onAdjusted} />
    </>
  );
}
