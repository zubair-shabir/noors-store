import { expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { BASE_URL, OWNER } from './env.js';

/*
 * Test data through the API, the same way the dashboard and the store call it: through the
 * store's own origin, which proxies /api to the Express app.
 */

const V1 = '/api/v1';

async function json<T>(res: APIResponse, what: string): Promise<T> {
  if (!res.ok()) {
    throw new Error(`${what} failed with ${res.status()}: ${await res.text()}`);
  }
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

/** A short id that keeps names, slugs and emails apart between tests and runs. */
export const uniqueId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A Srinagar delivery address that the mock courier serves. */
export const SRINAGAR = {
  name: 'Aamir Test',
  phone: '9876543210',
  line1: '12 Residency Road',
  city: 'Srinagar',
  state: 'Jammu and Kashmir',
  pincode: '190001',
};

export interface Variant {
  id: string;
  title: string;
  stock: number;
  reserved: number;
  isActive: boolean;
  optionValueIds: string[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  variants: Variant[];
}

export interface StoreSettings {
  store: unknown;
  shipping: unknown;
  cod: { enabled: boolean; fee: number };
  returns: unknown;
  fulfilment: unknown;
  inventory: unknown;
}

export interface PlacedOrder {
  orderNumber: string;
  accessToken: string;
}

/** The dashboard API, signed in as the seeded owner. */
export class AdminApi {
  private constructor(readonly ctx: APIRequestContext) {}

  static async signIn(): Promise<AdminApi> {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    await json(
      await ctx.post(`${V1}/admin/auth/login`, { data: OWNER }),
      'Owner sign-in (is the database seeded?)',
    );
    return new AdminApi(ctx);
  }

  dispose() {
    return this.ctx.dispose();
  }

  private async call<T>(method: string, path: string, data?: unknown): Promise<T> {
    const res = await this.ctx.fetch(`${V1}/admin${path}`, { method, data });
    return json<T>(res, `${method} /admin${path}`);
  }

  async categoryId(slug: string): Promise<string> {
    const { items } = await this.call<{ items: { id: string; slug: string }[] }>(
      'GET',
      '/categories',
    );
    const category = items.find((c) => c.slug === slug);
    if (!category) throw new Error(`No category ${slug}; is the database seeded?`);
    return category.id;
  }

  /**
   * A live product with one variant per size and the given stock, e.g. { S: 0, M: 5 }.
   * Archive it with `archive` when the test is done.
   */
  async createProduct(stock: Record<string, number>, priceRupees = 1999): Promise<Product> {
    const id = uniqueId();
    const name = `E2E Pheran ${id}`;
    const sizes = Object.keys(stock);
    const created = await this.call<Product>('POST', '/products', {
      name,
      slug: `e2e-pheran-${id}`,
      description: 'Made by the end-to-end tests.',
      categoryId: await this.categoryId('hoodies'),
      tags: ['e2e'],
      price: priceRupees * 100,
    });
    let product = await this.call<Product>('PUT', `/products/${created.id}/options`, {
      options: [{ name: 'Size', values: sizes.map((value) => ({ value })) }],
      defaultPrice: priceRupees * 100,
    });
    const bySize = this.sizeVariants(product);
    product = await this.call<Product>('PATCH', `/products/${created.id}/variants`, {
      variants: sizes.map((size) => ({ id: bySize[size]!.id, stock: stock[size] })),
    });
    await this.call('PUT', `/products/${created.id}/images`, {
      images: [{ url: '/placeholder/kashmir-heritage-hoodie-1.webp', alt: name }],
    });
    await this.call('PATCH', `/products/${created.id}`, { status: 'ACTIVE' });
    return product;
  }

  /** Active variants of a product by their size, e.g. { M: variant }. */
  sizeVariants(product: Product): Record<string, Variant> {
    return Object.fromEntries(
      product.variants
        .filter((v) => v.isActive && v.optionValueIds.length > 0)
        .map((v) => [v.title, v]),
    );
  }

  /** Takes a product off the store (orders still point at it, so it is not deleted). */
  async archive(product: Product) {
    await this.call('PATCH', `/products/${product.id}`, { status: 'ARCHIVED' });
  }

  async productBySlug(slug: string): Promise<Product> {
    const { items } = await this.call<{ items: { id: string; slug: string }[] }>(
      'GET',
      `/products?q=${encodeURIComponent(slug.replace(/-/g, ' '))}&limit=100`,
    );
    const row = items.find((p) => p.slug === slug);
    if (!row) throw new Error(`No product ${slug}; is the database seeded?`);
    return this.call<Product>('GET', `/products/${row.id}`);
  }

  /** Makes sure a variant has at least `atLeast` units free to sell. */
  async ensureStock(product: Product, size: string, atLeast = 20) {
    const variant = this.sizeVariants(product)[size];
    if (!variant) throw new Error(`${product.name} has no size ${size}`);
    if (variant.stock - variant.reserved >= atLeast) return;
    await this.call('PATCH', `/products/${product.id}/variants`, {
      variants: [{ id: variant.id, stock: variant.reserved + atLeast + 30 }],
    });
  }

  async settings(): Promise<StoreSettings> {
    const { store, shipping, cod, returns, fulfilment, inventory } = await this.call<StoreSettings>(
      'GET',
      '/settings',
    );
    return { store, shipping, cod, returns, fulfilment, inventory };
  }

  async saveSettings(settings: StoreSettings) {
    await this.call('PUT', '/settings', settings);
  }
}

/**
 * Places and pays for an order as a guest, as the checkout page does with the test payment
 * dialog: bag, checkout, mock Razorpay payment, then the signature check.
 */
export async function placePaidOrder(
  variantId: string,
  email: string,
  address: Record<string, string> = SRINAGAR,
): Promise<PlacedOrder> {
  const shopper = await request.newContext({ baseURL: BASE_URL });
  try {
    await json(
      await shopper.post(`${V1}/cart/items`, { data: { variantId, quantity: 1 } }),
      'Add to bag',
    );
    const order = await json<PlacedOrder & { payment: { mode: string } | null }>(
      await shopper.post(`${V1}/checkout`, { data: { email, address } }),
      'Checkout',
    );
    expect(order.payment?.mode, 'the API should use the mock payment gateway').toBe('mock');
    const signed = await json<Record<string, string>>(
      await shopper.post(`${V1}/checkout/mock-pay`, {
        data: { orderNumber: order.orderNumber, accessToken: order.accessToken },
      }),
      'Mock payment',
    );
    await json(
      await shopper.post(`${V1}/checkout/verify`, {
        data: { orderNumber: order.orderNumber, ...signed },
      }),
      'Payment check',
    );
    return { orderNumber: order.orderNumber, accessToken: order.accessToken };
  } finally {
    await shopper.dispose();
  }
}
