import type { AdminMeDto, AdminRole } from '@noors/shared';
import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from '../../lib/errors.js';
import type { AdminAuthService } from './auth.service.js';

export const ADMIN_COOKIE = 'noors_admin';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminMeDto;
    }
  }
}

export const adminCookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  // The dashboard calls the API through the web app's own origin, so Lax is enough and
  // keeps the cookie off cross-site POSTs.
  sameSite: 'lax',
  path: '/',
});

/** Loads the signed-in admin from the session cookie; 401 when there is none. */
export function requireAdmin(auth: AdminAuthService): RequestHandler {
  return async (req, _res, next) => {
    const token = req.cookies?.[ADMIN_COOKIE] as string | undefined;
    const admin = token ? await auth.authenticate(token) : null;
    if (!admin) throw new HttpError(401, 'Please sign in', 'unauthorized');
    req.admin = admin;
    next();
  };
}

/** Only lets the given roles through. Must run after requireAdmin. */
export function requireRole(...roles: AdminRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      throw new HttpError(403, 'Your account cannot do this', 'forbidden');
    }
    next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rejects state-changing requests sent from another site. Browsers always send Origin on
 * cross-site POST/PATCH/PUT/DELETE, so a foreign Origin means a forged request.
 */
export function sameOriginOnly(allowedOrigins: string[]): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    const own = `${req.protocol}://${req.get('host')}`;
    if (origin === own || allowedOrigins.includes(origin)) return next();
    throw new HttpError(403, 'Cross-site request blocked', 'forbidden');
  };
}
