'use client';

import { formatINR, type AdminCustomerRowDto, type Paginated } from '@noors/shared';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useAdminData } from '@/lib/admin/api';
import { EmptyState, ErrorNote, Input, PageHeader, Select, Spinner } from '../../ui';
import { formatDate, Pager } from '../format';

const LIMIT = 25;
const SORTS = [
  { value: 'recent', label: 'Newest first' },
  { value: 'spent', label: 'Most spent' },
  { value: 'orders', label: 'Most orders' },
] as const;

/** Customer accounts with search and sort kept in the URL (?q=&sort=&page=). */
export function CustomerList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get('q') ?? '';
  const rawSort = params.get('sort');
  const sort = SORTS.find((s) => s.value === rawSort)?.value ?? 'recent';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const query = new URLSearchParams({ sort, page: String(page), limit: String(LIMIT) });
  if (q) query.set('q', q);
  const { data, error, loading } = useAdminData<Paginated<AdminCustomerRowDto>>(
    `/customers?${query}`,
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

  return (
    <>
      <PageHeader
        title="Customers"
        description={data ? `${data.total} ${data.total === 1 ? 'customer' : 'customers'}` : ' '}
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
            placeholder="Search by name, email or phone"
            aria-label="Search customers"
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Sort"
          value={sort}
          onChange={(e) => update({ sort: e.target.value === 'recent' ? '' : e.target.value })}
          className="sm:w-44"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      <ErrorNote error={error} />

      {!data ? (
        !error && <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title={q ? 'No customers match' : 'No customers yet'}>
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
          ) : (
            'Customers appear here once they create an account.'
          )}
        </EmptyState>
      ) : (
        <div
          className={`overflow-hidden rounded-xl border border-line bg-background transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Phone</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Orders</th>
                <th className="px-4 py-2.5 text-right font-medium sm:px-3">Spent</th>
                <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">
                  Last order
                </th>
                <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/admin/customers/${c.id}`)}
                  className="cursor-pointer hover:bg-surface/60"
                >
                  <td className="max-w-0 px-4 py-2.5">
                    <Link
                      href={`/admin/customers/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate font-medium hover:underline"
                    >
                      {c.name || c.email}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {c.name ? c.email : 'No name given'}
                      <span className="sm:hidden">
                        {' '}
                        · {c.orderCount} {c.orderCount === 1 ? 'order' : 'orders'}
                      </span>
                    </p>
                  </td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted md:table-cell">
                    {c.phone ?? 'Not given'}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                    {c.orderCount}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums sm:px-3">
                    {formatINR(c.totalSpent)}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right whitespace-nowrap text-muted lg:table-cell">
                    {c.lastOrderAt ? formatDate(c.lastOrderAt) : 'Never'}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right whitespace-nowrap text-muted lg:table-cell">
                    {formatDate(c.createdAt)}
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
