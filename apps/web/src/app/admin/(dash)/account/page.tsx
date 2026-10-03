import type { Metadata } from 'next';
import { AccountSecurity } from '@/components/admin/ops/account/AccountSecurity';

export const metadata: Metadata = { title: 'Your account' };

export default function AccountPage() {
  return <AccountSecurity />;
}
