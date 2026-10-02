import type { Metadata } from 'next';
import { AccountView } from '@/components/shop/AccountView';

export const metadata: Metadata = { title: 'Account', robots: { index: false } };

export default function AccountPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
      <AccountView />
    </section>
  );
}
