import type { Metadata } from 'next';
import { CouponManager } from '@/components/admin/ops/coupons/CouponManager';

export const metadata: Metadata = { title: 'Coupons' };

export default function CouponsPage() {
  return <CouponManager />;
}
