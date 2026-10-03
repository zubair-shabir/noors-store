import type { Metadata } from 'next';
import { AccountOrder } from '@/components/shop/AccountOrder';

export const metadata: Metadata = { title: 'Order', robots: { index: false } };

export default async function AccountOrderPage({ params }: PageProps<'/account/orders/[number]'>) {
  const { number } = await params;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
      <AccountOrder number={number} />
    </section>
  );
}
