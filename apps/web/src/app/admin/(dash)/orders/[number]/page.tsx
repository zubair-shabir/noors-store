import type { Metadata } from 'next';
import { OrderDetail } from '@/components/admin/ops/orders/OrderDetail';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: PageProps<'/admin/orders/[number]'>) {
  const { number } = await params;
  return <OrderDetail key={number} number={number} />;
}
