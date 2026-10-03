'use client';

import { formatINR, type AdminOrderRowDto, type Paginated } from '@noors/shared';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useAdminData } from '@/lib/admin/api';
import { EmptyState, ErrorNote, Input, PageHeader, Select, Spinner, cx } from '../../ui';
import { OrderStatusBadge, Pager, PaymentBadge, formatDate } from '../format';
import { AttentionBadge, ORDER_FILTERS } from './parts';

const LIMIT = 25;

/** Order list with filters kept in the URL (?status=&payment=&from=&to=&q=&page=). */
export function OrderList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get('q') ?? '';
  const status = params.get('status') || 'OPEN';
  const payment = params.get('payment') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page), status });
  if (q) query.set('q', q);
  if (payment) query.set('payment', payment);
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const { data, error, loading } = useAdminData<Paginated<AdminOrderRowDto>>(`/orders?${query}`);

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

  const filtered = Boolean(q || payment || from || to || status !== 'OPEN');
  const href = (row: AdminOrderRowDto) => `/admin/orders/${encodeURIComponent(row.number)}`;

  return (
    <>
      <PageHeader
        title="Orders"
        description={data ? `${data.total} ${data.total === 1 ? 'order' : 'orders'}` : ' '}
      />

      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Order number, phone or email"
            aria-label="Search orders"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => update({ status: e.target.value === 'OPEN' ? '' : e.target.value })}
            className="sm:w-44"
          >
            {ORDER_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Payment method"
            value={payment}
            onChange={(e) => update({ payment: e.target.value })}
            className="sm:w-40"
          >
            <option value="">All payments</option>
            <option value="RAZORPAY">Online</option>
            <option value="COD">Cash on delivery</option>
          </Select>
          <Input
            type="date"
            aria-label="From date"
            title="From"
            value={from}
            max={to || undefined}
            onChange={(e) => update({ from: e.target.value })}
            className="sm:w-40"
          />
          <Input
            type="date"
            aria-label="To date"
            title="To"
            value={to}
            min={from || undefined}
            onChange={(e) => update({ to: e.target.value })}
            className="sm:w-40"
          />
        </div>
      </div>

      <ErrorNote error={error} />

      {!data ? (
        !error && <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title={filtered ? 'No orders match' : 'No open orders'}>
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
            'New orders will show up here as soon as they are paid.'
          )}
        </EmptyState>
      ) : (
        <div
          className={cx(
            'overflow-hidden rounded-xl border border-line bg-background transition-opacity',
            loading && 'opacity-60',
          )}
        >
          {/* Mobile: stacked cards */}
          <ul className="divide-y divide-line md:hidden">
            {data.items.map((o) => (
              <li key={o.number}>
                <Link href={href(o)} className="block px-4 py-3 hover:bg-surface/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{o.number}</p>
                      <p className="truncate text-sm text-muted">
                        {o.name} · {o.city}
                      </p>
                    </div>
                    <p className="font-medium whitespace-nowrap tabular-nums">
                      {formatINR(o.total)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <OrderStatusBadge status={o.status} />
                    <PaymentBadge status={o.paymentStatus} cod={o.paymentMethod === 'COD'} />
                    <AttentionBadge reason={o.attention} />
                    <span className="ml-auto">
                      {formatDate(o.placedAt ?? o.createdAt)} · {o.itemCount}{' '}
                      {o.itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Customer</th>
                <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Items</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="px-3 py-2.5 font-medium">Payment</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((o) => (
                <tr
                  key={o.number}
                  onClick={() => router.push(href(o))}
                  className="cursor-pointer hover:bg-surface/60"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <Link
                      href={href(o)}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium hover:underline"
                    >
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                    {formatDate(o.placedAt ?? o.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="max-w-56 truncate">{o.name}</div>
                    <div className="truncate text-xs text-muted">{o.city}</div>
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums lg:table-cell">
                    {o.itemCount}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                    {formatINR(o.total)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      <PaymentBadge status={o.paymentStatus} cod={o.paymentMethod === 'COD'} />
                      <span className="text-xs text-muted">
                        {o.paymentMethod === 'COD' ? 'COD' : 'Online'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      <OrderStatusBadge status={o.status} />
                      <AttentionBadge reason={o.attention} />
                    </div>
                  </td>
                </tr>
              ))}
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
  );
}
