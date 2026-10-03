import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReturnList } from '@/components/admin/ops/returns/ReturnList';
import { Spinner } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Returns' };

export default function ReturnsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ReturnList />
    </Suspense>
  );
}
