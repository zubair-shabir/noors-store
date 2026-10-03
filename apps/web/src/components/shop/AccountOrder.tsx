'use client';

import type { OrderDto } from '@noors/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useShop } from '@/lib/cart-store';
import { errorMessage, shopFetch } from '@/lib/shop-api';
import { textButton } from './form';
import { OrderDetail } from './OrderDetail';

/** One of the signed-in shopper's orders. */
export function AccountOrder({ number }: { number: string }) {
  const { customer, loaded } = useShop();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    shopFetch<OrderDto>(`/me/orders/${encodeURIComponent(number)}`)
      .then(setOrder)
      .catch((err) => setError(errorMessage(err)));
  }, [customer, number]);

  if (loaded && !customer) {
    return (
      <p className="py-24 text-center text-sm">
        <Link href="/account" className={textButton}>
          Sign in to see this order
        </Link>
      </p>
    );
  }
  if (error) return <p className="py-24 text-center text-sm text-muted">{error}</p>;
  if (!order) return <p className="py-32 text-center text-sm text-muted">Loading your order…</p>;

  return (
    <div>
      <Link href="/account" className={textButton}>
        ← All orders
      </Link>
      <h1 className="mt-6 mb-12 font-display text-5xl uppercase sm:text-6xl">{order.number}</h1>
      <OrderDetail order={order} />
    </div>
  );
}
