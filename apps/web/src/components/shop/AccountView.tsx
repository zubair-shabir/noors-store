'use client';

import { formatINR, orderStatusLabel, type AddressDto, type OrderSummaryDto } from '@noors/shared';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useShop } from '@/lib/cart-store';
import { errorMessage, ShopError, shopFetch } from '@/lib/shop-api';
import { AddressForm, emptyAddress, type AddressDraft } from './AddressForm';
import { errorText, primaryButton, secondaryButton, textButton } from './form';
import { SignInForm } from './SignInForm';

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Kolkata',
});

/** Sign-in when signed out; order history and saved addresses when signed in. */
export function AccountView() {
  const { customer, loaded, signOut } = useShop();

  if (!loaded) return <p className="py-32 text-center text-sm text-muted">Loading…</p>;

  if (!customer) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-5xl uppercase sm:text-6xl">Sign in</h1>
        <p className="mt-4 text-sm text-muted">
          No password needed. We email you a code. New here? Signing in creates your account.
        </p>
        <div className="mt-10">
          <SignInForm />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl uppercase sm:text-6xl">Your account</h1>
          <p className="mt-3 text-sm text-muted">{customer.email}</p>
        </div>
        <button type="button" className={textButton} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      <div className="mt-14 grid gap-14 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Orders />
        <Addresses />
      </div>
    </div>
  );
}

function Orders() {
  const [orders, setOrders] = useState<OrderSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    shopFetch<{ items: OrderSummaryDto[] }>('/me/orders')
      .then((r) => setOrders(r.items))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <section aria-labelledby="orders-heading">
      <h2 id="orders-heading" className="font-display text-2xl uppercase">
        Orders
      </h2>
      {error && <p className={`mt-4 ${errorText}`}>{error}</p>}
      {!orders && !error && <p className="mt-6 text-sm text-muted">Loading…</p>}
      {orders?.length === 0 && (
        <div className="mt-6">
          <p className="text-sm text-muted">No orders yet.</p>
          <Link href="/shop/latest" className={`${secondaryButton} mt-6`}>
            Shop the latest drip
          </Link>
        </div>
      )}
      {orders && orders.length > 0 && (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {orders.map((o) => (
            <li key={o.number}>
              <Link
                href={`/account/orders/${o.number}`}
                className="flex items-center gap-4 py-4 transition-opacity hover:opacity-70"
              >
                <div className="relative h-16 w-12 shrink-0 bg-surface">
                  {o.firstImage && (
                    <Image src={o.firstImage} alt="" fill sizes="48px" className="object-cover" />
                  )}
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-medium">{o.number}</p>
                  <p className="text-muted">
                    {dateFormat.format(new Date(o.createdAt))} · {o.itemCount}{' '}
                    {o.itemCount === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="tabular-nums">{formatINR(o.total)}</p>
                  <p className="text-muted">{orderStatusLabel[o.status]}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const toDraft = (a: AddressDto): AddressDraft => ({ ...a, line2: a.line2 ?? '' });

function Addresses() {
  const [addresses, setAddresses] = useState<AddressDto[] | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(emptyAddress);
  const [error, setError] = useState<ShopError | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () =>
    shopFetch<{ items: AddressDto[] }>('/me/addresses').then((r) => setAddresses(r.items));

  useEffect(() => {
    void reload().catch(() => setAddresses([]));
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { ...draft, line2: draft.line2 || undefined };
      if (editing === 'new') await shopFetch('/me/addresses', { method: 'POST', body });
      else await shopFetch(`/me/addresses/${editing}`, { method: 'PUT', body });
      await reload();
      setEditing(null);
    } catch (err) {
      setError(err instanceof ShopError ? err : new ShopError(0, 'error', errorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="addresses-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="addresses-heading" className="font-display text-2xl uppercase">
          Addresses
        </h2>
        {editing === null && (addresses?.length ?? 0) < 10 && (
          <button
            type="button"
            className={textButton}
            onClick={() => {
              setDraft(emptyAddress);
              setError(null);
              setEditing('new');
            }}
          >
            Add
          </button>
        )}
      </div>

      {editing !== null ? (
        <form
          noValidate
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <AddressForm
            value={draft}
            onChange={setDraft}
            errorFor={(f) => error?.fieldError(f)}
            disabled={busy}
          />
          {error && error.issues.length === 0 && <p className={errorText}>{error.message}</p>}
          <div className="flex items-center gap-6">
            <button type="submit" className={`${primaryButton} w-auto px-8`} disabled={busy}>
              Save address
            </button>
            <button type="button" className={textButton} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {addresses?.length === 0 && (
            <p className="mt-6 text-sm text-muted">Addresses you save at checkout show up here.</p>
          )}
          <ul className="mt-6 space-y-4">
            {addresses?.map((a) => (
              <li key={a.id} className="border border-line p-4 text-sm">
                <p className="font-medium">
                  {a.name}
                  {a.isDefault && (
                    <span className="ml-2 text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
                      Default
                    </span>
                  )}
                </p>
                <p className="mt-1 leading-relaxed text-muted">
                  {[a.line1, a.line2].filter(Boolean).join(', ')}
                  <br />
                  {a.city}, {a.state} {a.pincode}
                  <br />
                  {a.phone}
                </p>
                <div className="mt-3 flex gap-5">
                  <button
                    type="button"
                    className={textButton}
                    disabled={busy}
                    onClick={() => {
                      setDraft(toDraft(a));
                      setError(null);
                      setEditing(a.id);
                    }}
                  >
                    Edit
                  </button>
                  {!a.isDefault && (
                    <button
                      type="button"
                      className={textButton}
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          shopFetch(`/me/addresses/${a.id}`, {
                            method: 'PUT',
                            body: { ...a, line2: a.line2 ?? undefined, isDefault: true },
                          }),
                        )
                      }
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    className={textButton}
                    disabled={busy}
                    onClick={() =>
                      act(() => shopFetch(`/me/addresses/${a.id}`, { method: 'DELETE' }))
                    }
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
