import type { Metadata } from 'next';
import { StaffList } from '@/components/admin/ops/staff/StaffList';

export const metadata: Metadata = { title: 'Staff' };

export default function StaffPage() {
  return <StaffList />;
}
