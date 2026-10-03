import type { Metadata } from 'next';
import { CustomerDetail } from '@/components/admin/ops/customers/CustomerDetail';

export const metadata: Metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: PageProps<'/admin/customers/[id]'>) {
  const { id } = await params;
  return <CustomerDetail key={id} id={id} />;
}
