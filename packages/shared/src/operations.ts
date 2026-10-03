import { z } from 'zod';
import type { AdminRole } from './admin.js';
import type { AddressFields, OrderStatus } from './commerce.js';
import type { Paise } from './money.js';
import type { ShipmentStatus, TrackingScanDto } from './shipping.js';

/* Admin operations: orders, returns, customers, coupons, stock, reports, settings, staff. */

const paise = z.coerce.number().int().min(0).max(100_000_000);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
/** "2026-10-03" */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(25);

export type PaymentMethod = 'RAZORPAY' | 'COD';
export type PaymentStatus =
  'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type RefundStatus = 'PENDING' | 'PROCESSED' | 'FAILED';

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  CREATED: 'Not paid',
  AUTHORIZED: 'Authorised',
  CAPTURED: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partly refunded',
};

// ─── Orders ─────────────────────────────────────────────────────────────────

/** "TO_SHIP" is paid orders not yet handed to the courier; "OPEN" is everything but unpaid. */
export const adminOrderFilterSchema = z.enum([
  'OPEN',
  'TO_SHIP',
  'ALL',
  'PENDING_PAYMENT',
  'PAID',
  'READY_TO_SHIP',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
]);
export type AdminOrderFilter = z.infer<typeof adminOrderFilterSchema>;

export const adminOrderListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: adminOrderFilterSchema.default('OPEN'),
  payment: z.enum(['RAZORPAY', 'COD']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page,
  limit,
});
export type AdminOrderListQuery = z.input<typeof adminOrderListQuerySchema>;

export interface AdminOrderRowDto {
  number: string;
  status: OrderStatus;
  createdAt: string;
  placedAt: string | null;
  name: string;
  email: string;
  phone: string;
  city: string;
  total: Paise;
  itemCount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus | null;
  /** Something on the order needs a person (failed booking, payment to refund, return asked). */
  attention: string | null;
}

export interface AdminOrderItemDto {
  id: string;
  variantId: string | null;
  productId: string | null;
  name: string;
  title: string;
  sku: string;
  image: string | null;
  unitPrice: Paise;
  quantity: number;
  hsnCode: string | null;
}

export interface AdminPaymentDto {
  id: string;
  provider: PaymentMethod;
  status: PaymentStatus;
  amount: Paise;
  razorpayPaymentId: string | null;
  method: string | null;
  createdAt: string;
}

export interface AdminRefundDto {
  id: string;
  amount: Paise;
  reason: string | null;
  status: RefundStatus;
  razorpayRefundId: string | null;
  createdAt: string;
}

export interface AdminShipmentDto {
  id: string;
  status: ShipmentStatus;
  courier: string | null;
  awb: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  estimatedDelivery: string | null;
  attempts: number;
  lastError: string | null;
  /** True while automatic booking will try again. */
  retrying: boolean;
  scans: TrackingScanDto[];
  createdAt: string;
}

export interface AdminOrderEventDto {
  type: string;
  message: string;
  at: string;
  /** Who did it, for dashboard actions. */
  by: string | null;
}

export interface AdminOrderDto {
  id: string;
  number: string;
  status: OrderStatus;
  createdAt: string;
  placedAt: string | null;
  email: string;
  phone: string;
  notes: string | null;
  customer: { id: string; email: string; name: string | null } | null;
  items: AdminOrderItemDto[];
  subtotal: Paise;
  discount: Paise;
  shippingFee: Paise;
  total: Paise;
  couponCode: string | null;
  shippingAddress: AddressFields;
  paymentMethod: PaymentMethod;
  payments: AdminPaymentDto[];
  refunds: AdminRefundDto[];
  /** Paid and not yet refunded. */
  refundable: Paise;
  shipments: AdminShipmentDto[];
  events: AdminOrderEventDto[];
  returns: AdminReturnDto[];
  /** Which actions make sense in the order's current state. */
  can: {
    book: boolean;
    markShipped: boolean;
    markDelivered: boolean;
    cancel: boolean;
    refund: boolean;
  };
}

export const orderCancelSchema = z.object({
  reason: z.string().trim().min(1, 'Say why').max(300),
  /** Refund what was paid (online payments). */
  refund: z.boolean().default(true),
  /** Put the items back in stock. */
  restock: z.boolean().default(true),
});
export type OrderCancelInput = z.input<typeof orderCancelSchema>;

export const orderRefundSchema = z.object({
  amount: paise.refine((v) => v > 0, 'Enter an amount'),
  reason: z.string().trim().min(1, 'Say why').max(300),
});
export type OrderRefundInput = z.input<typeof orderRefundSchema>;

/** For orders booked outside the dashboard (by hand in Shiprocket, or another courier). */
export const orderShipSchema = z.object({
  courier: z.string().trim().min(1, 'Enter the courier').max(100),
  awb: z.string().trim().min(1, 'Enter the tracking number').max(60),
  trackingUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null)
    .pipe(z.url('Enter a full link').nullable()),
});
export type OrderShipInput = z.input<typeof orderShipSchema>;

export const orderNoteSchema = z.object({
  message: z.string().trim().min(1, 'Write a note').max(1000),
});

// ─── Returns ────────────────────────────────────────────────────────────────

export type ReturnType = 'RETURN' | 'EXCHANGE';
export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'COMPLETED';

export const returnStatusLabel: Record<ReturnStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Declined',
  RECEIVED: 'Received',
  COMPLETED: 'Completed',
};

/** What a shopper sends to ask for a return or exchange. */
export const returnRequestSchema = z.object({
  type: z.enum(['RETURN', 'EXCHANGE']),
  reason: z.string().trim().min(3, 'Tell us what went wrong').max(1000),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1).max(40),
        quantity: z.coerce.number().int().min(1).max(10),
      }),
    )
    .min(1, 'Choose at least one item')
    .max(20),
});
export type ReturnRequestInput = z.input<typeof returnRequestSchema>;

/** A return as the shopper sees it on their order. */
export interface ReturnSummaryDto {
  id: string;
  type: ReturnType;
  status: ReturnStatus;
  createdAt: string;
  items: { name: string; title: string; quantity: number }[];
}

export interface AdminReturnDto {
  id: string;
  orderNumber: string;
  type: ReturnType;
  status: ReturnStatus;
  reason: string;
  email: string;
  name: string;
  items: {
    orderItemId: string;
    name: string;
    title: string;
    sku: string;
    image: string | null;
    unitPrice: Paise;
    quantity: number;
  }[];
  /** Value of the returned items: the usual refund for a return. */
  itemsValue: Paise;
  createdAt: string;
  updatedAt: string;
}

export const adminReturnListQuerySchema = z.object({
  status: z
    .enum(['OPEN', 'ALL', 'REQUESTED', 'APPROVED', 'RECEIVED', 'REJECTED', 'COMPLETED'])
    .default('OPEN'),
  page,
  limit,
});

export const returnUpdateSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'RECEIVED', 'COMPLETED']),
  /** Sent to the shopper with the update. */
  note: optionalText(500),
  /** On COMPLETED: put the returned items back in stock. */
  restock: z.boolean().default(true),
  /** On COMPLETED for a return: refund this much (0 for none). */
  refundAmount: paise.optional(),
});
export type ReturnUpdateInput = z.input<typeof returnUpdateSchema>;

// ─── Customers ──────────────────────────────────────────────────────────────

export const adminCustomerListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['recent', 'spent', 'orders']).default('recent'),
  page,
  limit,
});
export type AdminCustomerListQuery = z.input<typeof adminCustomerListQuerySchema>;

export interface AdminCustomerRowDto {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  orderCount: number;
  /** Paid orders, less refunds. */
  totalSpent: Paise;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface AdminCustomerDto extends AdminCustomerRowDto {
  addresses: (AddressFields & { id: string; isDefault: boolean })[];
  orders: AdminOrderRowDto[];
}

// ─── Coupons ────────────────────────────────────────────────────────────────

const optionalPaise = z
  .union([z.literal(''), z.null(), paise])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));
const optionalCount = z
  .union([z.literal(''), z.null(), z.coerce.number().int().min(1).max(1_000_000)])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));
const optionalDate = z
  .union([z.iso.datetime({ offset: true }), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,40}$/, 'Use 3 to 40 letters, numbers, dashes or underscores'),
    type: z.enum(['PERCENT', 'FLAT']),
    /** PERCENT: whole percent. FLAT: paise. */
    value: z.coerce.number().int().min(1),
    minOrderValue: optionalPaise,
    maxDiscount: optionalPaise,
    usageLimit: optionalCount,
    firstOrderOnly: z.boolean().default(false),
    startsAt: optionalDate,
    expiresAt: optionalDate,
    isActive: z.boolean().default(true),
  })
  .superRefine((c, ctx) => {
    if (c.type === 'PERCENT' && c.value > 100) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percent can be at most 100' });
    }
    if (c.startsAt && c.expiresAt && c.expiresAt <= c.startsAt) {
      ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Must be after the start' });
    }
  });
export type CouponInput = z.input<typeof couponInputSchema>;

export interface AdminCouponDto {
  id: string;
  code: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  minOrderValue: Paise | null;
  maxDiscount: Paise | null;
  usageLimit: number | null;
  usedCount: number;
  firstOrderOnly: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  /** e.g. "20% off, up to ₹500". */
  description: string;
  createdAt: string;
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export const adminStockQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** Only variants at or below the low-stock threshold. */
  low: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page,
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export interface AdminStockRowDto {
  variantId: string;
  productId: string;
  productName: string;
  title: string;
  sku: string;
  image: string | null;
  stock: number;
  /** Held by checkouts awaiting payment. */
  reserved: number;
  isActive: boolean;
}

export const stockReasonSchema = z.enum(['restock', 'damaged', 'correction', 'return', 'other']);
export type StockReason = z.infer<typeof stockReasonSchema>;

export const stockAdjustSchema = z.object({
  variantId: z.string().min(1).max(40),
  /** Units added (positive) or removed (negative). */
  change: z.coerce
    .number()
    .int()
    .min(-10_000)
    .max(10_000)
    .refine((v) => v !== 0, 'Enter how many units'),
  reason: stockReasonSchema,
  note: optionalText(200),
});
export type StockAdjustInput = z.input<typeof stockAdjustSchema>;

export const inventoryLogQuerySchema = z.object({
  variantId: z.string().max(40).optional(),
  page,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export interface InventoryLogDto {
  id: string;
  at: string;
  variantId: string;
  sku: string;
  productName: string;
  title: string;
  change: number;
  reason: string;
  by: string | null;
  orderNumber: string | null;
}

// ─── Reports ────────────────────────────────────────────────────────────────

export const reportQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => [7, 30, 90].includes(d), 'Choose 7, 30 or 90 days')
    .default(30),
});

export interface DashboardDto {
  today: { sales: Paise; orders: number };
  /** Paid and not yet handed to the courier. */
  toShip: number;
  lowStock: number;
  openReturns: number;
  /** Orders that need a person. */
  attention: { number: string; reason: string }[];
  days: number;
  /** One point per day (Indian time), oldest first. */
  revenue: { date: string; sales: Paise; orders: number }[];
  totals: { sales: Paise; orders: number; averageOrder: Paise };
  bestSellers: {
    productId: string;
    name: string;
    image: string | null;
    units: number;
    sales: Paise;
  }[];
}

// ─── Settings ───────────────────────────────────────────────────────────────

export const storeSettingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z
    .string()
    .trim()
    .max(200)
    .pipe(z.email('Enter a valid email').or(z.literal(''))),
  phone: z.string().trim().max(30),
  address: z.string().trim().max(500),
  gstNumber: z
    .string()
    .trim()
    .toUpperCase()
    .max(15)
    .refine((v) => !v || /^\d{2}[A-Z0-9]{13}$/.test(v), 'Enter a 15-character GSTIN'),
});
export type StoreSettings = z.output<typeof storeSettingsSchema>;

export const settingsSchema = z.object({
  store: storeSettingsSchema,
  shipping: z.object({ flatFee: paise, freeFrom: paise.nullable() }),
  cod: z.object({ enabled: z.boolean(), fee: paise }),
  returns: z.object({ windowDays: z.coerce.number().int().min(0).max(90) }),
  fulfilment: z.object({ autoShip: z.boolean() }),
  inventory: z.object({ lowStockThreshold: z.coerce.number().int().min(0).max(1000) }),
});
export type SettingsInput = z.input<typeof settingsSchema>;
export type Settings = z.output<typeof settingsSchema>;

export interface AdminSettingsDto extends Settings {
  /** Which services are set up. Keys live in the server environment, not the dashboard. */
  integrations: {
    payments: 'live' | 'test' | 'mock';
    shipping: 'shiprocket' | 'mock';
    email: 'resend' | 'log';
  };
}

/** What checkout needs to know before the shopper pays. */
export interface CheckoutOptionsDto {
  cod: { enabled: boolean; fee: Paise };
}

// ─── Staff ──────────────────────────────────────────────────────────────────

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  twoFactor: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const password = z.string().min(10, 'Use at least 10 characters').max(200);

export const staffCreateSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  name: z.string().trim().min(1, 'Enter a name').max(100),
  role: z.enum(['OWNER', 'STAFF']).default('STAFF'),
  password,
});
export type StaffCreateInput = z.input<typeof staffCreateSchema>;

export const staffUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['OWNER', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
  /** Turns off two-factor sign-in for someone who lost their phone. */
  resetTwoFactor: z.literal(true).optional(),
});
export type StaffUpdateInput = z.input<typeof staffUpdateSchema>;

export const passwordChangeSchema = z.object({
  current: z.string().min(1).max(200),
  next: password,
});

export const twoFactorCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const twoFactorEnableSchema = twoFactorCodeSchema.extend({
  secret: z.string().regex(/^[A-Z2-7]{32}$/),
});

export interface TwoFactorSetupDto {
  secret: string;
  /** otpauth:// link for authenticator apps. */
  uri: string;
}
