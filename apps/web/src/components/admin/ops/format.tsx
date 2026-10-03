import {
  orderStatusLabel,
  paymentStatusLabel,
  returnStatusLabel,
  type OrderStatus,
  type PaymentStatus,
  type ReturnStatus,
} from '@noors/shared';
import { Badge } from '../ui';

/* Shared bits for the operations pages (orders, returns, customers, stock, reports). */

const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});
const dateOnly = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/** "3 Oct 2026, 8:53 pm" in Indian time. */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
/** "3 Oct 2026" in Indian time. */
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

const orderTones: Record<OrderStatus, 'neutral' | 'green' | 'amber' | 'red'> = {
  PENDING_PAYMENT: 'neutral',
  PAID: 'amber',
  READY_TO_SHIP: 'amber',
  SHIPPED: 'green',
  OUT_FOR_DELIVERY: 'green',
  DELIVERED: 'green',
  CANCELLED: 'red',
  RETURNED: 'neutral',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={orderTones[status]}>{orderStatusLabel[status]}</Badge>;
}

export function PaymentBadge({ status, cod }: { status: PaymentStatus | null; cod?: boolean }) {
  if (!status) return <Badge>No payment</Badge>;
  const tone =
    status === 'CAPTURED'
      ? 'green'
      : status === 'FAILED'
        ? 'red'
        : status === 'CREATED'
          ? 'neutral'
          : 'amber';
  const label = cod && status === 'CREATED' ? 'COD, to collect' : paymentStatusLabel[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  const tone =
    status === 'COMPLETED'
      ? 'green'
      : status === 'REJECTED'
        ? 'red'
        : status === 'REQUESTED'
          ? 'amber'
          : 'neutral';
  return <Badge tone={tone}>{returnStatusLabel[status]}</Badge>;
}

/** Previous / next links for a paginated list. */
export function Pager({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return <p className="mt-4 text-sm text-muted">{total} in total</p>;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>
        Page {page} of {totalPages} · {total} in total
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-md border border-line px-3 py-1.5 hover:bg-surface disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded-md border border-line px-3 py-1.5 hover:bg-surface disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
