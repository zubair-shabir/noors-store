import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductList } from '@/components/admin/product/ProductList';
import { Spinner } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Products' };

export default function ProductsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProductList />
    </Suspense>
  );
}
