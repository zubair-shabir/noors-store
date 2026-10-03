import {
  addressInputSchema,
  cartItemInputSchema,
  cartItemUpdateSchema,
  checkoutInputSchema,
  couponApplySchema,
  orderAccessSchema,
  otpRequestSchema,
  otpVerifySchema,
  paymentVerifySchema,
  type AddressDto,
  type CustomerDto,
} from '@noors/shared';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';
import { MockGateway, type PaymentGateway } from '../../lib/payments.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { sameOriginOnly } from '../admin/auth.middleware.js';
import type { CartOwner, CartService } from './cart.service.js';
import type { CustomerAuthService } from './customer-auth.service.js';
import type { OrderService } from './orders.service.js';

export const CART_COOKIE = 'noors_cart';
export const CUSTOMER_COOKIE = 'noors_customer';
const GUEST_CART_TTL_MS = 60 * 24 * 60 * 60 * 1000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: CustomerDto | null;
    }
  }
}

export interface StoreRouterOptions {
  prisma: PrismaClient;
  carts: CartService;
  auth: CustomerAuthService;
  orders: OrderService;
  gateway: PaymentGateway;
  allowedOrigins: string[];
  secureCookies: boolean;
  /** Requests per IP per 15 minutes for sign-in codes and for checkout. */
  rateLimits?: { otp?: number; checkout?: number };
}

const limiter = (limit: number, message: string) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, message, 'rate_limited')),
  });

const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

const idParam = z.object({ id: z.string().min(1).max(40) });
const numberParam = z.object({ number: z.string().min(1).max(20) });
const orderQuery = z.object({ key: z.string().min(1).max(100) });

/** Public shop routes: cart, customer sign-in and account, checkout and order pages. */
export function storeRouter(opts: StoreRouterOptions): Router {
  const { carts, auth, orders, prisma } = opts;
  const router = Router();
  const cookieBase: CookieOptions = {
    httpOnly: true,
    secure: opts.secureCookies,
    sameSite: 'lax',
    path: '/',
  };

  router.use(noStore, sameOriginOnly(opts.allowedOrigins));

  // Who is asking: a signed-in customer (cookie) and/or a guest cart (cookie).
  router.use(async (req, _res, next) => {
    const token = req.cookies?.[CUSTOMER_COOKIE] as string | undefined;
    req.customer = token ? await auth.authenticate(token) : null;
    next();
  });

  const ownerOf = (req: Request): CartOwner =>
    req.customer
      ? { customerId: req.customer.id }
      : { guestToken: req.cookies?.[CART_COOKIE] as string | undefined };

  const sendCart = async (req: Request, res: Response, newGuestToken?: string) => {
    if (newGuestToken) {
      res.cookie(CART_COOKIE, newGuestToken, {
        ...cookieBase,
        expires: new Date(Date.now() + GUEST_CART_TTL_MS),
      });
    }
    const owner = newGuestToken ? { guestToken: newGuestToken } : ownerOf(req);
    res.json(await carts.toDto(await carts.find(owner), req.customer?.id));
  };

  const requireCustomer: RequestHandler = (req, _res, next) => {
    if (!req.customer) throw new HttpError(401, 'Please sign in', 'unauthorized');
    next();
  };

  // ─── Cart ─────────────────────────────────────────────────────────────────

  router.get('/cart', (req, res) => sendCart(req, res));

  router.post('/cart/items', async (req, res) => {
    const { variantId, quantity } = cartItemInputSchema.parse(req.body);
    const { newGuestToken } = await carts.addItem(ownerOf(req), variantId, quantity);
    await sendCart(req, res, newGuestToken);
  });

  router.patch('/cart/items/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { quantity } = cartItemUpdateSchema.parse(req.body);
    await carts.setQuantity(ownerOf(req), id, quantity);
    await sendCart(req, res);
  });

  router.delete('/cart/items/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await carts.removeItem(ownerOf(req), id);
    await sendCart(req, res);
  });

  router.post('/cart/coupon', async (req, res) => {
    const { code } = couponApplySchema.parse(req.body);
    await carts.applyCoupon(ownerOf(req), code);
    await sendCart(req, res);
  });

  router.delete('/cart/coupon', async (req, res) => {
    await carts.removeCoupon(ownerOf(req));
    await sendCart(req, res);
  });

  // ─── Customer sign-in ─────────────────────────────────────────────────────

  router.post(
    '/auth/otp/request',
    limiter(opts.rateLimits?.otp ?? 10, 'Too many requests. Try again in a few minutes.'),
    async (req, res) => {
      const { email } = otpRequestSchema.parse(req.body);
      res.json(await auth.requestCode(email));
    },
  );

  router.post(
    '/auth/otp/verify',
    limiter((opts.rateLimits?.otp ?? 10) * 3, 'Too many tries. Try again in a few minutes.'),
    async (req, res) => {
      const { email, code } = otpVerifySchema.parse(req.body);
      const result = await auth.verifyCode(email, code);
      const guestToken = req.cookies?.[CART_COOKIE] as string | undefined;
      if (guestToken) {
        await carts.mergeGuestCart(guestToken, result.customer.id);
        res.clearCookie(CART_COOKIE, cookieBase);
      }
      res
        .cookie(CUSTOMER_COOKIE, result.token, { ...cookieBase, expires: result.expiresAt })
        .json({ customer: result.customer });
    },
  );

  router.post('/auth/logout', async (req, res) => {
    const token = req.cookies?.[CUSTOMER_COOKIE] as string | undefined;
    if (token) await auth.logout(token);
    res.clearCookie(CUSTOMER_COOKIE, cookieBase).status(204).end();
  });

  // ─── Account ──────────────────────────────────────────────────────────────

  router.get('/me', (req, res) => {
    res.json({ customer: req.customer ?? null });
  });

  router.get('/me/addresses', requireCustomer, async (req, res) => {
    const rows = await prisma.address.findMany({
      where: { customerId: req.customer!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ items: rows.map(toAddress) });
  });

  router.post('/me/addresses', requireCustomer, async (req, res) => {
    const { isDefault, ...fields } = addressInputSchema.parse(req.body);
    const customerId = req.customer!.id;
    const count = await prisma.address.count({ where: { customerId } });
    if (count >= 10) throw new HttpError(400, 'You can save up to 10 addresses', 'limit');
    const makeDefault = isDefault || count === 0;
    const row = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      return tx.address.create({ data: { customerId, ...fields, isDefault: makeDefault } });
    });
    res.status(201).json(toAddress(row));
  });

  router.put('/me/addresses/:id', requireCustomer, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { isDefault, ...fields } = addressInputSchema.parse(req.body);
    const customerId = req.customer!.id;
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, customerId } });
      if (!existing) throw new HttpError(404, 'Address not found', 'not_found');
      if (isDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      return tx.address.update({
        where: { id },
        data: { ...fields, isDefault: isDefault ?? existing.isDefault },
      });
    });
    res.json(toAddress(row));
  });

  router.delete('/me/addresses/:id', requireCustomer, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const customerId = req.customer!.id;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, customerId } });
      if (!existing) throw new HttpError(404, 'Address not found', 'not_found');
      await tx.address.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { customerId },
          orderBy: { createdAt: 'asc' },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    res.status(204).end();
  });

  router.get('/me/orders', requireCustomer, async (req, res) => {
    res.json({ items: await orders.listForCustomer(req.customer!) });
  });

  router.get('/me/orders/:number', requireCustomer, async (req, res) => {
    const { number } = numberParam.parse(req.params);
    res.json(await orders.customerOrder(req.customer!, number));
  });

  // ─── Checkout ─────────────────────────────────────────────────────────────

  router.post(
    '/checkout',
    limiter(opts.rateLimits?.checkout ?? 20, 'Too many checkout attempts. Try again shortly.'),
    async (req, res) => {
      const input = checkoutInputSchema.parse(req.body);
      const email = req.customer?.email ?? input.email;
      const result = await orders.checkout(ownerOf(req), req.customer ?? null, {
        ...input,
        email,
        saveAddress: Boolean(req.customer) && input.saveAddress,
      });
      res.status(201).json(result);
    },
  );

  router.post('/checkout/verify', async (req, res) => {
    res.json(await orders.verifyPayment(paymentVerifySchema.parse(req.body)));
  });

  router.post('/checkout/abandon', async (req, res) => {
    const { orderNumber, accessToken } = orderAccessSchema.parse(req.body);
    await orders.abandon(orderNumber, accessToken);
    res.status(204).end();
  });

  // Development stand-in for Razorpay Checkout: "pays" the order with a valid signature.
  if (opts.gateway instanceof MockGateway) {
    const mock = opts.gateway;
    router.post('/checkout/mock-pay', async (req, res) => {
      const { orderNumber, accessToken } = orderAccessSchema.parse(req.body);
      const order = await orders.byAccessToken(orderNumber, accessToken);
      const payment = await prisma.payment.findFirst({
        where: { orderId: order.id, razorpayOrderId: { not: null } },
        orderBy: { createdAt: 'desc' },
      });
      if (!payment?.razorpayOrderId) throw new HttpError(404, 'No payment to make', 'not_found');
      res.json(mock.pay(payment.razorpayOrderId));
    });
  }

  router.get('/orders/:number', async (req, res) => {
    const { number } = numberParam.parse(req.params);
    const { key } = orderQuery.parse(req.query);
    res.json(await orders.publicOrder(number, key));
  });

  return router;
}

function toAddress(a: {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}): AddressDto {
  return {
    id: a.id,
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state as AddressDto['state'],
    pincode: a.pincode,
    isDefault: a.isDefault,
  };
}
