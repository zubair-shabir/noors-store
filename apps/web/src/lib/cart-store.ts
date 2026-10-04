'use client';

import type { CartDto, CustomerDto, WishlistIdsDto } from '@noors/shared';
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
  /** Ids of the signed-in shopper's saved products; empty when signed out or not loaded yet. */
  wishlist: string[];
  /** Whose saved ids `wishlist` holds (null until they arrive), so they are fetched once per shopper. */
  wishlistOwner: string | null;
  /** Fetches the saved ids when a different shopper signs in, and clears them on sign-out. */
  syncWishlist: (customer: CustomerDto | null) => Promise<void>;
  /** Saves or unsaves a product straight away, then confirms with the server (rolls back on error). */
  toggleWishlist: (productId: string) => Promise<void>;
}

/** Saves and unsaves still waiting on the server; their answers are applied by the last one. */
let wishlistPending = 0;
/** The shopper whose saved ids are being fetched. */
let wishlistFetching: string | null = null;

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
    await get().syncWishlist(me.customer);
  },
  setCart: (cart) => set({ cart }),
  setCustomer: (customer) => {
    set({ customer });
    void get().syncWishlist(customer);
  },
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
    set({ customer: null, wishlist: [], wishlistOwner: null });
    // Signed out, the shopper is a guest again with an empty bag.
    set({ cart: await shopFetch<CartDto>('/cart') });
  },
  wishlist: [],
  wishlistOwner: null,
  syncWishlist: async (customer) => {
    if (!customer) {
      if (get().wishlistOwner) set({ wishlist: [], wishlistOwner: null });
      return;
    }
    if (get().wishlistOwner === customer.id || wishlistFetching === customer.id) return;
    if (get().wishlistOwner) set({ wishlist: [], wishlistOwner: null });
    wishlistFetching = customer.id;
    try {
      const { productIds } = await shopFetch<WishlistIdsDto>('/me/wishlist/ids');
      if (get().customer?.id === customer.id) {
        set({ wishlist: productIds, wishlistOwner: customer.id });
      }
    } catch {
      // Hearts stay empty; the next load tries again.
    } finally {
      if (wishlistFetching === customer.id) wishlistFetching = null;
    }
  },
  toggleWishlist: async (productId) => {
    const saved = get().wishlist.includes(productId);
    const apply = (save: boolean) => {
      const rest = get().wishlist.filter((id) => id !== productId);
      set({ wishlist: save ? [productId, ...rest] : rest });
    };
    apply(!saved);
    wishlistPending += 1;
    try {
      const { productIds } = await shopFetch<WishlistIdsDto>(
        `/me/wishlist/${encodeURIComponent(productId)}`,
        { method: saved ? 'DELETE' : 'PUT' },
      );
      // With other taps in flight, this answer is already stale; the last one wins.
      if (wishlistPending === 1) set({ wishlist: productIds });
    } catch (err) {
      apply(saved);
      throw err;
    } finally {
      wishlistPending -= 1;
    }
  },
}));

export const useCartCount = () => useShop((s) => s.cart?.itemCount ?? 0);
