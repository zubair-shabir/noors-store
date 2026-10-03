import { createHash, randomBytes } from 'node:crypto';
import { MAX_LINE_QUANTITY, type CartDto, type CartLineDto } from '@noors/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import {
  couponDiscount,
  couponProblem,
  describeCoupon,
  shippingSettings,
  totals,
} from './pricing.js';

/** Who the cart belongs to: a signed-in customer, or a guest identified by a cookie. */
export interface CartOwner {
  customerId?: string;
  guestToken?: string;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const cartInclude = {
  items: {
    orderBy: { id: 'asc' },
    include: {
      variant: {
        include: {
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
              hsnCode: true,
              images: { orderBy: { position: 'asc' }, select: { url: true, optionValueId: true } },
            },
          },
          optionValues: {
            include: { optionValue: { include: { option: { select: { position: true } } } } },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export type CartItemRow = CartWithItems['items'][number];

/** "M / Olive" from the variant's option values, in option order. */
export function variantTitle(item: CartItemRow): string {
  const values = [...item.variant.optionValues]
    .sort((a, b) => a.optionValue.option.position - b.optionValue.option.position)
    .map((v) => v.optionValue.value);
  return values.length ? values.join(' / ') : 'One size';
}

/** The photo for the variant's colour, else the product's first photo. */
export function variantImage(item: CartItemRow): string | null {
  const valueIds = new Set(item.variant.optionValues.map((v) => v.optionValueId));
  const images = item.variant.product.images;
  return (
    (images.find((i) => i.optionValueId && valueIds.has(i.optionValueId)) ?? images[0])?.url ?? null
  );
}

export function lineOf(item: CartItemRow): CartLineDto {
  const { variant } = item;
  const buyable = variant.isActive && variant.product.status === 'ACTIVE';
  const available = Math.max(0, variant.stock - variant.reserved);
  const issue = !buyable
    ? 'unavailable'
    : available === 0
      ? 'sold_out'
      : available < item.quantity
        ? 'not_enough_stock'
        : null;
  return {
    id: item.id,
    variantId: variant.id,
    slug: variant.product.slug,
    name: variant.product.name,
    title: variantTitle(item),
    image: variantImage(item),
    unitPrice: variant.price,
    compareAtPrice: variant.compareAtPrice,
    quantity: item.quantity,
    lineTotal: variant.price * item.quantity,
    maxQuantity: buyable ? Math.min(MAX_LINE_QUANTITY, available) : 0,
    issue,
  };
}

export class CartService {
  constructor(private readonly prisma: PrismaClient) {}

  /** The owner's cart, or null when they have none yet. */
  async find(owner: CartOwner): Promise<CartWithItems | null> {
    if (owner.customerId) {
      return this.prisma.cart.findUnique({
        where: { customerId: owner.customerId },
        include: cartInclude,
      });
    }
    if (owner.guestToken) {
      return this.prisma.cart.findUnique({
        where: { sessionToken: hashToken(owner.guestToken) },
        include: cartInclude,
      });
    }
    return null;
  }

  /** The owner's cart, creating it (and, for a guest, a new cookie token) when missing. */
  private async ensure(owner: CartOwner): Promise<{ cartId: string; newGuestToken?: string }> {
    const existing = await this.find(owner);
    if (existing) return { cartId: existing.id };
    if (owner.customerId) {
      const cart = await this.prisma.cart.upsert({
        where: { customerId: owner.customerId },
        create: { customerId: owner.customerId },
        update: {},
      });
      return { cartId: cart.id };
    }
    const token = randomBytes(32).toString('base64url');
    const cart = await this.prisma.cart.create({ data: { sessionToken: hashToken(token) } });
    return { cartId: cart.id, newGuestToken: token };
  }

  async toDto(cart: CartWithItems | null, customerId?: string): Promise<CartDto> {
    const items = (cart?.items ?? []).map(lineOf);
    const subtotal = items.reduce((sum, l) => sum + l.lineTotal, 0);
    const shipping = await shippingSettings(this.prisma);

    let coupon: CartDto['coupon'] = null;
    let couponError: string | null = null;
    let discount = 0;
    if (cart?.couponCode) {
      const row = await this.prisma.coupon.findUnique({ where: { code: cart.couponCode } });
      const hasOrdered = customerId ? await this.hasOrdered({ customerId }) : undefined;
      couponError = couponProblem(row, { subtotal, hasOrdered });
      if (row && !couponError) {
        coupon = { code: row.code, description: describeCoupon(row) };
        discount = couponDiscount(row, subtotal);
      }
    }

    return {
      items,
      itemCount: items.reduce((n, l) => n + l.quantity, 0),
      ...totals(subtotal, discount, shipping),
      coupon,
      couponError,
      freeShippingFrom: shipping.freeFrom,
      ready: items.length > 0 && items.every((l) => !l.issue),
    };
  }

  /** Whether this shopper (by account or email) already has a paid order. */
  async hasOrdered(who: { customerId?: string; email?: string }): Promise<boolean> {
    const or: Prisma.OrderWhereInput[] = [];
    if (who.customerId) or.push({ customerId: who.customerId });
    if (who.email) or.push({ email: who.email });
    if (!or.length) return false;
    const count = await this.prisma.order.count({
      where: { OR: or, placedAt: { not: null } },
    });
    return count > 0;
  }

  async addItem(owner: CartOwner, variantId: string, quantity: number) {
    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId },
      include: { product: { select: { status: true } } },
    });
    if (!variant || !variant.isActive || variant.product.status !== 'ACTIVE') {
      throw new HttpError(404, 'This item is no longer available', 'unavailable');
    }
    const { cartId, newGuestToken } = await this.ensure(owner);
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
    });
    const wanted = (existing?.quantity ?? 0) + quantity;
    this.checkQuantity(wanted, variant.stock - variant.reserved);
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, quantity: wanted },
      update: { quantity: wanted },
    });
    await this.touch(cartId);
    return { newGuestToken };
  }

  async setQuantity(owner: CartOwner, itemId: string, quantity: number) {
    const item = await this.ownedItem(owner, itemId);
    // Lowering a quantity is always allowed, even when stock has dropped below it.
    if (quantity > item.quantity) {
      this.checkQuantity(quantity, item.variant.stock - item.variant.reserved);
    }
    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    await this.touch(item.cartId);
  }

  async removeItem(owner: CartOwner, itemId: string) {
    const item = await this.ownedItem(owner, itemId);
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    await this.touch(item.cartId);
  }

  /** Puts a coupon on the cart; throws with the reason when it can't be used. */
  async applyCoupon(owner: CartOwner, code: string) {
    const cart = await this.find(owner);
    if (!cart?.items.length)
      throw new HttpError(400, 'Add something to your bag first', 'empty_cart');
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    const subtotal = cart.items.reduce((sum, i) => sum + i.variant.price * i.quantity, 0);
    const hasOrdered = owner.customerId ? await this.hasOrdered(owner) : undefined;
    const problem = couponProblem(coupon, { subtotal, hasOrdered });
    if (problem) throw new HttpError(422, problem, 'coupon_invalid');
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: code } });
  }

  async removeCoupon(owner: CartOwner) {
    const cart = await this.find(owner);
    if (cart) await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  }

  /**
   * Moves a guest cart into the customer's cart when they sign in. Quantities of the same
   * item add up (to the per-item limit); the guest's coupon wins if the customer had none.
   */
  async mergeGuestCart(guestToken: string, customerId: string) {
    const guest = await this.find({ guestToken });
    if (!guest) return;
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.cart.upsert({
        where: { customerId },
        create: { customerId, couponCode: guest.couponCode },
        update: {},
        include: { items: true },
      });
      for (const item of guest.items) {
        const current = target.items.find((i) => i.variantId === item.variantId);
        const quantity = Math.min(MAX_LINE_QUANTITY, (current?.quantity ?? 0) + item.quantity);
        await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } },
          create: { cartId: target.id, variantId: item.variantId, quantity },
          update: { quantity },
        });
      }
      if (!target.couponCode && guest.couponCode) {
        await tx.cart.update({ where: { id: target.id }, data: { couponCode: guest.couponCode } });
      }
      await tx.cart.delete({ where: { id: guest.id } });
    });
  }

  private checkQuantity(wanted: number, available: number) {
    if (available <= 0) throw new HttpError(409, 'This size just sold out', 'sold_out');
    if (wanted > available) {
      throw new HttpError(
        409,
        available === 1 ? 'Only 1 left in stock' : `Only ${available} left in stock`,
        'not_enough_stock',
      );
    }
    if (wanted > MAX_LINE_QUANTITY) {
      throw new HttpError(
        409,
        `You can buy up to ${MAX_LINE_QUANTITY} of each item`,
        'quantity_limit',
      );
    }
  }

  private async ownedItem(owner: CartOwner, itemId: string) {
    const cart = await this.find(owner);
    const item = cart?.items.find((i) => i.id === itemId);
    if (!item) throw new HttpError(404, 'That item is not in your bag', 'not_found');
    return item;
  }

  private touch(cartId: string) {
    return this.prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  }
}
