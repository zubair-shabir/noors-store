import {
  adminLoginSchema,
  adminProductListQuerySchema,
  bannerInputSchema,
  bannerUpdateSchema,
  bannerPlacementSchema,
  categoryInputSchema,
  collectionInputSchema,
  featuredInputSchema,
  productCreateSchema,
  productImagesInputSchema,
  productOptionsInputSchema,
  productUpdateSchema,
  reorderSchema,
  variantsUpdateSchema,
} from '@noors/shared';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  requireAdmin,
  requireRole,
  sameOriginOnly,
} from './auth.middleware.js';
import { AdminAuthService } from './auth.service.js';
import { AdminMerchService } from './merch.service.js';
import { AdminProductService } from './products.service.js';
import { MAX_UPLOAD_BYTES, sniffImageType, type ImageStore } from './uploads.service.js';

export interface AdminRouterOptions {
  prisma: PrismaClient;
  imageStore: ImageStore;
  allowedOrigins: string[];
  secureCookies: boolean;
  /** Sign-in attempts allowed per IP per 15 minutes. */
  loginRateLimit?: number;
}

const owner = requireRole('OWNER');
const placementQuery = z.object({ placement: bannerPlacementSchema.optional() });
const bannerOrderSchema = reorderSchema.extend({ placement: bannerPlacementSchema });

const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

/** Runs multer and turns its errors (file too large...) into 4xx responses. */
const singleFile: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return next(
        new HttpError(
          tooBig ? 413 : 400,
          tooBig ? 'Images can be up to 10 MB' : err.message,
          'invalid_upload',
        ),
      );
    }
    next(err);
  });
};

export function adminRouter(opts: AdminRouterOptions): Router {
  const auth = new AdminAuthService(opts.prisma);
  const products = new AdminProductService(opts.prisma);
  const merch = new AdminMerchService(opts.prisma);
  const router = Router();

  router.use(noStore, sameOriginOnly(opts.allowedOrigins));

  // ─── Auth ─────────────────────────────────────────────────────────────────

  router.post(
    '/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: opts.loginRateLimit ?? 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(
          new HttpError(
            429,
            'Too many sign-in attempts. Try again in a few minutes.',
            'rate_limited',
          ),
        ),
    }),
    async (req, res) => {
      const { email, password } = adminLoginSchema.parse(req.body);
      const result = await auth.login(email, password, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      if (!result)
        throw new HttpError(401, 'Email or password is incorrect', 'invalid_credentials');
      res
        .cookie(ADMIN_COOKIE, result.token, {
          ...adminCookieOptions(opts.secureCookies),
          expires: result.expiresAt,
        })
        .json({ admin: result.admin });
    },
  );

  router.post('/auth/logout', async (req, res) => {
    const token = req.cookies?.[ADMIN_COOKIE] as string | undefined;
    if (token) await auth.logout(token);
    res.clearCookie(ADMIN_COOKIE, adminCookieOptions(opts.secureCookies)).status(204).end();
  });

  router.use(requireAdmin(auth));

  router.get('/auth/me', (req, res) => {
    res.json({ admin: req.admin });
  });

  const adminId = (req: Express.Request) => req.admin!.id;
  const idOf = (req: Express.Request & { params: Record<string, unknown> }) =>
    String(req.params.id);

  // ─── Products ─────────────────────────────────────────────────────────────

  router.get('/products', async (req, res) => {
    res.json(await products.list(adminProductListQuerySchema.parse(req.query)));
  });

  router.post('/products', owner, async (req, res) => {
    res.status(201).json(await products.create(productCreateSchema.parse(req.body), adminId(req)));
  });

  router.get('/products/:id', async (req, res) => {
    res.json(await products.get(idOf(req)));
  });

  router.patch('/products/:id', owner, async (req, res) => {
    res.json(await products.update(idOf(req), productUpdateSchema.parse(req.body), adminId(req)));
  });

  router.delete('/products/:id', owner, async (req, res) => {
    await products.remove(idOf(req), adminId(req));
    res.status(204).end();
  });

  router.post('/products/:id/duplicate', owner, async (req, res) => {
    res.status(201).json(await products.duplicate(idOf(req), adminId(req)));
  });

  router.put('/products/:id/options', owner, async (req, res) => {
    res.json(
      await products.setOptions(idOf(req), productOptionsInputSchema.parse(req.body), adminId(req)),
    );
  });

  // Staff may send stock changes only; the service enforces that.
  router.patch('/products/:id/variants', async (req, res) => {
    res.json(
      await products.updateVariants(idOf(req), variantsUpdateSchema.parse(req.body), req.admin!),
    );
  });

  router.put('/products/:id/images', owner, async (req, res) => {
    res.json(
      await products.setImages(idOf(req), productImagesInputSchema.parse(req.body), adminId(req)),
    );
  });

  // ─── Categories ───────────────────────────────────────────────────────────

  router.get('/categories', async (_req, res) => {
    res.json({ items: await merch.listCategories() });
  });

  router.post('/categories', owner, async (req, res) => {
    res
      .status(201)
      .json(await merch.createCategory(categoryInputSchema.parse(req.body), adminId(req)));
  });

  router.put('/categories/order', owner, async (req, res) => {
    const { ids } = reorderSchema.parse(req.body);
    res.json({ items: await merch.reorderCategories(ids, adminId(req)) });
  });

  router.patch('/categories/:id', owner, async (req, res) => {
    res.json(
      await merch.updateCategory(
        idOf(req),
        categoryInputSchema.partial().parse(req.body),
        adminId(req),
      ),
    );
  });

  router.delete('/categories/:id', owner, async (req, res) => {
    await merch.deleteCategory(idOf(req), adminId(req));
    res.status(204).end();
  });

  // ─── Collections ──────────────────────────────────────────────────────────

  router.get('/collections', async (_req, res) => {
    res.json({ items: await merch.listCollections() });
  });

  router.post('/collections', owner, async (req, res) => {
    res
      .status(201)
      .json(await merch.createCollection(collectionInputSchema.parse(req.body), adminId(req)));
  });

  router.get('/collections/:id', async (req, res) => {
    res.json(await merch.getCollection(idOf(req)));
  });

  router.put('/collections/:id', owner, async (req, res) => {
    res.json(
      await merch.updateCollection(idOf(req), collectionInputSchema.parse(req.body), adminId(req)),
    );
  });

  router.delete('/collections/:id', owner, async (req, res) => {
    await merch.deleteCollection(idOf(req), adminId(req));
    res.status(204).end();
  });

  // ─── Featured ─────────────────────────────────────────────────────────────

  router.get('/featured', async (_req, res) => {
    res.json({ items: await merch.listFeatured() });
  });

  router.put('/featured', owner, async (req, res) => {
    const { productIds } = featuredInputSchema.parse(req.body);
    res.json({ items: await merch.setFeatured(productIds, adminId(req)) });
  });

  // ─── Banners ──────────────────────────────────────────────────────────────

  router.get('/banners', async (req, res) => {
    const { placement } = placementQuery.parse(req.query);
    res.json({ items: await merch.listBanners(placement) });
  });

  router.post('/banners', owner, async (req, res) => {
    res.status(201).json(await merch.createBanner(bannerInputSchema.parse(req.body), adminId(req)));
  });

  router.put('/banners/order', owner, async (req, res) => {
    const { placement, ids } = bannerOrderSchema.parse(req.body);
    res.json({ items: await merch.reorderBanners(placement, ids, adminId(req)) });
  });

  router.patch('/banners/:id', owner, async (req, res) => {
    res.json(await merch.updateBanner(idOf(req), bannerUpdateSchema.parse(req.body), adminId(req)));
  });

  router.delete('/banners/:id', owner, async (req, res) => {
    await merch.deleteBanner(idOf(req), adminId(req));
    res.status(204).end();
  });

  // ─── Uploads ──────────────────────────────────────────────────────────────

  router.post('/uploads', owner, singleFile, async (req, res) => {
    if (!req.file)
      throw new HttpError(400, 'Attach an image in the "file" field', 'invalid_upload');
    const type = sniffImageType(req.file.buffer);
    if (!type)
      throw new HttpError(415, 'Upload a JPEG, PNG, WebP, AVIF or GIF image', 'invalid_upload');
    res.status(201).json(await opts.imageStore.save(req.file.buffer, type));
  });

  return router;
}

/** Public: active banners for the storefront, e.g. GET /banners?placement=HERO. */
export function bannersRouter(prisma: PrismaClient): Router {
  const merch = new AdminMerchService(prisma);
  const router = Router();
  router.get('/', async (req, res) => {
    const { placement } = placementQuery.parse(req.query);
    res
      .set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
      .json({ items: await merch.listBanners(placement, true) });
  });
  return router;
}
