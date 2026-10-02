import { Router, type Response } from 'express';
import { productListQuerySchema } from '@noors/shared';
import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';
import type { CatalogService } from './catalog.service.js';

const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });

// Catalogue reads are public and change only when the admin saves, so a short shared cache is safe.
const cachePublic = (res: Response) =>
  res.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');

export function catalogRouter(catalog: CatalogService): Router {
  const router = Router();

  router.get('/categories', async (_req, res) => {
    cachePublic(res).json({ items: await catalog.listCategories() });
  });

  router.get('/categories/:slug', async (req, res) => {
    const category = await catalog.getCategory(req.params.slug);
    if (!category) throw new HttpError(404, 'Category not found', 'not_found');
    cachePublic(res).json(category);
  });

  router.get('/products', async (req, res) => {
    const query = productListQuerySchema.parse(req.query);
    cachePublic(res).json(await catalog.listProducts(query));
  });

  router.get('/products/:slug', async (req, res) => {
    const product = await catalog.getProduct(req.params.slug);
    if (!product) throw new HttpError(404, 'Product not found', 'not_found');
    cachePublic(res).json(product);
  });

  router.get('/featured', async (_req, res) => {
    cachePublic(res).json({ items: await catalog.listFeatured() });
  });

  router.get('/search', async (req, res) => {
    const { q } = searchQuerySchema.parse(req.query);
    cachePublic(res).json({ items: await catalog.search(q) });
  });

  router.get('/collections/:slug', async (req, res) => {
    const collection = await catalog.getCollection(req.params.slug);
    if (!collection) throw new HttpError(404, 'Collection not found', 'not_found');
    cachePublic(res).json(collection);
  });

  return router;
}
