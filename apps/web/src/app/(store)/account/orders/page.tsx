import type { Metadata } from 'next';
import { ComingSoon } from '@/components/ui/ComingSoon';

export const metadata: Metadata = { title: 'Orders' };

// Order history and tracking arrive with customer accounts in Steps 6 and 7.
export default function OrdersPage() {
  return <ComingSoon title="Orders" note="Order tracking is coming soon." />;
}
