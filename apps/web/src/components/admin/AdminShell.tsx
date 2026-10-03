'use client';

import type { AdminMeDto } from '@noors/shared';
import {
  Boxes,
  FolderTree,
  Image as ImageIcon,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Star,
  TicketPercent,
  Undo2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { adminFetch, useAdminData } from '@/lib/admin/api';
import { Spinner, Toaster, cx } from './ui';

const AdminContext = createContext<AdminMeDto | null>(null);

/** The signed-in admin. Only usable inside the dashboard layout. */
export function useAdmin(): AdminMeDto {
  const admin = useContext(AdminContext);
  if (!admin) throw new Error('useAdmin must be used inside AdminShell');
  return admin;
}

export const useIsOwner = () => useAdmin().role === 'OWNER';

const nav = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, ownerOnly: true },
  { href: '/admin/orders', label: 'Orders', icon: Receipt },
  { href: '/admin/returns', label: 'Returns', icon: Undo2 },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { href: '/admin/coupons', label: 'Coupons', icon: TicketPercent, ownerOnly: true },
  { section: 'Catalogue' },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/categories', label: 'Categories', icon: FolderTree },
  { href: '/admin/collections', label: 'Collections', icon: Layers },
  { href: '/admin/featured', label: 'Featured', icon: Star },
  { href: '/admin/banners', label: 'Home banners', icon: ImageIcon },
  { section: 'Store' },
  { href: '/admin/settings', label: 'Settings', icon: Settings, ownerOnly: true },
  { href: '/admin/staff', label: 'Staff', icon: UserCog, ownerOnly: true },
  { href: '/admin/account', label: 'Your account', icon: ShieldCheck },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data } = useAdminData<{ admin: AdminMeDto }>('/auth/me');

  async function logout() {
    await adminFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/admin/login');
  }

  if (!data) return <Spinner label="Checking your session" />;

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-4">
      <div className="mb-6 flex items-center justify-between px-2">
        <Link href="/admin" aria-label="Dashboard home">
          <Logo />
        </Link>
        <button
          type="button"
          className="md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>
      {nav.map((item) => {
        if ('section' in item) {
          return (
            <p
              key={item.section}
              className="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase"
            >
              {item.section}
            </p>
          );
        }
        const { href, label, icon: Icon } = item;
        if ('ownerOnly' in item && item.ownerOnly && data.admin.role !== 'OWNER') return null;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
              active
                ? 'bg-foreground text-background'
                : 'text-muted hover:bg-surface hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
      <div className="mt-auto border-t border-line pt-4">
        <p className="truncate px-3 text-sm font-medium">{data.admin.name}</p>
        <p className="truncate px-3 text-xs text-muted">
          {data.admin.email} · {data.admin.role === 'OWNER' ? 'Owner' : 'Staff'}
        </p>
        <button
          type="button"
          onClick={logout}
          className="mt-3 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-surface hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <AdminContext.Provider value={data.admin}>
      <div className="min-h-screen bg-surface md:grid md:grid-cols-[240px_1fr]">
        <aside className="sticky top-0 hidden h-screen border-r border-line bg-background md:block">
          {sidebar}
        </aside>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 bg-background">{sidebar}</aside>
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-3 border-b border-line bg-background px-4 py-3 md:hidden">
            <button type="button" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <Logo />
          </div>
          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
        </div>
      </div>
      <Toaster />
    </AdminContext.Provider>
  );
}
