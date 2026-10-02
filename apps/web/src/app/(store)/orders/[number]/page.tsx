import type { Metadata } from 'next';
import { OrderConfirmation } from '@/components/shop/OrderConfirmation';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };

export default async function OrderPage({ params, searchParams }: PageProps<'/orders/[number]'>) {
  const { number } = await params;
  const { key } = await searchParams;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
      <OrderConfirmation number={number} accessKey={typeof key === 'string' ? key : ''} />
    </section>
  );
}
