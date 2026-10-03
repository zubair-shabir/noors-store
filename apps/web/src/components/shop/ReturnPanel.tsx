'use client';

import {
  returnStatusLabel,
  type OrderItemDto,
  type ReturnRequestInput,
  type ReturnSummaryDto,
} from '@noors/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '@/lib/shop-api';
import { errorText, labelClass, primaryButton, secondaryButton, textButton } from './form';

const day = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Kolkata',
});

/**
 * Returns and exchanges on an order page: the ones already asked for, and a form to ask
 * while the return window is open.
 */
export function ReturnPanel({
  items,
  returns,
  returnableUntil,
  submit,
}: {
  items: OrderItemDto[];
  returns: ReturnSummaryDto[];
  returnableUntil: string | null;
  submit: (body: ReturnRequestInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'RETURN' | 'EXCHANGE'>('EXCHANGE');
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!returns.length && !returnableUntil) return null;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const chosen = Object.entries(picked)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (!chosen.length) {
      setError('Choose at least one item');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submit({ type, reason, items: chosen });
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-12 border-t border-line pt-8" aria-labelledby="returns-heading">
      <h2 id="returns-heading" className="font-display text-2xl uppercase">
        Returns and exchanges
      </h2>
      {returns.map((r) => (
        <div key={r.id} className="mt-4 border border-line p-4 text-sm">
          <p className="font-medium">
            {r.type === 'EXCHANGE' ? 'Exchange' : 'Return'}: {returnStatusLabel[r.status]}
          </p>
          <p className="mt-1 text-muted">
            {r.items.map((i) => `${i.name} (${i.title}) × ${i.quantity}`).join(', ')}
          </p>
          <p className="mt-1 text-xs text-muted">
            Asked on {day.format(new Date(r.createdAt))}. We email you at each step.
          </p>
        </div>
      ))}
      {returnableUntil && !open && (
        <div className="mt-4">
          <p className="text-sm text-muted">
            Not the right fit? You can ask for an exchange or a return until{' '}
            {day.format(new Date(returnableUntil))}.
          </p>
          <button type="button" className={`${secondaryButton} mt-4`} onClick={() => setOpen(true)}>
            Return or exchange
          </button>
        </div>
      )}
      {returnableUntil && open && (
        <form onSubmit={send} className="mt-6 max-w-xl space-y-6">
          <fieldset>
            <legend className={labelClass}>What would you like?</legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {(
                [
                  ['EXCHANGE', 'Exchange for another size'],
                  ['RETURN', 'Return for a refund'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 border px-4 py-3 text-sm ${type === value ? 'border-foreground' : 'border-line'}`}
                >
                  <input
                    type="radio"
                    name="return-type"
                    checked={type === value}
                    onChange={() => setType(value)}
                    className="accent-[var(--foreground)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className={labelClass}>Which items?</legend>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {items.map((item) => {
                const quantity = picked[item.id] ?? 0;
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={quantity > 0}
                        onChange={(e) =>
                          setPicked((p) => ({ ...p, [item.id]: e.target.checked ? 1 : 0 }))
                        }
                        className="accent-[var(--foreground)]"
                      />
                      <span>
                        {item.name} <span className="text-muted">({item.title})</span>
                      </span>
                    </label>
                    {item.quantity > 1 && quantity > 0 && (
                      <select
                        aria-label={`How many ${item.name}`}
                        value={quantity}
                        onChange={(e) =>
                          setPicked((p) => ({ ...p, [item.id]: Number(e.target.value) }))
                        }
                        className="h-9 border border-line bg-transparent px-2"
                      >
                        {Array.from({ length: item.quantity }, (_, n) => n + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <div>
            <label htmlFor="return-reason" className={labelClass}>
              {type === 'EXCHANGE' ? 'Which size would you like, and why?' : 'What went wrong?'}
            </label>
            <textarea
              id="return-reason"
              required
              minLength={3}
              maxLength={1000}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-2 block w-full border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </div>
          {error && (
            <p role="alert" className={errorText}>
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-6">
            <button type="submit" disabled={busy} className={`${primaryButton} w-auto px-8`}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
            <button type="button" className={textButton} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <p className="text-xs text-muted">
            Items should be unworn with their tags on. We reply within 2 working days.
          </p>
        </form>
      )}
    </section>
  );
}
