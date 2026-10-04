import * as Sentry from '@sentry/node';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'error',
    /** Field-level problems, shaped like validation issues so forms can show them in place. */
    public readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'Not found', 'not_found'));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'validation_error', issues: err.issues } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrismaError(err);
    if (mapped) {
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
      return;
    }
  }
  if (err instanceof HttpError) {
    if (err.status >= 500) Sentry.captureException(err);
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.issues && { issues: err.issues }) },
    });
    return;
  }
  logger.error({ err }, 'Unhandled error');
  // A no-op unless SENTRY_DSN is set (see server.ts).
  Sentry.captureException(err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
};

/** Turns the database errors a client can cause (duplicates, bad references) into 4xx responses. */
function fromPrismaError(err: Prisma.PrismaClientKnownRequestError): HttpError | null {
  switch (err.code) {
    case 'P2002': {
      const target = (err.meta as { target?: unknown } | undefined)?.target;
      const fields = Array.isArray(target) ? target.join(', ') : 'value';
      return new HttpError(409, `That ${fields} is already in use`, 'conflict');
    }
    case 'P2003':
      return new HttpError(400, 'A referenced record does not exist', 'invalid_reference');
    case 'P2025':
      return new HttpError(404, 'Not found', 'not_found');
    default:
      return null;
  }
}
