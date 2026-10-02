'use client';

import type { OrderDto } from '@noors/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useShop } from '@/lib/cart-store';
import { errorMessage, shopFetch } from '@/lib/shop-api';
import { secondaryButton } from './form';
import { OrderDetail } from './OrderDetail';

/** How long to keep checking an order whose payment Razorpay hasn't confirmed yet. */
const POLL_FOR_MS = 2 * 60 * 1000;

/** The page a shopper lands on after paying; also the link to view a guest order later. */
export function OrderConfirmation({ number, accessKey }: { number: string; accessKey: string }) {
  const customer = useShop((s) => s.customer);
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const fetchOrder = async () => {
      try {
        const next = await shopFetch<OrderDto>(
          `/orders/${encodeURIComponent(number)}?key=${encodeURIComponent(accessKey)}`,
        );
        if (!live) return;
        setOrder(next);
        if (next.status === 'PENDING_PAYMENT' && Date.now() - started < POLL_FOR_MS) {
          timer = setTimeout(fetchOrder, 3000);
        }
      } catch (err) {
        if (live) setError(errorMessage(err));
      }
    };
    void fetchOrder();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [number, accessKey]);

  if (error) {
    return (
      <div className="py-24 text-center">
        <p className="text-lg">We couldn&apos;t find that order.</p>
        <p className="mt-2 text-sm text-muted">Check the link in your confirmation email.</p>
      </div>
    );
  }
  if (!order) return <p className="py-32 text-center text-sm text-muted">Loading your order…</p>;

  const heading =
    order.status === 'PENDING_PAYMENT'
      ? 'Confirming your payment'
      : order.status === 'CANCELLED'
        ? 'Order cancelled'
        : 'Thank you';

  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
        Order {order.number}
      </p>
      <h1 className="mt-3 font-display text-5xl uppercase sm:text-6xl">{heading}</h1>
      <p className="mt-4 max-w-xl text-sm text-muted">
        {order.status === 'PENDING_PAYMENT'
          ? 'We are waiting for Razorpay to confirm your payment. This page updates on its own; if you closed the payment window, nothing was charged.'
          : order.status === 'CANCELLED'
            ? 'This order was not paid in time, so we released the items. If money left your account, write to us and we will refund it.'
            : `Your order is confirmed. We will email ${order.email} when it ships.`}
      </p>
      <div className="mt-12">
        <OrderDetail order={order} />
      </div>
      <div className="mt-12 flex flex-wrap gap-4">
        <Link href="/shop/latest" className={secondaryButton}>
          Keep shopping
        </Link>
        {customer && (
          <Link href="/account" className={secondaryButton}>
            Your orders
          </Link>
        )}
      </div>
    </div>
  );
}
