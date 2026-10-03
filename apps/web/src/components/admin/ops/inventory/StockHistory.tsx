'use client';

import type { InventoryLogDto, Paginated } from '@noors/shared';
import Link from 'next/link';
import { useAdminData } from '@/lib/admin/api';
import { EmptyState, ErrorNote, Spinner } from '../../ui';
import { formatDateTime, Pager } from '../format';
import { STOCK_REASONS } from './AdjustStockModal';

const LIMIT = 50;

const REASON_LABELS: Record<string, string> = {
  ...Object.fromEntries(STOCK_REASONS.map((r) => [r.value, r.label])),
  order: 'Sold',
  cancelled: 'Order cancelled',
  exchange: 'Exchanged by customer',
  admin_adjustment: 'Edited on product page',
};

/** Logged reasons look like "restock" or "restock: note from the person". */
function describeReason(raw: string): { label: string; note: string | null } {
  const i = raw.indexOf(':');
  const key = i === -1 ? raw : raw.slice(0, i);
  const note = i === -1 ? null : raw.slice(i + 1).trim() || null;
  if (REASON_LABELS[key]) return { label: REASON_LABELS[key], note };
  return { label: raw, note: null };
}

/** Every stock change, newest first, optionally for one variant. */
export function StockHistory({
  variantId,
  page,
  onPage,
  onClearVariant,
}: {
  variantId: string;
  page: number;
  onPage: (page: number) => void;
  onClearVariant: () => void;
}) {
  const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (variantId) query.set('variantId', variantId);
  const { data, error, loading } = useAdminData<Paginated<InventoryLogDto>>(
    `/inventory/log?${query}`,
  );

  const first = data?.items[0];

  return (
    <>
      {variantId && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2 text-sm">
          <span>
            Showing history for{' '}
            <span className="font-medium">
              {first ? `${first.productName}, ${first.title} (${first.sku})` : 'one variant'}
            </span>
          </span>
          <button type="button" className="underline" onClick={onClearVariant}>
            Show all
          </button>
        </div>
      )}

      <ErrorNote error={error} />

      {!data ? (
        !error && <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="No stock changes yet">
          Sales, cancellations, returns and adjustments are listed here.
        </EmptyState>
      ) : (
        <div
          className={`overflow-hidden rounded-xl border border-line bg-background transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Date</th>
                <th className="px-4 py-2.5 font-medium md:px-3">Item</th>
                <th className="px-3 py-2.5 text-right font-medium">Change</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Reason</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((log) => {
                const { label, note } = describeReason(log.reason);
                const by = log.orderNumber ? (
                  <Link href={`/admin/orders/${log.orderNumber}`} className="hover:underline">
                    Order {log.orderNumber}
                  </Link>
                ) : (
                  (log.by ?? 'System')
                );
                return (
                  <tr key={log.id} className="align-top">
                    <td className="hidden px-4 py-2.5 whitespace-nowrap text-muted md:table-cell">
                      {formatDateTime(log.at)}
                    </td>
                    <td className="px-4 py-2.5 md:px-3">
                      <p className="line-clamp-2 font-medium">{log.productName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {log.title} · {log.sku}
                      </p>
                      <p className="mt-0.5 text-xs text-muted md:hidden">
                        {formatDateTime(log.at)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted sm:hidden">
                        {label}
                        {note && `: ${note}`}
                      </p>
                      <p className="mt-0.5 text-xs text-muted lg:hidden">By {by}</p>
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums ${
                        log.change > 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : log.change < 0
                            ? 'text-red-700 dark:text-red-400'
                            : ''
                      }`}
                    >
                      {log.change > 0 ? `+${log.change}` : log.change}
                    </td>
                    <td className="hidden px-3 py-2.5 sm:table-cell">
                      {label}
                      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
                    </td>
                    <td className="hidden px-4 py-2.5 whitespace-nowrap text-muted lg:table-cell">
                      {by}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.items.length > 0 && (
        <Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={onPage} />
      )}
    </>
  );
}
