import { formatINR } from '@noors/shared';
import type { Coupon } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { DEFAULT_SETTINGS, loadSetting } from '../settings/settings.service.js';

export interface ShippingSettings {
  /** Charged when the order is below `freeFrom`, in paise. */
  flatFee: number;
  /** Order value (after discount) from which shipping is free, in paise; null for never. */
  freeFrom: number | null;
}

export const DEFAULT_SHIPPING: ShippingSettings = DEFAULT_SETTINGS.shipping;

/** Shipping charges from the settings table (`shipping`), falling back to the defaults. */
export function shippingSettings(prisma: PrismaClient): Promise<ShippingSettings> {
  return loadSetting(prisma, 'shipping');
}

export interface CouponContext {
  subtotal: number;
  now?: Date;
  /**
   * Whether the shopper has a paid order already; undefined when we don't know who they are
   * yet (a guest before checkout). First-order coupons are re-checked at checkout.
   */
  hasOrdered?: boolean;
}

/** Why a coupon can't be used, or null when it can. */
export function couponProblem(coupon: Coupon | null, ctx: CouponContext): string | null {
  const now = ctx.now ?? new Date();
  if (!coupon || !coupon.isActive) return 'This code is not valid';
  if (coupon.startsAt && coupon.startsAt > now) return 'This code is not active yet';
  if (coupon.expiresAt && coupon.expiresAt <= now) return 'This code has expired';
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return 'This code has been fully used';
  }
  if (coupon.minOrderValue !== null && ctx.subtotal < coupon.minOrderValue) {
    return `Add ${formatINR(coupon.minOrderValue - ctx.subtotal)} more to use this code`;
  }
  if (coupon.firstOrderOnly && ctx.hasOrdered) return 'This code is for first orders only';
  return null;
}

export function couponDiscount(coupon: Coupon, subtotal: number): number {
  // Percentage discounts round down to whole rupees, like the prices they come off.
  const raw =
    coupon.type === 'PERCENT'
      ? Math.floor((subtotal * coupon.value) / 100 / 100) * 100
      : coupon.value;
  const capped = coupon.maxDiscount !== null ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, subtotal));
}

export function describeCoupon(coupon: Coupon): string {
  const off = coupon.type === 'PERCENT' ? `${coupon.value}% off` : `${formatINR(coupon.value)} off`;
  return coupon.maxDiscount !== null && coupon.type === 'PERCENT'
    ? `${off}, up to ${formatINR(coupon.maxDiscount)}`
    : off;
}

export interface Totals {
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
}

export function totals(subtotal: number, discount: number, shipping: ShippingSettings): Totals {
  const afterDiscount = subtotal - discount;
  const free = subtotal === 0 || (shipping.freeFrom !== null && afterDiscount >= shipping.freeFrom);
  const shippingFee = free ? 0 : shipping.flatFee;
  return { subtotal, discount, shippingFee, total: afterDiscount + shippingFee };
}
