import { z } from 'zod';
import type { ProductSummaryDto } from './catalog.js';

/* Shopper wishlist: products a signed-in customer has saved for later. */

/** Most products one customer can save. */
export const MAX_WISHLIST_ITEMS = 200;

export const wishlistParamsSchema = z.object({ productId: z.string().min(1).max(40) });

export interface WishlistItemDto {
  /** The same card data the catalogue returns for product grids. */
  product: ProductSummaryDto;
  /** ISO timestamp of when the shopper saved it. */
  savedAt: string;
}

/** GET /me/wishlist, newest first. Only products that are on sale (ACTIVE) are listed. */
export interface WishlistDto {
  items: WishlistItemDto[];
}

/** GET /me/wishlist/ids and the answer to PUT or DELETE /me/wishlist/:productId. */
export interface WishlistIdsDto {
  productIds: string[];
}
