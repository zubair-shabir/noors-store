'use client';

import { Truck } from 'lucide-react';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import {
  deliveryDate,
  savePincode,
  savedPincode,
  useDelivery,
  type Delivery,
} from '@/lib/delivery';

const noop = () => () => {};

/** Product page: "Deliver to 190001: by Tue, 7 Oct". */
export function DeliveryCheck() {
  const remembered = useSyncExternalStore(noop, savedPincode, () => '');
  const [typed, setTyped] = useState<string | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const value = typed ?? remembered;
  const pincode = checked ?? remembered;
  const delivery = useDelivery(pincode);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = value.trim();
    setChecked(next);
    if (/^[1-9][0-9]{5}$/.test(next)) savePincode(next);
  };

  return (
    <div className="mt-8">
      <form onSubmit={submit} className="flex items-stretch border border-line">
        <label htmlFor="delivery-pincode" className="sr-only">
          Delivery pincode
        </label>
        <Truck className="mx-3 h-4 w-4 self-center text-muted" aria-hidden />
        <input
          id="delivery-pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="Enter pincode for delivery date"
          value={value}
          onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
          className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="submit"
          className="px-4 text-[11px] font-semibold tracking-[0.14em] uppercase transition-opacity hover:opacity-60"
        >
          Check
        </button>
      </form>
      <p className="mt-2 min-h-5 text-xs" aria-live="polite">
        {checked !== null && !/^[1-9][0-9]{5}$/.test(checked) ? (
          <span className="text-red-700 dark:text-red-400">Enter a valid 6-digit pincode</span>
        ) : (
          <DeliveryNote delivery={delivery} />
        )}
      </p>
    </div>
  );
}

/** One line about delivery to a pincode, or nothing while there is nothing to say. */
export function DeliveryNote({ delivery }: { delivery: Delivery }) {
  switch (delivery.state) {
    case 'loading':
      return <span className="text-muted">Checking delivery…</span>;
    case 'done': {
      const r = delivery.result;
      if (!r.serviceable) {
        return (
          <span className="text-red-700 dark:text-red-400">
            We can&apos;t deliver to {r.pincode} yet
          </span>
        );
      }
      return (
        <span>
          {r.estimatedDate ? (
            <>
              Delivery to {r.pincode} by <strong>{deliveryDate(r.estimatedDate)}</strong>
            </>
          ) : (
            <>We deliver to {r.pincode}</>
          )}
        </span>
      );
    }
    default:
      return null;
  }
}
