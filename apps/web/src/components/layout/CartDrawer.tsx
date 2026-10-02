'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { formatINR } from '@noors/shared';
import { Drawer } from '@/components/ui/Drawer';
import { issueText } from '@/lib/cart-issues';
import { useShop } from '@/lib/cart-store';
import { errorMessage } from '@/lib/shop-api';
import { productHref } from '@/lib/site';
import { useUi } from '@/lib/ui-store';

export function CartDrawer() {
  const panel = useUi((s) => s.panel);
  const close = useUi((s) => s.close);
  const cart = useShop((s) => s.cart);
  const setQuantity = useShop((s) => s.setQuantity);
  const remove = useShop((s) => s.remove);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const items = cart?.items ?? [];

  const run = async (itemId: string, action: () => Promise<void>) => {
    setBusy(itemId);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const toFreeShipping =
    cart && cart.freeShippingFrom !== null && cart.shippingFee > 0
      ? cart.freeShippingFrom - (cart.subtotal - cart.discount)
      : 0;

  return (
    <Drawer
      open={panel === 'cart'}
      onClose={close}
      side="right"
      title="Your cart"
      footer={
        cart &&
        items.length > 0 && (
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="tracking-[0.1em] uppercase">Subtotal</span>
              <span className="font-semibold">{formatINR(cart.subtotal)}</span>
            </div>
            <p className="text-xs text-muted">
              {toFreeShipping > 0
                ? `Add ${formatINR(toFreeShipping)} more for free shipping. Coupons are applied at checkout.`
                : 'Shipping and coupons are applied at checkout.'}
            </p>
            {cart.ready ? (
              <Link
                href="/checkout"
                onClick={close}
                className="block w-full bg-foreground py-3.5 text-center text-[11px] font-semibold tracking-[0.18em] text-background uppercase transition-opacity hover:opacity-85"
              >
                Checkout
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="w-full bg-foreground py-3.5 text-[11px] font-semibold tracking-[0.18em] text-background uppercase opacity-40"
              >
                Checkout
              </button>
            )}
          </div>
        )
      }
    >
      {error && (
        <p role="alert" className="mb-4 border border-line px-3 py-2 text-xs">
          {error}
        </p>
      )}
      {!cart ? (
        <p className="py-16 text-center text-sm text-muted">Loading your cart…</p>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">Your cart is empty.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((line) => (
            <li
              key={line.id}
              className={`flex gap-4 py-5 transition-opacity first:pt-0 ${
                busy === line.id ? 'opacity-60' : ''
              }`}
            >
              <Link
                href={productHref(line.slug)}
                onClick={close}
                className="relative h-28 w-24 shrink-0 overflow-hidden bg-surface"
              >
                {line.image && (
                  <Image
                    src={line.image}
                    alt=""
                    fill
                    sizes="96px"
                    className={`object-cover ${line.issue ? 'grayscale' : ''}`}
                  />
                )}
              </Link>
              <div className="flex flex-1 flex-col">
                <Link href={productHref(line.slug)} onClick={close} className="text-sm uppercase">
                  {line.name}
                </Link>
                <p className="mt-1 text-xs text-muted">{line.title}</p>
                <p className="mt-1 text-sm">{formatINR(line.unitPrice)}</p>
                {line.issue && <p className="mt-1 text-xs font-medium">{issueText(line)}</p>}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex items-center border border-line">
                    <button
                      type="button"
                      className="p-2 disabled:opacity-30"
                      aria-label="Decrease quantity"
                      disabled={busy === line.id}
                      onClick={() =>
                        run(line.id, () =>
                          line.quantity <= 1
                            ? remove(line.id)
                            : setQuantity(line.id, line.quantity - 1),
                        )
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      className="p-2 disabled:opacity-30"
                      aria-label="Increase quantity"
                      disabled={busy === line.id || line.quantity >= line.maxQuantity}
                      onClick={() => run(line.id, () => setQuantity(line.id, line.quantity + 1))}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] tracking-[0.12em] text-muted uppercase underline-offset-4 hover:text-foreground hover:underline"
                    disabled={busy === line.id}
                    onClick={() => run(line.id, () => remove(line.id))}
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
