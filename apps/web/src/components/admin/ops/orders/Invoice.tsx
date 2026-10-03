'use client';

import {
  formatINR,
  type AdminMeDto,
  type AdminOrderDto,
  type AdminSettingsDto,
} from '@noors/shared';
import { Printer } from 'lucide-react';
import { useAdminData } from '@/lib/admin/api';
import { Button, ErrorNote, Spinner } from '../../ui';
import { formatDate } from '../format';
import { paymentMethodLabel } from './parts';

/** Used when the store details can't be read (staff can't open settings). */
const FALLBACK = {
  name: "Noor's",
  address: 'Srinagar, Jammu and Kashmir',
  email: '',
  phone: '',
  gstNumber: '',
};

/** A printable, GST-inclusive tax invoice for one order. Needs a signed-in admin. */
export function Invoice({ number }: { number: string }) {
  // A 401 here sends the browser to the sign-in page.
  const { data: me } = useAdminData<{ admin: AdminMeDto }>('/auth/me');
  const isOwner = me?.admin.role === 'OWNER';
  const { data: order, error } = useAdminData<AdminOrderDto>(
    me ? `/orders/${encodeURIComponent(number)}` : null,
  );
  const settings = useAdminData<AdminSettingsDto>(isOwner ? '/settings' : null);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorNote error={error} />
      </div>
    );
  }
  if (!me || !order || (isOwner && settings.loading)) {
    return <Spinner label="Preparing the invoice" />;
  }

  const store = settings.data?.store ?? FALLBACK;
  const a = order.shippingAddress;
  const date = order.placedAt ?? order.createdAt;

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 14mm; }'}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <Button variant="primary" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> Print
        </Button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-[14mm] text-sm text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-black pb-6">
          <div>
            <h1 className="text-2xl font-semibold">{store.name}</h1>
            <p className="mt-1 whitespace-pre-line text-neutral-700">{store.address}</p>
            {store.phone && <p className="text-neutral-700">{store.phone}</p>}
            {store.email && <p className="text-neutral-700">{store.email}</p>}
            {store.gstNumber && <p className="mt-1 font-medium">GSTIN: {store.gstNumber}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-lg font-semibold tracking-wide uppercase">Tax invoice</h2>
            <dl className="mt-2 space-y-0.5">
              <div>
                <dt className="inline text-neutral-600">Invoice no. </dt>
                <dd className="inline font-medium">{order.number}</dd>
              </div>
              <div>
                <dt className="inline text-neutral-600">Date </dt>
                <dd className="inline font-medium">{formatDate(date)}</dd>
              </div>
            </dl>
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
              Bill to
            </h3>
            <p className="font-medium">{a.name}</p>
            <p>{order.email}</p>
            <p>{order.phone}</p>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
              Ship to
            </h3>
            <address className="not-italic">
              <span className="font-medium">{a.name}</span>
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
          </div>
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-black text-left text-xs uppercase">
              <th className="py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">Item</th>
              <th className="py-2 pr-2 font-semibold">HSN</th>
              <th className="py-2 pr-2 text-right font-semibold">Qty</th>
              <th className="py-2 pr-2 text-right font-semibold">Unit price</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i, n) => (
              <tr key={i.id} className="border-b border-neutral-300 align-top">
                <td className="py-2 pr-2">{n + 1}</td>
                <td className="py-2 pr-2">
                  <p>{i.name}</p>
                  <p className="text-xs text-neutral-600">
                    {i.title} · {i.sku}
                  </p>
                </td>
                <td className="py-2 pr-2">{i.hsnCode ?? ''}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{i.quantity}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">
                  {formatINR(i.unitPrice)}
                </td>
                <td className="py-2 text-right whitespace-nowrap tabular-nums">
                  {formatINR(i.unitPrice * i.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-xs space-y-1">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatINR(order.subtotal)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between">
                <dt>Discount{order.couponCode && ` (${order.couponCode})`}</dt>
                <dd className="tabular-nums">−{formatINR(order.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>{order.paymentMethod === 'COD' ? 'Shipping and COD charge' : 'Shipping'}</dt>
              <dd className="tabular-nums">
                {order.shippingFee > 0 ? formatINR(order.shippingFee) : 'Free'}
              </dd>
            </div>
            <div className="flex justify-between border-t border-black pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatINR(order.total)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-10 space-y-1 border-t border-neutral-300 pt-4 text-xs text-neutral-700">
          <p>Prices include GST.</p>
          <p>Payment: {paymentMethodLabel[order.paymentMethod]}</p>
          <p className="pt-2">Thank you for shopping with {store.name}.</p>
        </footer>
      </article>
    </div>
  );
}
