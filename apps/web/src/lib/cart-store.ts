'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Paise } from '@noors/shared';

export interface CartLine {
  variantId: string;
  slug: string;
  name: string;
  /** e.g. "M / Olive", or "One size". */
  title: string;
  image: string | null;
  price: Paise;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

/** Most of one variant a shopper can put in the cart. */
export const MAX_LINE_QUANTITY = 10;

// Guest cart kept in the browser; Step 6 moves it to the API, which re-prices every line.
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line, quantity = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.variantId === line.variantId);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.variantId === line.variantId
                  ? { ...l, ...line, quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + quantity) }
                  : l,
              ),
            };
          }
          return {
            lines: [...state.lines, { ...line, quantity: Math.min(MAX_LINE_QUANTITY, quantity) }],
          };
        }),
      setQuantity: (variantId, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.variantId !== variantId)
              : state.lines.map((l) =>
                  l.variantId === variantId
                    ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, quantity) }
                    : l,
                ),
        })),
      remove: (variantId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.variantId !== variantId) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: 'noors-cart',
      storage: createJSONStorage(() => localStorage),
      // v1 lines (design step) had no variant ids and can't be bought; start fresh.
      version: 2,
      migrate: () => ({ lines: [] }),
    },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
export const cartSubtotal = (lines: CartLine[]) =>
  lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
