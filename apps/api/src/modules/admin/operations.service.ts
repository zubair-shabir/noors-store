import {
  adminCustomerListQuerySchema,
  adminStockQuerySchema,
  couponInputSchema,
  inventoryLogQuerySchema,
  reportQuerySchema,
  staffCreateSchema,
  staffUpdateSchema,
  stockAdjustSchema,
  type AdminCouponDto,
  type AdminCustomerDto,
  type AdminCustomerRowDto,
  type AdminSettingsDto,
  type AdminStockRowDto,
  type AdminUserDto,
  type CouponInput,
  type DashboardDto,
  type InventoryLogDto,
  type Paginated,
  type SettingsInput,
  type StaffCreateInput,
  type StaffUpdateInput,
  type StockAdjustInput,
} from '@noors/shared';
import { Prisma, type Coupon } from '../../generated/prisma/client.js';
import { HttpError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { loadSetting, loadSettings, saveSettings } from '../settings/settings.service.js';
import { describeCoupon } from '../store/pricing.js';
import { audit } from './audit.js';
import { orderRowInclude, toOrderRow } from './orders.service.js';

const pageOf = <T>(items: T[], page: number, limit: number, total: number): Paginated<T> => ({
  items,
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

/** Orders that count as sales: paid (or confirmed for cash on delivery) and not cancelled. */
const SOLD = Prisma.sql`o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')`;

// ─── Customers ──────────────────────────────────────────────────────────────

export class CustomerAdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: unknown): Promise<Paginated<AdminCustomerRowDto>> {
    const { q, sort, page, limit } = adminCustomerListQuerySchema.parse(input);
    const search = q
      ? Prisma.sql`WHERE c.email ILIKE ${`%${q}%`} OR c.name ILIKE ${`%${q}%`} OR c.phone LIKE ${`%${q.replace(/\D/g, '') || q}%`}`
      : Prisma.empty;
    const order =
      sort === 'spent'
        ? Prisma.sql`total_spent DESC, c.created_at DESC`
        : sort === 'orders'
          ? Prisma.sql`order_count DESC, c.created_at DESC`
          : Prisma.sql`COALESCE(max(o.created_at), c.created_at) DESC`;
    const [{ n }] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM customers c ${search}`;
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        email: string;
        name: string | null;
        phone: string | null;
        created_at: Date;
        order_count: bigint;
        total_spent: bigint;
        last_order_at: Date | null;
      }[]
    >`
      SELECT c.id, c.email, c.name, c.phone, c.created_at,
             count(o.id) AS order_count,
             COALESCE(sum(o.total - COALESCE(r.refunded, 0)), 0) AS total_spent,
             max(o.created_at) AS last_order_at
      FROM customers c
      LEFT JOIN orders o ON (o.customer_id = c.id OR o.email = c.email) AND ${SOLD}
      LEFT JOIN (
        SELECT order_id, sum(amount) AS refunded FROM refunds WHERE status <> 'FAILED' GROUP BY order_id
      ) r ON r.order_id = o.id
      ${search}
      GROUP BY c.id
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
    return pageOf(
      rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        phone: r.phone,
        orderCount: Number(r.order_count),
        totalSpent: Number(r.total_spent),
        lastOrderAt: r.last_order_at?.toISOString() ?? null,
        createdAt: r.created_at.toISOString(),
      })),
      page,
      limit,
      Number(n),
    );
  }

  async get(id: string): Promise<AdminCustomerDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } },
    });
    if (!customer) throw new HttpError(404, 'Customer not found', 'not_found');
    const orders = await this.prisma.order.findMany({
      where: { OR: [{ customerId: id }, { email: customer.email }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { ...orderRowInclude, refunds: { select: { status: true, amount: true } } },
    });
    const sold = orders.filter((o) => o.status !== 'PENDING_PAYMENT' && o.status !== 'CANCELLED');
    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      createdAt: customer.createdAt.toISOString(),
      orderCount: sold.length,
      totalSpent: sold.reduce(
        (sum, o) =>
          sum +
          o.total -
          o.refunds.filter((r) => r.status !== 'FAILED').reduce((s, r) => s + r.amount, 0),
        0,
      ),
      lastOrderAt: sold[0]?.createdAt.toISOString() ?? null,
      addresses: customer.addresses.map((a) => ({
        id: a.id,
        name: a.name,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        state: a.state as AdminCustomerDto['addresses'][number]['state'],
        pincode: a.pincode,
        isDefault: a.isDefault,
      })),
      orders: orders.map(toOrderRow),
    };
  }
}

// ─── Coupons ────────────────────────────────────────────────────────────────

const toCoupon = (c: Coupon): AdminCouponDto => ({
  id: c.id,
  code: c.code,
  type: c.type,
  value: c.value,
  minOrderValue: c.minOrderValue,
  maxDiscount: c.maxDiscount,
  usageLimit: c.usageLimit,
  usedCount: c.usedCount,
  firstOrderOnly: c.firstOrderOnly,
  startsAt: c.startsAt?.toISOString() ?? null,
  expiresAt: c.expiresAt?.toISOString() ?? null,
  isActive: c.isActive,
  description: describeCoupon(c),
  createdAt: c.createdAt.toISOString(),
});

export class CouponAdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<AdminCouponDto[]> {
    const rows = await this.prisma.coupon.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toCoupon);
  }

  async create(input: CouponInput, adminId: string): Promise<AdminCouponDto> {
    const data = this.parse(input);
    const coupon = await this.prisma.coupon.create({ data });
    await audit(this.prisma, adminId, 'create', 'coupon', coupon.id, { code: coupon.code });
    return toCoupon(coupon);
  }

  async update(id: string, input: CouponInput, adminId: string): Promise<AdminCouponDto> {
    const data = this.parse(input);
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Coupon not found', 'not_found');
    if (existing.usedCount > 0 && data.code !== existing.code) {
      throw new HttpError(409, 'A code that has been used cannot be renamed', 'conflict');
    }
    const coupon = await this.prisma.coupon.update({ where: { id }, data });
    await audit(this.prisma, adminId, 'update', 'coupon', id, { code: coupon.code });
    return toCoupon(coupon);
  }

  /** Deletes an unused coupon; a used one is switched off instead, to keep order history. */
  async remove(id: string, adminId: string): Promise<{ deleted: boolean }> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new HttpError(404, 'Coupon not found', 'not_found');
    const used =
      coupon.usedCount > 0 || (await this.prisma.order.count({ where: { couponId: id } })) > 0;
    if (used) await this.prisma.coupon.update({ where: { id }, data: { isActive: false } });
    else await this.prisma.coupon.delete({ where: { id } });
    await audit(this.prisma, adminId, used ? 'deactivate' : 'delete', 'coupon', id, {
      code: coupon.code,
    });
    return { deleted: !used };
  }

  private parse(input: CouponInput) {
    const c = couponInputSchema.parse(input);
    return {
      ...c,
      maxDiscount: c.type === 'PERCENT' ? c.maxDiscount : null,
      startsAt: c.startsAt ? new Date(c.startsAt) : null,
      expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
    };
  }
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export class InventoryAdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: unknown): Promise<Paginated<AdminStockRowDto> & { threshold: number }> {
    const { q, low, page, limit } = adminStockQuerySchema.parse(input);
    const { lowStockThreshold: threshold } = await loadSetting(this.prisma, 'inventory');
    const where = Prisma.sql`
      WHERE p.status <> 'ARCHIVED'
      ${low ? Prisma.sql`AND v.is_active AND v.stock - v.reserved <= ${threshold}` : Prisma.empty}
      ${q ? Prisma.sql`AND (p.name ILIKE ${`%${q}%`} OR v.sku ILIKE ${`%${q}%`})` : Prisma.empty}`;
    const [{ n }] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM variants v JOIN products p ON p.id = v.product_id ${where}`;
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id ${where}
      ORDER BY ${low ? Prisma.sql`v.stock - v.reserved ASC,` : Prisma.empty} p.name ASC, v.position ASC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
    const variants = await this.prisma.variant.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: {
        product: {
          select: { id: true, name: true, images: { orderBy: { position: 'asc' }, take: 1 } },
        },
        optionValues: {
          include: { optionValue: { include: { option: { select: { position: true } } } } },
        },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    const items = ids.flatMap(({ id }) => {
      const v = byId.get(id);
      if (!v) return [];
      const title =
        [...v.optionValues]
          .sort((a, b) => a.optionValue.option.position - b.optionValue.option.position)
          .map((o) => o.optionValue.value)
          .join(' / ') || 'One size';
      return [
        {
          variantId: v.id,
          productId: v.product.id,
          productName: v.product.name,
          title,
          sku: v.sku,
          image: v.product.images[0]?.url ?? null,
          stock: v.stock,
          reserved: v.reserved,
          isActive: v.isActive,
        },
      ];
    });
    return { ...pageOf(items, page, limit, Number(n)), threshold };
  }

  /** Adds or removes units, never below what open checkouts hold. Logged with who did it. */
  async adjust(input: StockAdjustInput, adminId: string): Promise<{ stock: number }> {
    const { variantId, change, reason, note } = stockAdjustSchema.parse(input);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<{ stock: number }[]>`
        UPDATE variants SET stock = stock + ${change}, updated_at = now()
        WHERE id = ${variantId} AND stock + ${change} >= reserved
        RETURNING stock`;
      if (!updated.length) {
        const exists = await tx.variant.findUnique({ where: { id: variantId } });
        if (!exists) throw new HttpError(404, 'Variant not found', 'not_found');
        throw new HttpError(
          409,
          `Only ${exists.stock - exists.reserved} can be removed; ${exists.reserved} are held by open checkouts`,
          'invalid_stock',
        );
      }
      await tx.inventoryLog.create({
        data: {
          variantId,
          change,
          reason: note ? `${reason}: ${note}` : reason,
          adminUserId: adminId,
        },
      });
      return { stock: updated[0]!.stock };
    });
  }

  async log(input: unknown): Promise<Paginated<InventoryLogDto>> {
    const { variantId, page, limit } = inventoryLogQuerySchema.parse(input);
    const where = variantId ? { variantId } : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.inventoryLog.count({ where }),
      this.prisma.inventoryLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          adminUser: { select: { name: true } },
          order: { select: { number: true } },
          variant: {
            select: {
              sku: true,
              product: { select: { name: true } },
              optionValues: { select: { optionValue: { select: { value: true } } } },
            },
          },
        },
      }),
    ]);
    return pageOf(
      rows.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        variantId: r.variantId,
        sku: r.variant.sku,
        productName: r.variant.product.name,
        title: r.variant.optionValues.map((o) => o.optionValue.value).join(' / ') || 'One size',
        change: r.change,
        reason: r.reason,
        by: r.adminUser?.name ?? null,
        orderNumber: r.order?.number ?? null,
      })),
      page,
      limit,
      total,
    );
  }
}

// ─── Reports ────────────────────────────────────────────────────────────────

/** "2026-10-03" for a moment, in Indian time. */
const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

export class ReportService {
  constructor(private readonly prisma: PrismaClient) {}

  async dashboard(input: unknown, now = new Date()): Promise<DashboardDto> {
    const { days } = reportQuerySchema.parse(input);
    const today = istDate(now);
    const start = new Date(new Date(`${today}T00:00:00+05:30`).getTime() - (days - 1) * 86_400_000);
    const { lowStockThreshold } = await loadSetting(this.prisma, 'inventory');

    const daily = await this.prisma.$queryRaw<{ day: string; sales: bigint; orders: bigint }[]>`
      SELECT to_char(o.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
             sum(o.total) AS sales, count(*) AS orders
      FROM orders o
      WHERE ${SOLD} AND o.created_at >= ${start}
      GROUP BY 1`;
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const revenue = Array.from({ length: days }, (_, i) => {
      const date = istDate(new Date(start.getTime() + i * 86_400_000 + 3_600_000));
      const d = byDay.get(date);
      return { date, sales: Number(d?.sales ?? 0), orders: Number(d?.orders ?? 0) };
    });
    const totalSales = revenue.reduce((s, d) => s + d.sales, 0);
    const totalOrders = revenue.reduce((s, d) => s + d.orders, 0);

    const best = await this.prisma.$queryRaw<
      { product_id: string; name: string; image: string | null; units: bigint; sales: bigint }[]
    >`
      SELECT p.id AS product_id, p.name,
             (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position LIMIT 1) AS image,
             sum(oi.quantity) AS units, sum(oi.quantity * oi.unit_price) AS sales
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN variants v ON v.id = oi.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE ${SOLD} AND o.created_at >= ${start}
      GROUP BY p.id
      ORDER BY units DESC, sales DESC
      LIMIT 5`;

    const [{ n: lowStock }] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM variants v JOIN products p ON p.id = v.product_id
      WHERE p.status = 'ACTIVE' AND v.is_active AND v.stock - v.reserved <= ${lowStockThreshold}`;
    const [toShip, openReturns, attentionRows] = await Promise.all([
      this.prisma.order.count({ where: { status: { in: ['PAID', 'READY_TO_SHIP'] } } }),
      this.prisma.returnRequest.count({
        where: { status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } },
      }),
      this.prisma.order.findMany({
        where: {
          status: { not: 'PENDING_PAYMENT' },
          createdAt: { gte: new Date(now.getTime() - 60 * 86_400_000) },
          OR: [
            {
              events: {
                some: {
                  type: {
                    in: ['payment_needs_refund', 'payment_mismatch', 'shipment_failed', 'rto'],
                  },
                },
              },
            },
            { refunds: { some: { status: 'FAILED' } } },
            { returns: { some: { status: 'REQUESTED' } } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: orderRowInclude,
      }),
    ]);
    const todayPoint = revenue.at(-1)!;
    return {
      today: { sales: todayPoint.sales, orders: todayPoint.orders },
      toShip,
      lowStock: Number(lowStock),
      openReturns,
      attention: attentionRows.flatMap((o) => {
        const reason = toOrderRow(o).attention;
        return reason ? [{ number: o.number, reason }] : [];
      }),
      days,
      revenue,
      totals: {
        sales: totalSales,
        orders: totalOrders,
        averageOrder: totalOrders ? Math.round(totalSales / totalOrders) : 0,
      },
      bestSellers: best.map((b) => ({
        productId: b.product_id,
        name: b.name,
        image: b.image,
        units: Number(b.units),
        sales: Number(b.sales),
      })),
    };
  }
}

// ─── Settings ───────────────────────────────────────────────────────────────

export class SettingsAdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly integrations: AdminSettingsDto['integrations'],
  ) {}

  async get(): Promise<AdminSettingsDto> {
    return { ...(await loadSettings(this.prisma)), integrations: this.integrations };
  }

  async save(input: SettingsInput, adminId: string): Promise<AdminSettingsDto> {
    const settings = await this.prisma.$transaction(async (tx) => {
      const saved = await saveSettings(tx, input);
      await audit(
        tx,
        adminId,
        'update',
        'settings',
        'all',
        saved as unknown as Prisma.InputJsonValue,
      );
      return saved;
    });
    return { ...settings, integrations: this.integrations };
  }
}

// ─── Staff ──────────────────────────────────────────────────────────────────

const toUser = (u: {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'STAFF';
  isActive: boolean;
  totpSecret: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}): AdminUserDto => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  isActive: u.isActive,
  twoFactor: Boolean(u.totpSecret),
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

export class StaffService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<AdminUserDto[]> {
    const users = await this.prisma.adminUser.findMany({
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    });
    return users.map(toUser);
  }

  async create(input: StaffCreateInput, adminId: string): Promise<AdminUserDto> {
    const { password, ...data } = staffCreateSchema.parse(input);
    const user = await this.prisma.adminUser.create({
      data: { ...data, passwordHash: await hashPassword(password) },
    });
    await audit(this.prisma, adminId, 'create', 'admin_user', user.id, {
      email: user.email,
      role: user.role,
    });
    return toUser(user);
  }

  /** Changes someone's details. The last active owner can't be demoted or switched off. */
  async update(id: string, input: StaffUpdateInput, adminId: string): Promise<AdminUserDto> {
    const { password, resetTwoFactor, ...data } = staffUpdateSchema.parse(input);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.adminUser.findUnique({ where: { id } });
      if (!user) throw new HttpError(404, 'Account not found', 'not_found');
      const losingOwner =
        user.role === 'OWNER' &&
        user.isActive &&
        ((data.role && data.role !== 'OWNER') || data.isActive === false);
      if (losingOwner) {
        const owners = await tx.adminUser.count({ where: { role: 'OWNER', isActive: true } });
        if (owners <= 1) {
          throw new HttpError(409, 'The store needs at least one active owner', 'last_owner');
        }
      }
      if (id === adminId && data.isActive === false) {
        throw new HttpError(409, 'You cannot switch off your own account', 'conflict');
      }
      const updated = await tx.adminUser.update({
        where: { id },
        data: {
          ...data,
          ...(password && { passwordHash: await hashPassword(password) }),
          ...(resetTwoFactor && { totpSecret: null }),
        },
      });
      // A new password, a lost role or a switched-off account signs them out everywhere.
      if (password || data.isActive === false || (data.role && data.role !== user.role)) {
        await tx.adminSession.deleteMany({ where: { adminUserId: id } });
      }
      await audit(tx, adminId, 'update', 'admin_user', id, {
        ...data,
        password: password ? 'changed' : undefined,
        resetTwoFactor,
      });
      return toUser(updated);
    });
  }
}
