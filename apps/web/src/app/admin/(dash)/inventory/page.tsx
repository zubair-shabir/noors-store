import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StockList } from '@/components/admin/ops/inventory/StockList';
import { Spinner } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Stock' };

export default function InventoryPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <StockList />
    </Suspense>
  );
}
