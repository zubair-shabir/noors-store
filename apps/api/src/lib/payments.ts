import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface GatewayOrder {
  id: string;
}

export interface PaymentGateway {
  /** "mock" signs payments itself so checkout can be tried without Razorpay keys. */
  readonly mode: 'razorpay' | 'mock';
  /** Public key the browser passes to Razorpay Checkout. */
  readonly keyId: string;
  createOrder(input: {
    amount: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<GatewayOrder>;
  /** Checks the signature Razorpay Checkout hands the browser after a successful payment. */
  verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, signature: string): boolean;
  /** Checks the X-Razorpay-Signature header of a webhook against its raw body. */
  verifyWebhook(rawBody: Buffer, signature: string): boolean;
  /** Refunds part or all of a captured payment, in paise. */
  refund(
    razorpayPaymentId: string,
    amount: number,
    notes?: Record<string, string>,
  ): Promise<GatewayRefund>;
}

export interface GatewayRefund {
  id: string;
  /** Razorpay processes most refunds at once; some stay pending until the bank confirms. */
  status: 'processed' | 'pending';
}

const hmac = (secret: string, data: string | Buffer) =>
  createHmac('sha256', secret).update(data).digest('hex');

function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

abstract class SignedGateway {
  constructor(
    protected readonly keySecret: string,
    protected readonly webhookSecret: string,
  ) {}

  verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, signature: string) {
    return safeEqualHex(hmac(this.keySecret, `${razorpayOrderId}|${razorpayPaymentId}`), signature);
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    return (
      Boolean(this.webhookSecret) && safeEqualHex(hmac(this.webhookSecret, rawBody), signature)
    );
  }
}

/** Razorpay Orders API (https://razorpay.com/docs/api/orders/). */
export class RazorpayGateway extends SignedGateway implements PaymentGateway {
  readonly mode = 'razorpay' as const;

  constructor(
    readonly keyId: string,
    keySecret: string,
    webhookSecret: string,
  ) {
    super(keySecret, webhookSecret);
  }

  private get headers() {
    return {
      Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    };
  }

  async refund(razorpayPaymentId: string, amount: number, notes?: Record<string, string>) {
    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpayPaymentId)}/refund`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ amount, notes, speed: 'normal' }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) throw new Error(`Razorpay refund failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { id: string; status: string };
    return { id: body.id, status: body.status === 'processed' ? 'processed' : 'pending' } as const;
  }

  async createOrder(input: { amount: number; receipt: string; notes?: Record<string, string> }) {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        amount: input.amount,
        currency: 'INR',
        receipt: input.receipt,
        notes: input.notes,
        // Capture as soon as the payment is authorised.
        payment_capture: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Razorpay order failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { id: string };
    return { id: body.id };
  }
}

/**
 * Stand-in for Razorpay in development and tests. Orders get fake ids, and `pay` produces
 * the same signature Razorpay would, so the real verification code runs.
 */
export class MockGateway extends SignedGateway implements PaymentGateway {
  readonly mode = 'mock' as const;
  readonly keyId = 'rzp_mock';

  constructor(keySecret = 'mock-key-secret', webhookSecret = 'mock-webhook-secret') {
    super(keySecret, webhookSecret);
  }

  /** Refunds "made" so far, for tests. */
  readonly refunds: { paymentId: string; amount: number }[] = [];
  /** Set to make the next refund throw, for tests. */
  failNextRefund: string | null = null;

  async createOrder() {
    return { id: `order_mock${randomBytes(7).toString('hex')}` };
  }

  async refund(razorpayPaymentId: string, amount: number) {
    if (this.failNextRefund) {
      const message = this.failNextRefund;
      this.failNextRefund = null;
      throw new Error(message);
    }
    this.refunds.push({ paymentId: razorpayPaymentId, amount });
    return { id: `rfnd_mock${randomBytes(7).toString('hex')}`, status: 'processed' as const };
  }

  /** What Razorpay Checkout would return for a successful payment of this order. */
  pay(razorpayOrderId: string) {
    const razorpayPaymentId = `pay_mock${randomBytes(7).toString('hex')}`;
    return {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: hmac(this.keySecret, `${razorpayOrderId}|${razorpayPaymentId}`),
    };
  }

  /** Signs a webhook body the way Razorpay does. */
  signWebhook(rawBody: string | Buffer) {
    return hmac(this.webhookSecret, rawBody);
  }
}
