'use client';

import { formatINR, type DashboardDto } from '@noors/shared';
import { AlertTriangle, ChevronRight, IndianRupee, PackageOpen, Truck, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAdminData } from '@/lib/admin/api';
import { useIsOwner } from '../../AdminShell';
import { Thumb } from '../../Thumb';
import { Card, ErrorNote, PageHeader, Spinner, cx } from '../../ui';
import { RevenueChart } from './RevenueChart';

const RANGES = [7, 30, 90] as const;

/** Owner overview: today, what needs doing, sales over the chosen range and best sellers. */
export function Dashboard({ days }: { days: number }) {
  const isOwner = useIsOwner();
  const router = useRouter();
  const { data, error, loading } = useAdminData<DashboardDto>(
    isOwner ? `/reports/dashboard?days=${days}` : null,
  );

  useEffect(() => {
    if (!isOwner) router.replace('/admin/orders');
  }, [isOwner, router]);

  if (!isOwner) return <Spinner label="Opening orders" />;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="How the shop is doing and what needs a hand."
        actions={<RangeSwitch days={days} />}
      />

      <ErrorNote error={error} />

      {!data ? (
        !error && <Spinner />
      ) : (
        <div className={cx('space-y-6 transition-opacity', loading && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              icon={<IndianRupee className="size-4" aria-hidden />}
              label="Today's sales"
              value={formatINR(data.today.sales)}
              note={`${data.today.orders} ${data.today.orders === 1 ? 'order' : 'orders'}`}
            />
            <StatTile
              icon={<Truck className="size-4" aria-hidden />}
              label="Orders to ship"
              value={String(data.toShip)}
              note={data.toShip ? 'Paid and waiting' : 'All caught up'}
              href="/admin/orders?status=TO_SHIP"
              alert={data.toShip > 0}
            />
            <StatTile
              icon={<PackageOpen className="size-4" aria-hidden />}
              label="Low stock"
              value={String(data.lowStock)}
              note={
                data.lowStock === 1 ? 'Size or colour running out' : 'Sizes or colours running out'
              }
              href="/admin/inventory"
              alert={data.lowStock > 0}
            />
            <StatTile
              icon={<Undo2 className="size-4" aria-hidden />}
              label="Open returns"
              value={String(data.openReturns)}
              note={data.openReturns ? 'Waiting on you' : 'Nothing open'}
              href="/admin/returns"
              alert={data.openReturns > 0}
            />
          </div>

          {data.attention.length > 0 && <Attention items={data.attention} />}

          <Card
            title="Sales"
            description={`Paid orders over the last ${data.days} days, by day (Indian time).`}
          >
            <dl className="mb-5 grid grid-cols-3 gap-4">
              <Figure label="Sales" value={formatINR(data.totals.sales)} />
              <Figure label="Orders" value={data.totals.orders.toLocaleString('en-IN')} />
              <Figure label="Average order" value={formatINR(data.totals.averageOrder)} />
            </dl>
            <RevenueChart points={data.revenue} />
          </Card>

          <BestSellers items={data.bestSellers} days={data.days} />
        </div>
      )}
    </>
  );
}

function RangeSwitch({ days }: { days: number }) {
  return (
    <nav
      aria-label="Date range"
      className="inline-flex rounded-md border border-line bg-background p-0.5 text-sm"
    >
      {RANGES.map((d) => (
        <Link
          key={d}
          href={d === 30 ? '/admin/dashboard' : `/admin/dashboard?days=${d}`}
          replace
          scroll={false}
          aria-current={d === days ? 'page' : undefined}
          className={cx(
            'rounded px-3 py-1.5 font-medium transition',
            d === days ? 'bg-foreground text-background' : 'text-muted hover:text-foreground',
          )}
        >
          {d} days
        </Link>
      ))}
    </nav>
  );
}

function StatTile({
  icon,
  label,
  value,
  note,
  href,
  alert,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  href?: string;
  alert?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        {href && <ChevronRight className="size-4 opacity-60" aria-hidden />}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p
        className={cx(
          'mt-0.5 text-xs',
          alert ? 'text-amber-700 dark:text-amber-400' : 'text-muted',
        )}
      >
        {note}
      </p>
    </>
  );
  const box = 'block rounded-xl border border-line bg-background p-4';
  return href ? (
    <Link href={href} className={cx(box, 'transition hover:border-foreground/40')}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-lg font-semibold tracking-tight sm:text-xl">{value}</dd>
    </div>
  );
}

function Attention({ items }: { items: DashboardDto['attention'] }) {
  return (
    <Card
      title="Needs attention"
      description={`${items.length} ${items.length === 1 ? 'order needs' : 'orders need'} a person to look at ${items.length === 1 ? 'it' : 'them'}.`}
    >
      <ul className="-my-2 divide-y divide-line">
        {items.map((item) => (
          <li key={item.number}>
            <Link
              href={`/admin/orders/${item.number}`}
              className="group flex items-center gap-3 py-2.5 text-sm"
            >
              <AlertTriangle
                className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <span className="font-medium whitespace-nowrap group-hover:underline">
                #{item.number}
              </span>
              <span className="min-w-0 flex-1 text-muted">{item.reason}</span>
              <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function BestSellers({ items, days }: { items: DashboardDto['bestSellers']; days: number }) {
  return (
    <Card title="Best sellers" description={`Most units sold in the last ${days} days.`}>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No sales in this period yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-medium">Product</th>
              <th className="pb-2 text-right font-medium">Units</th>
              <th className="pb-2 pl-4 text-right font-medium">Sales</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((p, i) => (
              <tr key={p.productId}>
                <td className="py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-4 text-right text-xs text-subtle tabular-nums">{i + 1}</span>
                    <Thumb src={p.image} />
                    <Link
                      href={`/admin/products/${p.productId}`}
                      className="line-clamp-2 min-w-0 font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                  </div>
                </td>
                <td className="py-2.5 text-right tabular-nums">{p.units}</td>
                <td className="py-2.5 pl-4 text-right whitespace-nowrap tabular-nums">
                  {formatINR(p.sales)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
