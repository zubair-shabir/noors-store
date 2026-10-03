'use client';

import Link from 'next/link';
import { Menu, Search, ShoppingBag, User } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { useCartCount } from '@/lib/cart-store';
import { useUi } from '@/lib/ui-store';
import { ThemeToggle } from './ThemeToggle';

const iconButton = 'p-2 transition-opacity hover:opacity-60';

export function Header() {
  const open = useUi((s) => s.open);
  // Zero until the bag loads in the browser.
  const count = useCartCount();

  return (
    <header className="sticky top-0 z-50 bg-[var(--header)] shadow-[0_10px_30px_-12px_rgb(0_0_0/0.12)] backdrop-blur-xl">
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-3 sm:h-[76px] sm:px-6">
        <div>
          <button
            type="button"
            className={iconButton}
            onClick={() => open('menu')}
            aria-label="Open menu"
          >
            <Menu className="h-7 w-7" strokeWidth={2.25} />
          </button>
        </div>
        <Link href="/" aria-label="Noor's home" className="pt-2">
          <Logo className="text-xl sm:text-2xl" />
        </Link>
        <div className="flex items-center justify-end gap-1 sm:gap-2">
          <ThemeToggle className={iconButton} />
          <Link href="/account" className={`${iconButton} hidden sm:block`} aria-label="Account">
            <User className="h-[22px] w-[22px]" strokeWidth={2.25} />
          </Link>
          <button
            type="button"
            className={`${iconButton} relative`}
            onClick={() => open('cart')}
            aria-label={`Open cart, ${count} items`}
          >
            <ShoppingBag className="h-[22px] w-[22px]" strokeWidth={2.25} />
            {count > 0 && (
              <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
                {count}
              </span>
            )}
          </button>
          <button
            type="button"
            className={iconButton}
            onClick={() => open('search')}
            aria-label="Search"
          >
            <Search className="h-[22px] w-[22px]" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </header>
  );
}
