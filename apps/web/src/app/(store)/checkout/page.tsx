import type { Metadata } from 'next';
import { CheckoutView } from '@/components/shop/CheckoutView';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default function CheckoutPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
      <h1 className="mb-12 font-display text-5xl uppercase sm:text-6xl">Checkout</h1>
      <CheckoutView />
    </section>
  );
}
