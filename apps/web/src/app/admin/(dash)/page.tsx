'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdmin } from '@/components/admin/AdminShell';
import { Spinner } from '@/components/admin/ui';

/** Owners land on the dashboard, staff on the orders to pack. */
export default function AdminHome() {
  const admin = useAdmin();
  const router = useRouter();
  useEffect(() => {
    router.replace(admin.role === 'OWNER' ? '/admin/dashboard' : '/admin/orders');
  }, [admin.role, router]);
  return <Spinner label="Opening the dashboard" />;
}
