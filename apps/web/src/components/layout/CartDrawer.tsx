'use client';

import Image from 'next/image';
import { Minus, Plus } from 'lucide-react';
import { formatINR } from '@noors/shared';
import { Drawer } from '@/components/ui/Drawer';
import { cartSubtotal, useCart } from '@/lib/cart-store';
import { useUi } from '@/lib/ui-store';

export function CartDrawer() {
  const panel = useUi((s) => s.panel);
  const close = useUi((s) => s.close);
  const lines = useCart((s) => s.lines);
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const subtotal = cartSubtotal(lines);

  return (
    <Drawer
      open={panel === 'cart'}
      onClose={close}
      side="right"
      title="Your cart"
      footer={
        lines.length > 0 && (
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="tracking-[0.1em] uppercase">Subtotal</span>
              <span className="font-semibold">{formatINR(subtotal)}</span>
            </div>
            <p className="text-xs text-muted">Shipping and coupons are applied at checkout.</p>
            {/* Checkout is built in Step 6. */}
            <button
              type="button"
              disabled
              className="w-full bg-foreground py-3.5 text-[11px] font-semibold tracking-[0.18em] text-background uppercase disabled:opacity-60"
            >
              Checkout
            </button>
          </div>
        )
      }
    >
      {lines.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">Your cart is empty.</p>
      ) : (
        <ul className="divide-y divide-line">
          {lines.map((line) => (
            <li key={`${line.slug}-${line.size}`} className="flex gap-4 py-5 first:pt-0">
              <div className="relative h-28 w-24 shrink-0 overflow-hidden bg-surface">
                <Image src={line.image} alt="" fill sizes="96px" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col">
                <p className="text-sm uppercase">{line.name}</p>
                <p className="mt-1 text-xs text-muted">Size {line.size}</p>
                <p className="mt-1 text-sm">{formatINR(line.price)}</p>
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex items-center border border-line">
                    <button
                      type="button"
                      className="p-2"
                      aria-label="Decrease quantity"
                      onClick={() => setQuantity(line.slug, line.size, line.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      className="p-2"
                      aria-label="Increase quantity"
                      onClick={() => setQuantity(line.slug, line.size, line.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] tracking-[0.12em] text-muted uppercase underline-offset-4 hover:text-foreground hover:underline"
                    onClick={() => remove(line.slug, line.size)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
