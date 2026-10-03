import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrderList } from '@/components/admin/ops/orders/OrderList';
import { Spinner } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Orders' };

export default function OrdersPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <OrderList />
    </Suspense>
  );
}
