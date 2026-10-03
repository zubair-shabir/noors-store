'use client';

import { orderStatusLabel, type TrackingDto } from '@noors/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ShopError, shopFetch } from '@/lib/shop-api';
import { errorText, primaryButton, TextField } from './form';
import { OrderLines } from './OrderLines';
import { ReturnPanel } from './ReturnPanel';
import { Scans, ShipmentSummary, Timeline } from './ShipmentTracking';

/** Public order tracking: order number plus the phone number it was placed with. */
export function TrackView({
  initialOrder,
  initialPhone,
}: {
  initialOrder: string;
  initialPhone: string;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [phone, setPhone] = useState(initialPhone);
  const [result, setResult] = useState<TrackingDto | null>(null);
  const [error, setError] = useState<ShopError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ order: order.trim(), phone: phone.trim() });
      const found = await shopFetch<TrackingDto>(`/track?${params}`);
      setResult(found);
      // Keep the order number in the address (not the phone) so the page can be revisited.
      router.replace(`/track?order=${encodeURIComponent(found.number)}`, { scroll: false });
    } catch (err) {
      setResult(null);
      setError(err instanceof ShopError ? err : new ShopError(0, 'error', 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
        Order tracking
      </p>
      <h1 className="mt-3 font-display text-5xl uppercase sm:text-6xl">Where is my order?</h1>
      <p className="mt-4 max-w-xl text-sm text-muted">
        Enter your order number (it is in your confirmation email) and the phone number you gave at
        checkout.
      </p>

      <form onSubmit={submit} className="mt-10 grid max-w-2xl gap-5 sm:grid-cols-[1fr_1fr_auto]">
        <TextField
          label="Order number"
          placeholder="NR-100245"
          autoCapitalize="characters"
          required
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          error={error?.fieldError('order')}
        />
        <TextField
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={error?.fieldError('phone')}
        />
        <button type="submit" disabled={busy} className={`${primaryButton} h-12 px-8 sm:mt-[26px]`}>
          {busy ? 'Finding…' : 'Track'}
        </button>
      </form>
      {error && !error.issues.length && (
        <p className={`mt-4 ${errorText}`} role="alert">
          {error.message}
        </p>
      )}

      {result && (
        <div className="mt-16 grid gap-10 border-t border-line pt-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-10">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
                Order {result.number}
              </p>
              <p className="mt-2 font-display text-4xl uppercase">
                {orderStatusLabel[result.status]}
              </p>
            </div>
            <Scans scans={result.scans} />
            <OrderLines
              lines={result.items.map((i, n) => ({
                key: `${i.sku}-${n}`,
                name: i.name,
                title: i.title,
                image: i.image,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
              }))}
            />
          </div>
          <dl className="space-y-6 text-sm">
            <ShipmentSummary shipment={result.shipment} />
            <Timeline entries={result.timeline} />
          </dl>
        </div>
      )}
      {result && (
        <ReturnPanel
          items={result.items}
          returns={result.returns}
          returnableUntil={result.returnableUntil}
          submit={async (body) =>
            setResult(
              await shopFetch<TrackingDto>('/track/returns', {
                method: 'POST',
                body: { order: result.number, phone: phone.trim(), ...body },
              }),
            )
          }
        />
      )}
    </div>
  );
}
