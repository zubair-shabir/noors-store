import { wishlistParamsSchema, type WishlistDto } from '@noors/shared';
import { Router, type RequestHandler } from 'express';
import type { PrismaClient } from '../../lib/prisma.js';
import { WishlistService } from './wishlist.service.js';

export interface WishlistRoutesOptions {
  prisma: PrismaClient;
  /** The store router's guard: 401 unless a shopper is signed in. */
  requireCustomer: RequestHandler;
  /** Defaults to a service over `prisma`. */
  wishlist?: WishlistService;
}

/**
 * /me/wishlist routes. Mounted inside the store router, which has already loaded the shopper
 * from their session cookie (req.customer) and applied no-store and the same-origin check.
 */
export function wishlistRoutes(opts: WishlistRoutesOptions): Router {
  const wishlist = opts.wishlist ?? new WishlistService(opts.prisma);
  const router = Router();
  router.use('/me/wishlist', opts.requireCustomer);

  router.get('/me/wishlist', async (req, res) => {
    res.json({ items: await wishlist.list(req.customer!.id) } satisfies WishlistDto);
  });

  router.get('/me/wishlist/ids', async (req, res) => {
    res.json(await wishlist.ids(req.customer!.id));
  });

  router.put('/me/wishlist/:productId', async (req, res) => {
    const { productId } = wishlistParamsSchema.parse(req.params);
    res.json(await wishlist.add(req.customer!.id, productId));
  });

  router.delete('/me/wishlist/:productId', async (req, res) => {
    const { productId } = wishlistParamsSchema.parse(req.params);
    res.json(await wishlist.remove(req.customer!.id, productId));
  });

  return router;
}
