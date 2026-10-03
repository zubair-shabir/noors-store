import type { Metadata } from 'next';
import { SettingsForm } from '@/components/admin/ops/settings/SettingsForm';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return <SettingsForm />;
}
