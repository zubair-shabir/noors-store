import type { Metadata } from 'next';
import { ComingSoon } from '@/components/ui/ComingSoon';

export const metadata: Metadata = { title: 'Terms' };

// Terms, privacy, shipping and refund policies are written in Step 9 (launch).
export default function TermsPage() {
  return <ComingSoon title="Terms" note="Our terms and store policies are being written." />;
}
