import type { Metadata } from 'next';
import { TrackView } from '@/components/shop/TrackView';

export const metadata: Metadata = {
  title: 'Track your order',
  description: "Track a Noor's order with its order number and your phone number.",
};

export default async function TrackPage({ searchParams }: PageProps<'/track'>) {
  const { order, phone } = await searchParams;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
      <TrackView
        initialOrder={typeof order === 'string' ? order : ''}
        initialPhone={typeof phone === 'string' ? phone : ''}
      />
    </section>
  );
}
