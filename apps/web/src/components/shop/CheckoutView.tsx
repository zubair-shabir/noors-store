'use client';

import {
  formatINR,
  type AddressDto,
  type CartDto,
  type CheckoutResultDto,
  type OrderDto,
} from '@noors/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { issueText } from '@/lib/cart-issues';
import { useShop } from '@/lib/cart-store';
import { useDelivery } from '@/lib/delivery';
import { openRazorpay } from '@/lib/razorpay';
import { errorMessage, ShopError, shopFetch } from '@/lib/shop-api';
import { AddressForm, emptyAddress, type AddressDraft } from './AddressForm';
import { DeliveryNote } from './DeliveryCheck';
import {
  errorText,
  labelClass,
  primaryButton,
  secondaryButton,
  textButton,
  TextField,
} from './form';
import { OrderLines, Totals } from './OrderLines';
import { SignInForm } from './SignInForm';

const PENDING_KEY = 'noors-pending-order';

interface PendingOrder {
  result: CheckoutResultDto;
  /** What the order was made from; a changed bag or address needs a new order. */
  fingerprint: string;
}

const fingerprintOf = (cart: CartDto, email: string, address: AddressDraft) =>
  JSON.stringify([
    cart.items.map((i) => [i.variantId, i.quantity]),
    cart.coupon?.code ?? null,
    cart.total,
    email.trim().toLowerCase(),
    address,
  ]);

function readPending(): PendingOrder | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    const pending = raw ? (JSON.parse(raw) as PendingOrder) : null;
    if (!pending || new Date(pending.result.expiresAt).getTime() < Date.now() + 60_000) return null;
    return pending;
  } catch {
    return null;
  }
}

const writePending = (pending: PendingOrder | null) => {
  try {
    if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Private mode: the order still works, it just isn't reused after a reload.
  }
};

const toDraft = (a: AddressDto): AddressDraft => ({
  name: a.name,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2 ?? '',
  city: a.city,
  state: a.state,
  pincode: a.pincode,
});

/** One-page checkout: contact, delivery address, coupon, then payment with Razorpay. */
export function CheckoutView() {
  const router = useRouter();
  const { cart, customer, loaded, load, applyCoupon, removeCoupon } = useShop();
  const [email, setEmail] = useState('');
  const [showSignIn, setShowSignIn] = useState(false);
  const [loadedAddresses, setAddresses] = useState<AddressDto[] | null>(null);
  const [addressId, setAddressId] = useState<string>('new');
  const [address, setAddress] = useState<AddressDraft>(emptyAddress);
  const [saveAddress, setSaveAddress] = useState(true);
  const [notes, setNotes] = useState('');
  const [coupon, setCoupon] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [error, setError] = useState<ShopError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<'form' | 'creating' | 'paying' | 'confirming'>('form');
  const [mock, setMock] = useState<CheckoutResultDto | null>(null);

  // Signed-in shoppers start from their saved default address.
  useEffect(() => {
    if (!customer) return;
    let live = true;
    shopFetch<{ items: AddressDto[] }>('/me/addresses')
      .then(({ items }) => {
        if (!live) return;
        setAddresses(items);
        const first = items[0];
        if (first) {
          setAddressId(first.id);
          setAddress(toDraft(first));
        }
      })
      .catch(() => live && setAddresses([]));
    return () => {
      live = false;
    };
  }, [customer]);

  // Saved addresses only count while someone is signed in.
  const addresses = customer ? loadedAddresses : null;
  const contactEmail = customer?.email ?? email;
  const busy = stage !== 'form';

  const fieldError = (path: string) => error?.fieldError(path);
  const delivery = useDelivery(address.pincode.trim());

  const confirm = async (
    result: CheckoutResultDto,
    signed: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
  ) => {
    setStage('confirming');
    try {
      await shopFetch<OrderDto>('/checkout/verify', {
        method: 'POST',
        body: { orderNumber: result.orderNumber, ...signed },
      });
    } catch {
      // The payment went through at Razorpay; the order page waits for its webhook.
    }
    writePending(null);
    await load().catch(() => undefined);
    router.replace(`/orders/${result.orderNumber}?key=${encodeURIComponent(result.accessToken)}`);
  };

  const pay = async (result: CheckoutResultDto) => {
    setStage('paying');
    if (result.payment.mode === 'mock') {
      setMock(result);
      return;
    }
    try {
      const paid = await openRazorpay(result.payment, result.orderNumber, (m) => setMessage(m));
      if (!paid) {
        setStage('form');
        setMessage('Payment was not completed. Your items are held for 30 minutes.');
        return;
      }
      await confirm(result, {
        razorpayOrderId: paid.razorpay_order_id,
        razorpayPaymentId: paid.razorpay_payment_id,
        razorpaySignature: paid.razorpay_signature,
      });
    } catch (err) {
      setStage('form');
      setMessage(errorMessage(err));
    }
  };

  const placeOrder = async () => {
    if (!cart) return;
    setError(null);
    setMessage(null);
    const fingerprint = fingerprintOf(cart, contactEmail, address);
    const pending = readPending();
    if (pending?.fingerprint === fingerprint) {
      await pay(pending.result);
      return;
    }
    if (pending) {
      // The bag or address changed: let the old order's items go before making a new one.
      void shopFetch('/checkout/abandon', {
        method: 'POST',
        body: { orderNumber: pending.result.orderNumber, accessToken: pending.result.accessToken },
      }).catch(() => undefined);
      writePending(null);
    }
    setStage('creating');
    try {
      const result = await shopFetch<CheckoutResultDto>('/checkout', {
        method: 'POST',
        body: {
          email: contactEmail,
          address: { ...address, line2: address.line2 || undefined },
          saveAddress: Boolean(customer) && addressId === 'new' && saveAddress,
          notes: notes || undefined,
        },
      });
      writePending({ result, fingerprint });
      await pay(result);
    } catch (err) {
      setStage('form');
      if (err instanceof ShopError) {
        setError(err);
        // Stock or the coupon changed under us: show the bag as it is now.
        if (err.status === 409) await load().catch(() => undefined);
      } else {
        setMessage(errorMessage(err));
      }
    }
  };

  const submitCoupon = async () => {
    setCouponBusy(true);
    setCouponError(null);
    try {
      await applyCoupon(coupon);
      setCoupon('');
    } catch (err) {
      setCouponError(errorMessage(err));
    } finally {
      setCouponBusy(false);
    }
  };

  if (!loaded || !cart) {
    return <p className="py-32 text-center text-sm text-muted">Loading your bag…</p>;
  }
  if (cart.items.length === 0 && stage === 'form') {
    return (
      <div className="py-24 text-center">
        <p className="text-lg">Your bag is empty.</p>
        <Link href="/shop/latest" className={`${secondaryButton} mt-8`}>
          Shop the latest drip
        </Link>
      </div>
    );
  }

  const formError =
    error && error.issues.length === 0
      ? error.message
      : error
        ? 'Check the highlighted fields.'
        : null;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void placeOrder();
        }}
        className="space-y-12"
      >
        <section aria-labelledby="contact-heading">
          <div className="flex items-baseline justify-between">
            <h2 id="contact-heading" className="font-display text-2xl uppercase">
              Contact
            </h2>
            {!customer && !showSignIn && (
              <button type="button" className={textButton} onClick={() => setShowSignIn(true)}>
                Sign in
              </button>
            )}
          </div>
          <div className="mt-6">
            {customer ? (
              <p className="text-sm">
                Signed in as <span className="font-medium">{customer.email}</span>
              </p>
            ) : showSignIn ? (
              <div className="border border-line p-5">
                <p className="mb-5 text-sm text-muted">
                  Sign in to use your saved addresses and see this order in your account.
                </p>
                <SignInForm initialEmail={email} onSignedIn={() => setShowSignIn(false)} />
                <button
                  type="button"
                  className={`${textButton} mt-5`}
                  onClick={() => setShowSignIn(false)}
                >
                  Continue as guest
                </button>
              </div>
            ) : (
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fieldError('email')}
                hint="We send your order confirmation here."
                disabled={busy}
              />
            )}
          </div>
        </section>

        <section aria-labelledby="delivery-heading">
          <h2 id="delivery-heading" className="font-display text-2xl uppercase">
            Delivery
          </h2>
          {addresses && addresses.length > 0 && (
            <fieldset className="mt-6 space-y-3" disabled={busy}>
              <legend className="sr-only">Saved addresses</legend>
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer gap-3 border p-4 text-sm ${
                    addressId === a.id ? 'border-foreground' : 'border-line'
                  }`}
                >
                  <input
                    type="radio"
                    name="address"
                    className="mt-1 accent-[var(--foreground)]"
                    checked={addressId === a.id}
                    onChange={() => {
                      setAddressId(a.id);
                      setAddress(toDraft(a));
                    }}
                  />
                  <span>
                    <span className="font-medium">{a.name}</span>, {a.phone}
                    <br />
                    <span className="text-muted">
                      {[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}
                    </span>
                  </span>
                </label>
              ))}
              <label
                className={`flex cursor-pointer gap-3 border p-4 text-sm ${
                  addressId === 'new' ? 'border-foreground' : 'border-line'
                }`}
              >
                <input
                  type="radio"
                  name="address"
                  className="accent-[var(--foreground)]"
                  checked={addressId === 'new'}
                  onChange={() => {
                    setAddressId('new');
                    setAddress(emptyAddress);
                  }}
                />
                A new address
              </label>
            </fieldset>
          )}
          {(addressId === 'new' || !addresses?.length) && (
            <div className="mt-6 space-y-5">
              <AddressForm
                value={address}
                onChange={setAddress}
                errorFor={(f) => fieldError(`address.${f}`)}
                disabled={busy}
              />
              {customer && (
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[var(--foreground)]"
                    checked={saveAddress}
                    onChange={(e) => setSaveAddress(e.target.checked)}
                    disabled={busy}
                  />
                  Save this address for next time
                </label>
              )}
            </div>
          )}
          {addressId !== 'new' &&
            (fieldError('address.phone') || fieldError('address.pincode')) && (
              <p className={`mt-3 ${errorText}`}>
                This saved address needs updating:{' '}
                {fieldError('address.phone') ?? fieldError('address.pincode')}
              </p>
            )}
          <p className="mt-3 min-h-5 text-xs" aria-live="polite">
            <DeliveryNote delivery={delivery} />
          </p>
          <div className="mt-6">
            <label htmlFor="order-notes" className={labelClass}>
              Note for us (optional)
            </label>
            <textarea
              id="order-notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              className="mt-2 block w-full border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </div>
        </section>

        <section aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="font-display text-2xl uppercase">
            Payment
          </h2>
          <p className="mt-4 text-sm text-muted">
            Pay securely with UPI, cards, net banking or wallets through Razorpay. We hold your
            items for 30 minutes while you pay.
          </p>
          {(formError || message) && (
            <p role="alert" className={`mt-5 ${formError ? errorText : 'text-sm'}`}>
              {formError ?? message}
            </p>
          )}
          <button type="submit" className={`${primaryButton} mt-6`} disabled={busy || !cart.ready}>
            {stage === 'creating'
              ? 'Placing your order…'
              : stage === 'paying'
                ? 'Waiting for payment…'
                : stage === 'confirming'
                  ? 'Confirming your payment…'
                  : `Pay ${formatINR(cart.total)}`}
          </button>
          {!cart.ready && (
            <p className={`mt-3 ${errorText}`}>Some items in your bag need attention first.</p>
          )}
        </section>
      </form>

      <aside
        className="h-fit border border-line p-6 lg:sticky lg:top-28"
        aria-label="Order summary"
      >
        <h2 className="font-display text-2xl uppercase">Your bag</h2>
        <div className="mt-6">
          <OrderLines
            lines={cart.items.map((i) => ({
              key: i.id,
              name: i.name,
              title: i.title,
              image: i.image,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              note: i.issue && <p className={`mt-1 ${errorText}`}>{issueText(i)}</p>,
            }))}
          />
        </div>

        <div className="mt-6 border-t border-line pt-6">
          {cart.coupon ? (
            <div className="flex items-center justify-between text-sm">
              <span>
                <span className="font-semibold tracking-[0.08em]">{cart.coupon.code}</span>{' '}
                <span className="text-muted">{cart.coupon.description}</span>
              </span>
              <button
                type="button"
                className={textButton}
                onClick={() => void removeCoupon()}
                disabled={busy}
              >
                Remove
              </button>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submitCoupon();
              }}
              className="flex items-end gap-3"
            >
              <TextField
                label="Coupon code"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                maxLength={40}
                autoComplete="off"
                className="flex-1"
                disabled={busy || couponBusy}
              />
              <button
                type="submit"
                className={`${secondaryButton} h-12`}
                disabled={!coupon.trim() || busy || couponBusy}
              >
                Apply
              </button>
            </form>
          )}
          {(couponError || cart.couponError) && (
            <p className={`mt-2 ${errorText}`}>
              {couponError ?? `${cart.couponError}. The code is not applied.`}
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-line pt-6">
          <Totals
            subtotal={cart.subtotal}
            discount={cart.discount}
            discountLabel={cart.coupon?.code}
            shippingFee={cart.shippingFee}
            total={cart.total}
          />
        </div>
      </aside>

      {mock && (
        <MockPayment
          result={mock}
          onPaid={(signed) => {
            setMock(null);
            void confirm(mock, signed);
          }}
          onCancel={() => {
            setMock(null);
            setStage('form');
            setMessage('Payment was not completed. Your items are held for 30 minutes.');
          }}
        />
      )}
    </div>
  );
}

/** Development stand-in for the Razorpay popup, used when the API has no Razorpay keys. */
function MockPayment({
  result,
  onPaid,
  onCancel,
}: {
  result: CheckoutResultDto;
  onPaid: (signed: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mock-pay-title"
        className="w-full max-w-sm bg-background p-6 shadow-2xl"
      >
        <p className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">
          Test payment
        </p>
        <h2 id="mock-pay-title" className="mt-2 font-display text-3xl uppercase">
          {formatINR(result.payment.amount)}
        </h2>
        <p className="mt-3 text-sm text-muted">
          Razorpay keys are not set up yet, so this stands in for the Razorpay popup. No money
          moves. Order {result.orderNumber}.
        </p>
        {error && <p className={`mt-3 ${errorText}`}>{error}</p>}
        <div className="mt-6 space-y-3">
          <button
            type="button"
            className={primaryButton}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                onPaid(
                  await shopFetch('/checkout/mock-pay', {
                    method: 'POST',
                    body: { orderNumber: result.orderNumber, accessToken: result.accessToken },
                  }),
                );
              } catch (err) {
                setError(errorMessage(err));
                setBusy(false);
              }
            }}
          >
            Pay {formatINR(result.payment.amount)}
          </button>
          <button
            type="button"
            className={`${secondaryButton} w-full`}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
