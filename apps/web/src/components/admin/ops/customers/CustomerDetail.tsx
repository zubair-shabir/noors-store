'use client';

import { formatINR, type AdminCustomerDto } from '@noors/shared';
import { Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAdminData } from '@/lib/admin/api';
import { Badge, Card, EmptyState, ErrorNote, PageHeader, Spinner } from '../../ui';
import { formatDate, OrderStatusBadge, PaymentBadge } from '../format';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-background px-5 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** One customer: contact details, totals, saved addresses and their orders. */
export function CustomerDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: c, error } = useAdminData<AdminCustomerDto>(`/customers/${id}`);
  const back = { href: '/admin/customers', label: 'Customers' };

  if (!c) {
    return (
      <>
        <PageHeader title="Customer" back={back} />
        <ErrorNote error={error} />
        {!error && <Spinner />}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={c.name || c.email}
        back={back}
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <a
              href={`mailto:${c.email}`}
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <Mail className="size-3.5" aria-hidden />
              {c.email}
            </a>
            {c.phone && (
              <a
                href={`tel:${c.phone}`}
                className="inline-flex items-center gap-1.5 hover:underline"
              >
                <Phone className="size-3.5" aria-hidden />
                {c.phone}
              </a>
            )}
          </span>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Orders" value={String(c.orderCount)} />
        <Stat label="Total spent" value={formatINR(c.totalSpent)} />
        <Stat label="Customer since" value={formatDate(c.createdAt)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold">Orders</h2>
          {c.orders.length === 0 ? (
            <EmptyState title="No orders yet" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-background">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Order</th>
                    <th className="hidden px-3 py-2.5 font-medium md:table-cell">Date</th>
                    <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Payment</th>
                    <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {c.orders.map((o) => (
                    <tr
                      key={o.number}
                      onClick={() => router.push(`/admin/orders/${o.number}`)}
                      className="cursor-pointer hover:bg-surface/60"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/orders/${o.number}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium hover:underline"
                        >
                          {o.number}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted md:hidden">
                          {formatDate(o.placedAt ?? o.createdAt)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                          <OrderStatusBadge status={o.status} />
                          <PaymentBadge status={o.paymentStatus} cod={o.paymentMethod === 'COD'} />
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted md:table-cell">
                        {formatDate(o.placedAt ?? o.createdAt)}
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        <PaymentBadge status={o.paymentStatus} cod={o.paymentMethod === 'COD'} />
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        <OrderStatusBadge status={o.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                        {formatINR(o.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Card title="Saved addresses" className="self-start">
          {c.addresses.length === 0 ? (
            <p className="text-sm text-muted">No saved addresses.</p>
          ) : (
            <ul className="space-y-4">
              {c.addresses.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    {a.name}
                    {a.isDefault && <Badge>Default</Badge>}
                  </p>
                  <p className="mt-0.5 text-muted">
                    {a.line1}
                    {a.line2 && (
                      <>
                        <br />
                        {a.line2}
                      </>
                    )}
                    <br />
                    {a.city}, {a.state} {a.pincode}
                    <br />
                    {a.phone}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
