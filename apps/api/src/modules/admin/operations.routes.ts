import {
  adminOrderListQuerySchema,
  couponInputSchema,
  orderCancelSchema,
  orderNoteSchema,
  orderRefundSchema,
  orderShipSchema,
  passwordChangeSchema,
  returnUpdateSchema,
  settingsSchema,
  staffCreateSchema,
  staffUpdateSchema,
  twoFactorCodeSchema,
  twoFactorEnableSchema,
  type ReturnUpdateInput,
  type StockAdjustInput,
} from '@noors/shared';
import type { Request, Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';
import type { ReturnService } from '../store/returns.service.js';
import { ADMIN_COOKIE, requireRole } from './auth.middleware.js';
import type { AdminAuthService } from './auth.service.js';
import type {
  CouponAdminService,
  CustomerAdminService,
  InventoryAdminService,
  ReportService,
  SettingsAdminService,
  StaffService,
} from './operations.service.js';
import type { AdminOrderService } from './orders.service.js';

export interface OperationsServices {
  auth: AdminAuthService;
  adminOrders: AdminOrderService;
  returns: ReturnService;
  customers: CustomerAdminService;
  coupons: CouponAdminService;
  inventory: InventoryAdminService;
  reports: ReportService;
  settings: SettingsAdminService;
  staff: StaffService;
}

const owner = requireRole('OWNER');
const numberParam = z.object({ number: z.string().min(1).max(20) });
const idParam = z.object({ id: z.string().min(1).max(40) });

/** Orders, returns, customers, coupons, stock, reports, settings and staff. After requireAdmin. */
export function mountOperations(router: Router, s: OperationsServices) {
  const me = (req: Request) => req.admin!.id;
  const number = (req: Request) => numberParam.parse(req.params).number;
  const id = (req: Request) => idParam.parse(req.params).id;

  // ─── Your account ─────────────────────────────────────────────────────────

  router.post('/auth/password', async (req, res) => {
    const { current, next } = passwordChangeSchema.parse(req.body);
    await s.auth.changePassword(me(req), current, next, req.cookies?.[ADMIN_COOKIE]);
    res.status(204).end();
  });
  router.post('/auth/2fa/setup', async (req, res) => {
    res.json(await s.auth.twoFactorSetup(me(req)));
  });
  router.post('/auth/2fa/enable', async (req, res) => {
    const { secret, code } = twoFactorEnableSchema.parse(req.body);
    res.json({ admin: await s.auth.enableTwoFactor(me(req), secret, code) });
  });
  router.post('/auth/2fa/disable', async (req, res) => {
    const { code } = twoFactorCodeSchema.parse(req.body);
    res.json({ admin: await s.auth.disableTwoFactor(me(req), code) });
  });

  // ─── Orders ───────────────────────────────────────────────────────────────

  router.get('/orders', async (req, res) => {
    res.json(await s.adminOrders.list(adminOrderListQuerySchema.parse(req.query)));
  });
  router.get('/orders/:number', async (req, res) => {
    res.json(await s.adminOrders.get(number(req)));
  });
  router.post('/orders/:number/notes', async (req, res) => {
    const { message } = orderNoteSchema.parse(req.body);
    res.json(await s.adminOrders.addNote(number(req), message, me(req)));
  });
  router.post('/orders/:number/book', async (req, res) => {
    res.json(await s.adminOrders.book(number(req), me(req)));
  });
  router.post('/orders/:number/ship', async (req, res) => {
    res.json(
      await s.adminOrders.markShipped(number(req), orderShipSchema.parse(req.body), me(req)),
    );
  });
  router.post('/orders/:number/deliver', async (req, res) => {
    res.json(await s.adminOrders.markDelivered(number(req), me(req)));
  });
  // Money moves: owners only.
  router.post('/orders/:number/cancel', owner, async (req, res) => {
    res.json(await s.adminOrders.cancel(number(req), orderCancelSchema.parse(req.body), me(req)));
  });
  router.post('/orders/:number/refund', owner, async (req, res) => {
    const { amount, reason } = orderRefundSchema.parse(req.body);
    res.json(await s.adminOrders.refund(number(req), amount, reason, me(req)));
  });

  // ─── Returns ──────────────────────────────────────────────────────────────

  router.get('/returns', async (req, res) => {
    res.json(await s.returns.list(req.query));
  });
  router.patch('/returns/:id', async (req, res) => {
    const input = returnUpdateSchema.parse(req.body);
    if (input.refundAmount && req.admin!.role !== 'OWNER') {
      throw new HttpError(403, 'Only an owner can refund', 'forbidden');
    }
    res.json(await s.returns.update(id(req), req.body as ReturnUpdateInput, me(req)));
  });

  // ─── Customers ────────────────────────────────────────────────────────────

  router.get('/customers', async (req, res) => {
    res.json(await s.customers.list(req.query));
  });
  router.get('/customers/:id', async (req, res) => {
    res.json(await s.customers.get(id(req)));
  });

  // ─── Coupons ──────────────────────────────────────────────────────────────

  router.get('/coupons', owner, async (_req, res) => {
    res.json({ items: await s.coupons.list() });
  });
  router.post('/coupons', owner, async (req, res) => {
    res.status(201).json(await s.coupons.create(couponInputSchema.parse(req.body), me(req)));
  });
  router.put('/coupons/:id', owner, async (req, res) => {
    res.json(await s.coupons.update(id(req), couponInputSchema.parse(req.body), me(req)));
  });
  router.delete('/coupons/:id', owner, async (req, res) => {
    res.json(await s.coupons.remove(id(req), me(req)));
  });

  // ─── Inventory ────────────────────────────────────────────────────────────

  router.get('/inventory', async (req, res) => {
    res.json(await s.inventory.list(req.query));
  });
  router.post('/inventory/adjust', async (req, res) => {
    res.json(await s.inventory.adjust(req.body as StockAdjustInput, me(req)));
  });
  router.get('/inventory/log', async (req, res) => {
    res.json(await s.inventory.log(req.query));
  });

  // ─── Reports, settings, staff (owners) ────────────────────────────────────

  router.get('/reports/dashboard', owner, async (req, res) => {
    res.json(await s.reports.dashboard(req.query));
  });
  router.get('/settings', owner, async (_req, res) => {
    res.json(await s.settings.get());
  });
  router.put('/settings', owner, async (req, res) => {
    res.json(await s.settings.save(settingsSchema.parse(req.body), me(req)));
  });
  router.get('/staff', owner, async (_req, res) => {
    res.json({ items: await s.staff.list() });
  });
  router.post('/staff', owner, async (req, res) => {
    res.status(201).json(await s.staff.create(staffCreateSchema.parse(req.body), me(req)));
  });
  router.patch('/staff/:id', owner, async (req, res) => {
    res.json(await s.staff.update(id(req), staffUpdateSchema.parse(req.body), me(req)));
  });
}
