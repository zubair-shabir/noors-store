import type { AdminOrderFilter, ShipmentStatus } from '@noors/shared';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '../../ui';

/* Small pieces shared by the order list and order page. */

export const ORDER_FILTERS: { value: AdminOrderFilter; label: string }[] = [
  { value: 'OPEN', label: 'All open' },
  { value: 'TO_SHIP', label: 'To ship' },
  { value: 'PENDING_PAYMENT', label: 'Awaiting payment' },
  { value: 'PAID', label: 'Confirmed' },
  { value: 'READY_TO_SHIP', label: 'Packed' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'ALL', label: 'All orders' },
];

/** Problems with money or a stuck shipment are red; everything else that needs a look is amber. */
const URGENT = [
  'Payment to refund',
  'Check payment amount',
  'Refund failed',
  'Shipment not booked',
];

export function AttentionBadge({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <Badge tone={URGENT.includes(reason) ? 'red' : 'amber'}>
      <AlertTriangle className="mr-1 size-3" aria-hidden />
      {reason}
    </Badge>
  );
}

const shipmentLabel: Record<ShipmentStatus, string> = {
  PENDING: 'Not booked yet',
  AWB_ASSIGNED: 'Booked',
  PICKUP_SCHEDULED: 'Pickup scheduled',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  RTO: 'Returning to us',
  CANCELLED: 'Cancelled',
};

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const tone =
    status === 'DELIVERED'
      ? 'green'
      : status === 'RTO'
        ? 'red'
        : status === 'PENDING' || status === 'CANCELLED'
          ? 'neutral'
          : 'amber';
  return <Badge tone={tone}>{shipmentLabel[status]}</Badge>;
}

export const paymentMethodLabel = { RAZORPAY: 'Online', COD: 'Cash on delivery' } as const;
