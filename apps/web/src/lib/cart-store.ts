'use client';

import type { CartDto, CustomerDto } from '@noors/shared';
import { create } from 'zustand';
import { shopFetch } from './shop-api';

interface ShopState {
  /** Null until the first load finishes. */
  cart: CartDto | null;
  customer: CustomerDto | null;
  /** True once the cart and the signed-in customer are known. */
  loaded: boolean;
  /** Fetches the cart and who is signed in. */
  load: () => Promise<void>;
  setCart: (cart: CartDto) => void;
  setCustomer: (customer: CustomerDto | null) => void;
  add: (variantId: string, quantity?: number) => Promise<CartDto>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Bags saved in the browser before carts moved to the server (Step 5). */
const LEGACY_KEY = 'noors-cart';

async function importLegacyCart(): Promise<boolean> {
  let lines: { variantId: string; quantity: number }[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return false;
    localStorage.removeItem(LEGACY_KEY);
    lines = (JSON.parse(raw) as { state?: { lines?: typeof lines } }).state?.lines ?? [];
  } catch {
    return false;
  }
  for (const line of lines) {
    await shopFetch('/cart/items', { method: 'POST', body: line }).catch(() => undefined);
  }
  return lines.length > 0;
}

/** The shopper's bag and account, kept on the server and mirrored here. */
export const useShop = create<ShopState>()((set, get) => ({
  cart: null,
  customer: null,
  loaded: false,
  load: async () => {
    await importLegacyCart();
    const [cart, me] = await Promise.all([
      shopFetch<CartDto>('/cart'),
      shopFetch<{ customer: CustomerDto | null }>('/me'),
    ]);
    set({ cart, customer: me.customer, loaded: true });
  },
  setCart: (cart) => set({ cart }),
  setCustomer: (customer) => set({ customer }),
  add: async (variantId, quantity = 1) => {
    const cart = await shopFetch<CartDto>('/cart/items', {
      method: 'POST',
      body: { variantId, quantity },
    });
    set({ cart });
    return cart;
  },
  setQuantity: async (itemId, quantity) => {
    // Show the new quantity straight away; the server's answer replaces it.
    const before = get().cart;
    if (before) {
      set({
        cart: {
          ...before,
          items: before.items.map((i) => (i.id === itemId ? { ...i, quantity } : i)),
        },
      });
    }
    try {
      set({
        cart: await shopFetch<CartDto>(`/cart/items/${itemId}`, {
          method: 'PATCH',
          body: { quantity },
        }),
      });
    } catch (err) {
      set({ cart: before });
      throw err;
    }
  },
  remove: async (itemId) => {
    set({ cart: await shopFetch<CartDto>(`/cart/items/${itemId}`, { method: 'DELETE' }) });
  },
  applyCoupon: async (code) => {
    set({ cart: await shopFetch<CartDto>('/cart/coupon', { method: 'POST', body: { code } }) });
  },
  removeCoupon: async () => {
    set({ cart: await shopFetch<CartDto>('/cart/coupon', { method: 'DELETE' }) });
  },
  signOut: async () => {
    await shopFetch('/auth/logout', { method: 'POST' });
    set({ customer: null });
    // Signed out, the shopper is a guest again with an empty bag.
    set({ cart: await shopFetch<CartDto>('/cart') });
  },
}));

export const useCartCount = () => useShop((s) => s.cart?.itemCount ?? 0);
