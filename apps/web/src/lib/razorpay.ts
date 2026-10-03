'use client';

import type { PaymentSessionDto } from '@noors/shared';

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', cb: (res: { error: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Could not load Razorpay. Check your connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return loading;
}

/**
 * Opens Razorpay Checkout for an order. Resolves with the signed result when the shopper
 * pays, or null when they close it; payment failures inside the popup are reported through
 * `onFailure` while it stays open for another try.
 */
export async function openRazorpay(
  session: PaymentSessionDto,
  orderNumber: string,
  onFailure: (message: string) => void,
): Promise<RazorpaySuccess | null> {
  await loadScript();
  return new Promise((resolve) => {
    const checkout = new window.Razorpay!({
      key: session.keyId,
      amount: session.amount,
      currency: session.currency,
      order_id: session.razorpayOrderId,
      name: "Noor's",
      description: `Order ${orderNumber}`,
      prefill: session.prefill,
      notes: { order_number: orderNumber },
      theme: { color: '#1c1c1c' },
      handler: (res: RazorpaySuccess) => resolve(res),
      modal: { ondismiss: () => resolve(null), confirm_close: true },
    });
    checkout.on('payment.failed', (res) =>
      onFailure(res.error.description ?? 'The payment did not go through.'),
    );
    checkout.open();
  });
}
