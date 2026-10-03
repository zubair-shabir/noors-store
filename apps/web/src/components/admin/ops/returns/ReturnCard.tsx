'use client';

import { formatINR, type AdminReturnDto } from '@noors/shared';
import Link from 'next/link';
import { Thumb } from '../../Thumb';
import { Button } from '../../ui';
import { formatDateTime, ReturnStatusBadge } from '../format';
import type { ReturnAction } from './ReturnActionModal';

/** One return or exchange request with the actions its status allows. */
export function ReturnCard({
  ret,
  onAction,
}: {
  ret: AdminReturnDto;
  onAction: (action: ReturnAction) => void;
}) {
  const units = ret.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <article className="rounded-xl border border-line bg-background">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{ret.type === 'EXCHANGE' ? 'Exchange' : 'Return'}</h2>
            <ReturnStatusBadge status={ret.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Order{' '}
            <Link
              href={`/admin/orders/${ret.orderNumber}`}
              className="font-medium text-foreground hover:underline"
            >
              {ret.orderNumber}
            </Link>{' '}
            · {formatDateTime(ret.createdAt)}
          </p>
        </div>
        <div className="min-w-0 text-sm sm:text-right">
          <p className="font-medium">{ret.name}</p>
          <a href={`mailto:${ret.email}`} className="break-all text-muted hover:underline">
            {ret.email}
          </a>
        </div>
      </header>

      <div className="space-y-4 px-5 py-4">
        <blockquote className="border-l-2 border-line pl-3 text-sm whitespace-pre-line text-muted italic">
          “{ret.reason}”
        </blockquote>

        <ul className="divide-y divide-line">
          {ret.items.map((item) => (
            <li key={item.orderItemId} className="flex items-center gap-3 py-2.5 text-sm">
              <Thumb src={item.image} alt={item.name} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-medium">{item.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {item.title} · {item.sku}
                </p>
              </div>
              <div className="text-right whitespace-nowrap tabular-nums">
                <p>
                  {item.quantity} × {formatINR(item.unitPrice)}
                </p>
                {item.quantity > 1 && (
                  <p className="text-xs text-muted">{formatINR(item.unitPrice * item.quantity)}</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex justify-between border-t border-line pt-3 text-sm">
          <span className="text-muted">
            Items value ({units} {units === 1 ? 'item' : 'items'})
          </span>
          <span className="font-medium tabular-nums">{formatINR(ret.itemsValue)}</span>
        </div>
      </div>

      {(ret.status === 'REQUESTED' || ret.status === 'APPROVED' || ret.status === 'RECEIVED') && (
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
          {ret.status === 'REQUESTED' && (
            <>
              <Button size="sm" variant="danger" onClick={() => onAction('REJECTED')}>
                Decline
              </Button>
              <Button size="sm" variant="primary" onClick={() => onAction('APPROVED')}>
                Approve
              </Button>
            </>
          )}
          {ret.status === 'APPROVED' && (
            <>
              <Button size="sm" variant="danger" onClick={() => onAction('REJECTED')}>
                Decline
              </Button>
              <Button size="sm" onClick={() => onAction('COMPLETED')}>
                Complete
              </Button>
              <Button size="sm" variant="primary" onClick={() => onAction('RECEIVED')}>
                Mark received
              </Button>
            </>
          )}
          {ret.status === 'RECEIVED' && (
            <Button size="sm" variant="primary" onClick={() => onAction('COMPLETED')}>
              Complete
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}
