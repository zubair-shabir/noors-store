'use client';

import { formatINR, type AdminOrderDto, type AdminShipmentDto } from '@noors/shared';
import { ExternalLink, Printer } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { adminFetch, ApiError, useAdminData } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { Thumb } from '../../Thumb';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  Textarea,
} from '../../ui';
import {
  formatDate,
  formatDateTime,
  OrderStatusBadge,
  PaymentBadge,
  ReturnStatusBadge,
} from '../format';
import { OrderActions } from './OrderActions';
import { AttentionBadge, paymentMethodLabel, ShipmentStatusBadge } from './parts';

/** What needs a person on this order, worked out from the detail (the list sends it ready-made). */
function attentionOf(o: AdminOrderDto): string | null {
  if (o.refunds.some((r) => r.status === 'FAILED')) return 'Refund failed';
  const shipment = o.shipments[0];
  if (o.status === 'PAID' && shipment?.status === 'PENDING' && shipment.lastError) {
    if (!shipment.retrying) return 'Shipment not booked';
  }
  if (shipment?.status === 'RTO') return 'Returning to us';
  if (o.returns.some((r) => r.status === 'REQUESTED')) return 'Return requested';
  return null;
}

export function OrderDetail({ number }: { number: string }) {
  const {
    data: order,
    error,
    setData,
  } = useAdminData<AdminOrderDto>(`/orders/${encodeURIComponent(number)}`);

  if (!order) {
    return (
      <>
        <PageHeader title={`Order ${number}`} back={{ href: '/admin/orders', label: 'Orders' }} />
        {error ? (
          error.status === 404 ? (
            <EmptyState title="Order not found">
              Check the number, or find it in the{' '}
              <Link href="/admin/orders?status=ALL" className="underline">
                order list
              </Link>
              .
            </EmptyState>
          ) : (
            <ErrorNote error={error} />
          )
        ) : (
          <Spinner />
        )}
      </>
    );
  }

  const attention = attentionOf(order);
  return (
    <>
      <PageHeader
        title={`Order ${order.number}`}
        back={{ href: '/admin/orders', label: 'Orders' }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <AttentionBadge reason={attention} />
            <span>
              {order.placedAt
                ? `Placed ${formatDateTime(order.placedAt)}`
                : `Started ${formatDateTime(order.createdAt)}, not paid yet`}
            </span>
          </span>
        }
        actions={<OrderActions order={order} onChange={setData} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <ItemsCard order={order} />
          {order.shipments.map((s) => (
            <ShipmentCard key={s.id} shipment={s} />
          ))}
          {order.returns.length > 0 && <ReturnsCard order={order} />}
          <TimelineCard order={order} onChange={setData} />
        </div>
        <div className="min-w-0 space-y-6">
          <CustomerCard order={order} />
          <AddressCard order={order} />
          <PaymentCard order={order} />
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  children,
  strong,
}: {
  label: ReactNode;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-muted'}>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function ItemsCard({ order }: { order: AdminOrderDto }) {
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <Card title="Items" description={`${count} ${count === 1 ? 'item' : 'items'}`}>
      <ul className="-mt-2 divide-y divide-line">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-3">
            <Thumb src={i.image} size={48} />
            <div className="min-w-0 flex-1">
              {i.productId ? (
                <Link
                  href={`/admin/products/${i.productId}`}
                  className="font-medium hover:underline"
                >
                  {i.name}
                </Link>
              ) : (
                <p className="font-medium">{i.name}</p>
              )}
              <p className="text-xs text-muted">
                {i.title} · SKU {i.sku}
              </p>
            </div>
            <div className="text-right text-sm whitespace-nowrap tabular-nums">
              <p>
                {i.quantity} × {formatINR(i.unitPrice)}
              </p>
              <p className="font-medium">{formatINR(i.quantity * i.unitPrice)}</p>
            </div>
          </li>
        ))}
      </ul>
      <dl className="mt-2 space-y-1.5 border-t border-line pt-4 text-sm">
        <Row label="Subtotal">{formatINR(order.subtotal)}</Row>
        {order.discount > 0 && (
          <Row label={order.couponCode ? `Discount (${order.couponCode})` : 'Discount'}>
            −{formatINR(order.discount)}
          </Row>
        )}
        <Row label={order.paymentMethod === 'COD' ? 'Shipping and COD charge' : 'Shipping'}>
          {order.shippingFee > 0 ? formatINR(order.shippingFee) : 'Free'}
        </Row>
        <Row label="Total" strong>
          {formatINR(order.total)}
        </Row>
      </dl>
    </Card>
  );
}

function CustomerCard({ order }: { order: AdminOrderDto }) {
  const name = order.customer?.name ?? order.shippingAddress.name;
  return (
    <Card title="Customer">
      <div className="space-y-1 text-sm">
        {order.customer ? (
          <Link
            href={`/admin/customers/${order.customer.id}`}
            className="font-medium hover:underline"
          >
            {name}
          </Link>
        ) : (
          <p className="font-medium">
            {name} <span className="font-normal text-muted">(guest)</span>
          </p>
        )}
        <p>
          <a href={`mailto:${order.email}`} className="break-all hover:underline">
            {order.email}
          </a>
        </p>
        <p>
          <a href={`tel:${order.phone}`} className="hover:underline">
            {order.phone}
          </a>
        </p>
      </div>
      {order.notes && (
        <div className="mt-4 rounded-md bg-surface px-3 py-2 text-sm">
          <p className="text-xs font-medium text-muted">Note from the shopper</p>
          <p className="mt-0.5 whitespace-pre-line">{order.notes}</p>
        </div>
      )}
    </Card>
  );
}

function AddressCard({ order }: { order: AdminOrderDto }) {
  const a = order.shippingAddress;
  return (
    <Card title="Shipping address">
      <address className="text-sm leading-relaxed not-italic">
        {a.name}
        <br />
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
      </address>
    </Card>
  );
}

function PaymentCard({ order }: { order: AdminOrderDto }) {
  return (
    <Card title="Payment" description={paymentMethodLabel[order.paymentMethod]}>
      {order.payments.length === 0 ? (
        <p className="text-sm text-muted">No payment yet.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {order.payments.map((p) => (
            <li key={p.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium tabular-nums">{formatINR(p.amount)}</span>
                <PaymentBadge status={p.status} cod={p.provider === 'COD'} />
              </div>
              <p className="text-xs text-muted">
                {formatDateTime(p.createdAt)}
                {p.method && ` · ${p.method.toUpperCase()}`}
              </p>
              {p.razorpayPaymentId && (
                <p className="font-mono text-xs break-all text-muted">{p.razorpayPaymentId}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {order.refunds.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-medium">Refunds</h3>
          <ul className="space-y-3 text-sm">
            {order.refunds.map((r) => (
              <li key={r.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">{formatINR(r.amount)}</span>
                  <Badge
                    tone={
                      r.status === 'PROCESSED' ? 'green' : r.status === 'FAILED' ? 'red' : 'amber'
                    }
                  >
                    {r.status === 'PROCESSED'
                      ? 'Refunded'
                      : r.status === 'FAILED'
                        ? 'Failed'
                        : 'In progress'}
                  </Badge>
                </div>
                <p className="text-xs text-muted">
                  {formatDateTime(r.createdAt)}
                  {r.reason && ` · ${r.reason}`}
                </p>
                {r.razorpayRefundId && (
                  <p className="font-mono text-xs break-all text-muted">{r.razorpayRefundId}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {order.refundable > 0 && (
        <dl className="mt-4 border-t border-line pt-4 text-sm">
          <Row label="Can still be refunded">{formatINR(order.refundable)}</Row>
        </dl>
      )}
    </Card>
  );
}

function ShipmentCard({ shipment: s }: { shipment: AdminShipmentDto }) {
  const failed = s.status === 'PENDING' && s.lastError;
  return (
    <Card
      title="Shipment"
      description={s.courier ?? undefined}
      actions={
        <>
          <ShipmentStatusBadge status={s.status} />
          {s.labelUrl && (
            <a
              href={s.labelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium hover:bg-surface"
            >
              <Printer className="size-3.5" aria-hidden /> Print label
            </a>
          )}
        </>
      }
    >
      <dl className="space-y-1.5 text-sm">
        {s.awb && (
          <Row label="Tracking number">
            {s.trackingUrl ? (
              <a
                href={s.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
              >
                {s.awb} <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : (
              s.awb
            )}
          </Row>
        )}
        {s.estimatedDelivery && (
          <Row label="Expected delivery">{formatDate(s.estimatedDelivery)}</Row>
        )}
        <Row label="Created">{formatDateTime(s.createdAt)}</Row>
      </dl>

      {failed && (
        <div className="mt-4 rounded-md border border-red-600/30 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">
            Booking failed
            {s.attempts > 0 && ` after ${s.attempts} ${s.attempts === 1 ? 'try' : 'tries'}`}
          </p>
          <p className="mt-0.5">{s.lastError}</p>
          <p className="mt-1 text-xs">
            {s.retrying
              ? 'We will try again automatically in a little while.'
              : 'Automatic booking has stopped. Book it again, or book it yourself and mark it shipped.'}
          </p>
        </div>
      )}
      {!failed && s.status === 'PENDING' && s.retrying && (
        <p className="mt-4 text-sm text-muted">Booking with the courier, this can take a minute.</p>
      )}

      {s.scans.length > 0 && (
        <details className="group mt-4 border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-medium select-none">
            Tracking updates ({s.scans.length})
          </summary>
          <ol className="mt-3 space-y-2 text-sm">
            {s.scans.map((scan, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-36 shrink-0 text-xs text-muted">{formatDateTime(scan.at)}</span>
                <span>
                  {scan.status}
                  {scan.location && <span className="text-muted"> · {scan.location}</span>}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  );
}

function ReturnsCard({ order }: { order: AdminOrderDto }) {
  return (
    <Card
      title="Returns and exchanges"
      actions={
        <Link href="/admin/returns" className="text-sm text-muted hover:text-foreground">
          Go to returns →
        </Link>
      }
    >
      <ul className="-my-2 divide-y divide-line">
        {order.returns.map((r) => (
          <li key={r.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.type === 'EXCHANGE' ? 'Exchange' : 'Return'}</span>
              <ReturnStatusBadge status={r.status} />
              <span className="ml-auto text-xs text-muted">{formatDate(r.createdAt)}</span>
            </div>
            <p className="mt-1 text-muted">
              {r.items.map((i) => `${i.quantity} × ${i.name} (${i.title})`).join(', ')}
            </p>
            <p className="mt-1">&ldquo;{r.reason}&rdquo;</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TimelineCard({
  order,
  onChange,
}: {
  order: AdminOrderDto;
  onChange: (order: AdminOrderDto) => void;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const events = [...order.events].reverse();

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      onChange(
        await adminFetch<AdminOrderDto>(`/orders/${encodeURIComponent(order.number)}/notes`, {
          body: { message },
        }),
      );
      setMessage('');
      toast.success('Note added');
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Timeline">
      <form onSubmit={addNote} className="mb-5 space-y-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a note for the team (the customer won't see it)"
          aria-label="Note"
          maxLength={1000}
          className="min-h-16"
        />
        <ErrorNote error={error} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" busy={busy} disabled={!message.trim()}>
            Add note
          </Button>
        </div>
      </form>
      {events.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative text-sm">
              <span
                className={`absolute top-1.5 -left-[1.4rem] size-2 rounded-full ${e.type === 'note' ? 'bg-amber-500' : 'bg-line'}`}
                aria-hidden
              />
              <p className={e.type === 'note' ? 'whitespace-pre-line' : ''}>{e.message}</p>
              <p className="mt-0.5 text-xs text-muted">
                {formatDateTime(e.at)}
                {e.by && ` · ${e.by}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
