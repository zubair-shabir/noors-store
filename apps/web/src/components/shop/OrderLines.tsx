import Image from 'next/image';
import { formatINR, type Paise } from '@noors/shared';
import type { ReactNode } from 'react';

export interface SummaryLine {
  key: string;
  name: string;
  title: string;
  image: string | null;
  quantity: number;
  unitPrice: Paise;
  note?: ReactNode;
}

/** Item list with thumbnails and quantity badges, as on the checkout and order pages. */
export function OrderLines({ lines }: { lines: SummaryLine[] }) {
  return (
    <ul className="space-y-4">
      {lines.map((l) => (
        <li key={l.key} className="flex items-center gap-4">
          <div className="relative h-20 w-16 shrink-0 bg-surface">
            {l.image && <Image src={l.image} alt="" fill sizes="64px" className="object-cover" />}
            <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
              {l.quantity}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm uppercase">{l.name}</p>
            <p className="text-xs text-muted">{l.title}</p>
            {l.note}
          </div>
          <p className="text-sm tabular-nums">{formatINR(l.unitPrice * l.quantity)}</p>
        </li>
      ))}
    </ul>
  );
}

/** Subtotal, discount, shipping and total rows. */
export function Totals({
  subtotal,
  discount,
  discountLabel,
  shippingFee,
  shippingLabel = 'Shipping',
  total,
}: {
  subtotal: Paise;
  discount: Paise;
  discountLabel?: string;
  shippingFee: Paise;
  shippingLabel?: string;
  total: Paise;
}) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted">Subtotal</dt>
        <dd className="tabular-nums">{formatINR(subtotal)}</dd>
      </div>
      {discount > 0 && (
        <div className="flex justify-between">
          <dt className="text-muted">Discount{discountLabel ? ` (${discountLabel})` : ''}</dt>
          <dd className="tabular-nums">−{formatINR(discount)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-muted">{shippingLabel}</dt>
        <dd className="tabular-nums">{shippingFee === 0 ? 'Free' : formatINR(shippingFee)}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatINR(total)}</dd>
      </div>
      <p className="text-xs text-muted">Prices include GST.</p>
    </dl>
  );
}
