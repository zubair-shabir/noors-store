'use client';

import { type AdminReturnDto, type Paginated } from '@noors/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useAdminData } from '@/lib/admin/api';
import { EmptyState, ErrorNote, PageHeader, Select, Spinner } from '../../ui';
import { Pager } from '../format';
import { ReturnActionModal, type ReturnAction } from './ReturnActionModal';
import { ReturnCard } from './ReturnCard';

const LIMIT = 20;

const FILTERS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'REQUESTED', label: 'Requested' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REJECTED', label: 'Declined' },
  { value: 'ALL', label: 'All' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

const isFilter = (v: string | null): v is Filter => FILTERS.some((f) => f.value === v);

/** Returns and exchanges, filtered by status in the URL (?status=&page=). */
export function ReturnList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = params.get('status');
  const status: Filter = isFilter(raw) ? raw : 'OPEN';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const query = new URLSearchParams({ status, page: String(page), limit: String(LIMIT) });
  const { data, error, loading, setData, reload } = useAdminData<Paginated<AdminReturnDto>>(
    `/returns?${query}`,
  );

  const [action, setAction] = useState<{ ret: AdminReturnDto; action: ReturnAction } | null>(null);

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

  function onUpdated(updated: AdminReturnDto) {
    if (!data) return;
    setData({ ...data, items: data.items.map((r) => (r.id === updated.id ? updated : r)) });
  }

  const label = FILTERS.find((f) => f.value === status)!.label.toLowerCase();

  return (
    <>
      <PageHeader
        title="Returns"
        description={
          data
            ? `${data.total} ${label} ${data.total === 1 ? 'request' : 'requests'}`
            : 'Return and exchange requests from customers'
        }
        actions={
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => update({ status: e.target.value === 'OPEN' ? '' : e.target.value })}
            className="w-40"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        }
      />

      <ErrorNote error={error} />

      {!data ? (
        !error && <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title={status === 'OPEN' ? 'No open returns' : `No ${label} returns`}>
          {status === 'OPEN'
            ? 'When a customer asks to return or exchange something, it shows up here.'
            : null}
        </EmptyState>
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {data.items.map((r) => (
            <ReturnCard key={r.id} ret={r} onAction={(a) => setAction({ ret: r, action: a })} />
          ))}
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

      <ReturnActionModal
        ret={action?.ret ?? null}
        action={action?.action ?? null}
        onClose={() => setAction(null)}
        onStale={reload}
        onDone={(updated) => {
          onUpdated(updated);
          setAction(null);
        }}
      />
    </>
  );
}
