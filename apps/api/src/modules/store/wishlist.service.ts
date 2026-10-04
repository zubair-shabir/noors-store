import { MAX_WISHLIST_ITEMS, type WishlistIdsDto, type WishlistItemDto } from '@noors/shared';
import { HttpError } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { productInclude, toProductSummary } from '../catalog/catalog.mapper.js';

/** Only products on sale show up in a wishlist; drafts and archived ones drop out. */
const onSale = { product: { status: 'ACTIVE' } } as const;

/** A signed-in shopper's saved products. Saves are keyed by (customer, product), so adds are idempotent. */
export class WishlistService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Saved products as product cards, newest save first. */
  async list(customerId: string): Promise<WishlistItemDto[]> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { customerId, ...onSale },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: productInclude } },
    });
    return rows.map((row) => ({
      product: toProductSummary(row.product),
      savedAt: row.createdAt.toISOString(),
    }));
  }

  /** Ids of the saved products that are on sale, newest first: enough to fill in the hearts. */
  async ids(customerId: string): Promise<WishlistIdsDto> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { customerId, ...onSale },
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
    });
    return { productIds: rows.map((r) => r.productId) };
  }

  /** Saves a product. Saving one that is already saved changes nothing (and keeps its date). */
  async add(customerId: string, productId: string): Promise<WishlistIdsDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!product) throw new HttpError(404, 'Product not found', 'not_found');
    const key = { customerId_productId: { customerId, productId } };
    const existing = await this.prisma.wishlistItem.findUnique({ where: key });
    if (!existing) {
      const count = await this.prisma.wishlistItem.count({ where: { customerId } });
      if (count >= MAX_WISHLIST_ITEMS) {
        throw new HttpError(
          400,
          `You can save up to ${MAX_WISHLIST_ITEMS} pieces. Remove some to save more.`,
          'limit',
        );
      }
      // upsert, not create: two quick taps must not fail on the primary key.
      await this.prisma.wishlistItem.upsert({
        where: key,
        create: { customerId, productId },
        update: {},
      });
    }
    return this.ids(customerId);
  }

  /** Removes a saved product. Removing one that is not saved is not an error. */
  async remove(customerId: string, productId: string): Promise<WishlistIdsDto> {
    await this.prisma.wishlistItem.deleteMany({ where: { customerId, productId } });
    return this.ids(customerId);
  }
}
