import { z } from 'zod';
import type { Paise } from './money.js';
import { phoneSchema, pincodeSchema } from './schemas.js';
import type { ShipmentDto, TimelineEntryDto } from './shipping.js';

// ─── Cart ───────────────────────────────────────────────────────────────────

/** Most of one variant a shopper can put in the cart. */
export const MAX_LINE_QUANTITY = 10;

const quantity = z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY);

export const cartItemInputSchema = z.object({
  variantId: z.string().min(1).max(40),
  quantity: quantity.default(1),
});
export type CartItemInput = z.input<typeof cartItemInputSchema>;

export const cartItemUpdateSchema = z.object({ quantity });
export type CartItemUpdate = z.infer<typeof cartItemUpdateSchema>;

export const couponCodeSchema = z
  .string()
  .trim()
  .min(1, 'Enter a code')
  .max(40)
  .transform((v) => v.toUpperCase());

export const couponApplySchema = z.object({ code: couponCodeSchema });

/** Why a line can't be bought as it stands. */
export type CartLineIssue = 'sold_out' | 'not_enough_stock' | 'unavailable';

export interface CartLineDto {
  id: string;
  variantId: string;
  slug: string;
  name: string;
  /** e.g. "M / Olive", or "One size". */
  title: string;
  image: string | null;
  unitPrice: Paise;
  compareAtPrice: Paise | null;
  quantity: number;
  lineTotal: Paise;
  /** Most of this line the shopper can buy right now. */
  maxQuantity: number;
  issue: CartLineIssue | null;
}

export interface CartDto {
  items: CartLineDto[];
  itemCount: number;
  subtotal: Paise;
  discount: Paise;
  shippingFee: Paise;
  total: Paise;
  /** The applied coupon, when it still applies. */
  coupon: { code: string; description: string } | null;
  /** Set when a coupon is on the cart but doesn't apply (expired, minimum not met...). */
  couponError: string | null;
  /** Order value (after discount) from which shipping is free; null when it never is. */
  freeShippingFrom: Paise | null;
  /** True when every line can be bought as it stands. */
  ready: boolean;
}

// ─── Customers ──────────────────────────────────────────────────────────────

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email').max(200));

export const otpRequestSchema = z.object({ email });
export const otpVerifySchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export interface CustomerDto {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
}

export interface OtpRequestResult {
  /** Seconds until the code expires. */
  expiresIn: number;
  /** Development only, when no email service is set up: the code itself. */
  devCode?: string;
}

/** States and union territories, for the address form. */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

const text = (max: number, message: string) => z.string().trim().min(1, message).max(max);

export const addressFields = z.object({
  name: text(100, 'Enter the full name'),
  phone: phoneSchema,
  line1: text(200, 'Enter the house and street'),
  line2: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
  city: text(100, 'Enter the city'),
  state: z.enum(INDIAN_STATES, 'Choose a state'),
  pincode: pincodeSchema,
});
export type AddressFields = z.output<typeof addressFields>;

export const addressInputSchema = addressFields.extend({
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.input<typeof addressInputSchema>;

export interface AddressDto extends AddressFields {
  id: string;
  isDefault: boolean;
}

// ─── Checkout ───────────────────────────────────────────────────────────────

export const checkoutInputSchema = z.object({
  email,
  address: addressFields,
  /** Signed-in shoppers only: keep this address for next time. */
  saveAddress: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});
export type CheckoutInput = z.input<typeof checkoutInputSchema>;

/** What the browser needs to open Razorpay Checkout for an order. */
export interface PaymentSessionDto {
  /** "mock" in development without Razorpay keys: the store shows its own test dialog. */
  mode: 'razorpay' | 'mock';
  keyId: string;
  razorpayOrderId: string;
  amount: Paise;
  currency: 'INR';
  prefill: { name: string; email: string; contact: string };
}

export interface CheckoutResultDto {
  orderNumber: string;
  /** Secret for the order's confirmation link; lets a guest view the order. */
  accessToken: string;
  expiresAt: string;
  payment: PaymentSessionDto;
}

export const paymentVerifySchema = z.object({
  orderNumber: z.string().min(1).max(20),
  razorpayOrderId: z.string().min(1).max(60),
  razorpayPaymentId: z.string().min(1).max(60),
  razorpaySignature: z.string().min(1).max(200),
});
export type PaymentVerifyInput = z.infer<typeof paymentVerifySchema>;

/** Gives up an unpaid order now instead of waiting for it to expire. */
export const orderAccessSchema = z.object({
  orderNumber: z.string().min(1).max(20),
  accessToken: z.string().min(1).max(100),
});

// ─── Orders ─────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Confirmed',
  READY_TO_SHIP: 'Packed',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export interface OrderItemDto {
  name: string;
  title: string;
  sku: string;
  image: string | null;
  /** Null when the product has since been removed. */
  slug: string | null;
  unitPrice: Paise;
  quantity: number;
}

export interface OrderSummaryDto {
  number: string;
  status: OrderStatus;
  createdAt: string;
  total: Paise;
  itemCount: number;
  firstImage: string | null;
}

export interface OrderDto extends Omit<OrderSummaryDto, 'firstImage'> {
  placedAt: string | null;
  /** When an unpaid order will be cancelled. */
  expiresAt: string | null;
  email: string;
  phone: string;
  items: OrderItemDto[];
  subtotal: Paise;
  discount: Paise;
  shippingFee: Paise;
  couponCode: string | null;
  shippingAddress: AddressFields;
  shipment: ShipmentDto | null;
  timeline: TimelineEntryDto[];
}
