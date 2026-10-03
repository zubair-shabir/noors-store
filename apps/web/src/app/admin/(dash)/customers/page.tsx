import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CustomerList } from '@/components/admin/ops/customers/CustomerList';
import { Spinner } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Customers' };

export default function CustomersPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CustomerList />
    </Suspense>
  );
}
