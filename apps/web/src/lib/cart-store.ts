'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Paise } from '@noors/shared';

export interface CartLine {
  slug: string;
  name: string;
  image: string;
  size: string;
  price: Paise;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  setQuantity: (slug: string, size: string, quantity: number) => void;
  remove: (slug: string, size: string) => void;
  clear: () => void;
}

const sameLine = (a: Pick<CartLine, 'slug' | 'size'>, b: Pick<CartLine, 'slug' | 'size'>) =>
  a.slug === b.slug && a.size === b.size;

// Guest cart kept in the browser; Step 6 moves it to the API for signed-in customers.
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line, quantity = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => sameLine(l, line));
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                sameLine(l, line) ? { ...l, quantity: l.quantity + quantity } : l,
              ),
            };
          }
          return { lines: [...state.lines, { ...line, quantity }] };
        }),
      setQuantity: (slug, size, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => !sameLine(l, { slug, size }))
              : state.lines.map((l) => (sameLine(l, { slug, size }) ? { ...l, quantity } : l)),
        })),
      remove: (slug, size) =>
        set((state) => ({ lines: state.lines.filter((l) => !sameLine(l, { slug, size })) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'noors-cart', storage: createJSONStorage(() => localStorage) },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
export const cartSubtotal = (lines: CartLine[]) =>
  lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
