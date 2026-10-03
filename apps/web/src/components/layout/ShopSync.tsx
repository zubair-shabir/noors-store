'use client';

import { useEffect } from 'react';
import { useShop } from '@/lib/cart-store';

/** Loads the bag and the signed-in shopper, and refreshes them when the tab comes back. */
export function ShopSync() {
  const load = useShop((s) => s.load);

  useEffect(() => {
    const refresh = () => void load().catch(() => undefined);
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return null;
}
