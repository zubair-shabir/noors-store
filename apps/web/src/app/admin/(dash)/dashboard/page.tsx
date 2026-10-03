import type { Metadata } from 'next';
import { Dashboard } from '@/components/admin/ops/dashboard/Dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

const RANGES = [7, 30, 90] as const;

export default async function DashboardPage({ searchParams }: PageProps<'/admin/dashboard'>) {
  const { days: raw } = await searchParams;
  const asked = Number(Array.isArray(raw) ? raw[0] : raw);
  const days = RANGES.find((d) => d === asked) ?? 30;
  return <Dashboard days={days} />;
}
