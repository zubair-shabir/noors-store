import type { Metadata } from 'next';
import { AccountView } from '@/components/shop/AccountView';

export const metadata: Metadata = { title: 'Account', robots: { index: false } };

/** Only paths on this site, so a crafted link cannot send a shopper elsewhere after sign-in. */
const localPath = (value: unknown) =>
  typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : undefined;

export default async function AccountPage({ searchParams }: PageProps<'/account'>) {
  const { next, intent } = await searchParams;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
      <AccountView next={localPath(next)} intent={intent === 'wishlist' ? 'wishlist' : undefined} />
    </section>
  );
}
