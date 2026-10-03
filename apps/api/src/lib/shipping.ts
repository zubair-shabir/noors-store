import { randomInt, timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';

export interface Serviceability {
  serviceable: boolean;
  /** Days the cheapest recommended courier quotes, when known. */
  estimatedDays: number | null;
}

/** A shipment as Shiprocket needs it. Weights in kg, sizes in cm, money in rupees. */
export interface ShipmentRequest {
  orderNumber: string;
  orderDate: Date;
  customer: { name: string; email: string; phone: string };
  address: { line1: string; line2: string | null; city: string; state: string; pincode: string };
  items: { name: string; sku: string; units: number; sellingPrice: number; hsn: string | null }[];
  paymentMethod: 'Prepaid' | 'COD';
  subTotal: number;
  discount: number;
  shippingCharges: number;
  package: { weightKg: number; lengthCm: number; breadthCm: number; heightCm: number };
}

export interface ShippingProvider {
  /** "mock" books fake shipments so the flow works without Shiprocket credentials. */
  readonly mode: 'shiprocket' | 'mock';
  serviceability(pincode: string, weightKg: number): Promise<Serviceability>;
  createOrder(req: ShipmentRequest): Promise<{ orderId: string; shipmentId: string }>;
  assignAwb(shipmentId: string): Promise<{ awb: string; courier: string }>;
  schedulePickup(shipmentId: string): Promise<void>;
  /** URL of the printable shipping label, when the courier has one. */
  label(shipmentId: string): Promise<string | null>;
  /** Cancels a Shiprocket order (before pickup). */
  cancelOrder(shiprocketOrderId: string): Promise<void>;
  /** Checks the token Shiprocket sends with tracking webhooks. */
  verifyWebhook(token: string): boolean;
}

export const trackingUrl = (awb: string) => `https://shiprocket.co/tracking/${awb}`;

function safeEqual(expected: string, actual: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

const BASE = 'https://apiv2.shiprocket.in/v1/external';
/** Shiprocket tokens last 10 days; renew a day early. */
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

interface CourierOption {
  courier_name: string;
  estimated_delivery_days?: string | number;
  rate?: number;
  courier_company_id: number;
}

/** Shiprocket's external API (https://apidocs.shiprocket.in). */
export class ShiprocketProvider implements ShippingProvider {
  readonly mode = 'shiprocket' as const;
  private token: { value: string; expires: number } | null = null;

  constructor(
    private readonly opts: {
      email: string;
      password: string;
      pickupLocation: string;
      pickupPincode: string;
      webhookToken: string;
    },
  ) {}

  async serviceability(pincode: string, weightKg: number): Promise<Serviceability> {
    const params = new URLSearchParams({
      pickup_postcode: this.opts.pickupPincode,
      delivery_postcode: pincode,
      weight: String(weightKg),
      cod: '0',
    });
    const body = await this.call<{
      status?: number;
      data?: {
        available_courier_companies?: CourierOption[];
        recommended_courier_company_id?: number;
      };
    }>('GET', `/courier/serviceability/?${params}`, undefined, [404]);
    const options = body.data?.available_courier_companies ?? [];
    if (!options.length) return { serviceable: false, estimatedDays: null };
    const recommended =
      options.find((o) => o.courier_company_id === body.data?.recommended_courier_company_id) ??
      options[0]!;
    const days = Number(recommended.estimated_delivery_days);
    return { serviceable: true, estimatedDays: Number.isFinite(days) && days > 0 ? days : null };
  }

  async createOrder(req: ShipmentRequest) {
    const [first, ...rest] = req.customer.name.trim().split(/\s+/);
    const body = await this.call<{ order_id: number; shipment_id: number }>(
      'POST',
      '/orders/create/adhoc',
      {
        order_id: req.orderNumber,
        order_date: req.orderDate.toISOString().slice(0, 16).replace('T', ' '),
        pickup_location: this.opts.pickupLocation,
        billing_customer_name: first,
        billing_last_name: rest.join(' '),
        billing_address: req.address.line1,
        billing_address_2: req.address.line2 ?? '',
        billing_city: req.address.city,
        billing_pincode: req.address.pincode,
        billing_state: req.address.state,
        billing_country: 'India',
        billing_email: req.customer.email,
        billing_phone: req.customer.phone,
        shipping_is_billing: true,
        order_items: req.items.map((i) => ({
          name: i.name,
          sku: i.sku,
          units: i.units,
          selling_price: i.sellingPrice,
          hsn: i.hsn ?? '',
        })),
        payment_method: req.paymentMethod,
        sub_total: req.subTotal,
        total_discount: req.discount,
        shipping_charges: req.shippingCharges,
        length: req.package.lengthCm,
        breadth: req.package.breadthCm,
        height: req.package.heightCm,
        weight: req.package.weightKg,
      },
    );
    return { orderId: String(body.order_id), shipmentId: String(body.shipment_id) };
  }

  async assignAwb(shipmentId: string) {
    const body = await this.call<{
      awb_assign_status?: number;
      response?: { data?: { awb_code?: string; courier_name?: string } };
      message?: string;
    }>('POST', '/courier/assign/awb', { shipment_id: shipmentId });
    const data = body.response?.data;
    if (!data?.awb_code)
      throw new Error(`No AWB assigned: ${body.message ?? JSON.stringify(body)}`);
    return { awb: data.awb_code, courier: data.courier_name ?? 'Courier' };
  }

  async schedulePickup(shipmentId: string) {
    await this.call('POST', '/courier/generate/pickup', { shipment_id: [shipmentId] });
  }

  async label(shipmentId: string) {
    const body = await this.call<{ label_url?: string; label_created?: number }>(
      'POST',
      '/courier/generate/label',
      { shipment_id: [shipmentId] },
    );
    return body.label_url || null;
  }

  async cancelOrder(shiprocketOrderId: string) {
    await this.call('POST', '/orders/cancel', { ids: [Number(shiprocketOrderId)] });
  }

  verifyWebhook(token: string) {
    return safeEqual(this.opts.webhookToken, token);
  }

  private async authToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expires > Date.now()) return this.token.value;
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.opts.email, password: this.opts.password }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Shiprocket login failed (${res.status})`);
    const { token } = (await res.json()) as { token: string };
    this.token = { value: token, expires: Date.now() + TOKEN_TTL_MS };
    return token;
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    okStatuses: number[] = [],
    retried = false,
  ): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.authToken()}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401 && !retried) {
      await this.authToken(true);
      return this.call(method, path, body, okStatuses, true);
    }
    const text = await res.text();
    if (!res.ok && !okStatuses.includes(res.status)) {
      throw new Error(
        `Shiprocket ${method} ${path.split('?')[0]} failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }
    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      logger.warn({ path }, 'Shiprocket returned non-JSON');
      return {} as T;
    }
  }
}

/**
 * Stand-in for Shiprocket in development and tests. Every pincode is serviceable except
 * Army Post Office ones (starting with 9), Jammu and Kashmir gets 3 days and the rest 5,
 * and bookings get made-up ids and AWB numbers.
 */
export class MockShippingProvider implements ShippingProvider {
  readonly mode = 'mock' as const;
  /** Shipments "booked" so far, for tests. */
  readonly booked: ShipmentRequest[] = [];
  /** Set to make the next booking step throw, for tests. */
  failNext: string | null = null;

  constructor(private readonly webhookToken = 'mock-courier-token') {}

  async serviceability(pincode: string): Promise<Serviceability> {
    if (pincode.startsWith('9')) return { serviceable: false, estimatedDays: null };
    return { serviceable: true, estimatedDays: pincode.startsWith('19') ? 3 : 5 };
  }

  async createOrder(req: ShipmentRequest) {
    this.maybeFail();
    this.booked.push(req);
    return { orderId: `mock-${randomInt(1e8, 1e9)}`, shipmentId: `mock-${randomInt(1e8, 1e9)}` };
  }

  async assignAwb() {
    this.maybeFail();
    return { awb: `MOCK${randomInt(1e9, 1e10)}`, courier: 'Mock Express' };
  }

  async schedulePickup() {
    this.maybeFail();
  }

  async label() {
    return null;
  }

  /** Shiprocket order ids cancelled so far, for tests. */
  readonly cancelled: string[] = [];

  async cancelOrder(shiprocketOrderId: string) {
    this.cancelled.push(shiprocketOrderId);
  }

  verifyWebhook(token: string) {
    return safeEqual(this.webhookToken, token);
  }

  private maybeFail() {
    if (this.failNext) {
      const message = this.failNext;
      this.failNext = null;
      throw new Error(message);
    }
  }
}
