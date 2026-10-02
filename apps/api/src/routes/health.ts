import { Router } from 'express';
import type { HealthResponse } from '@noors/shared';

export interface HealthDeps {
  pingDatabase: () => Promise<void>;
}

export function healthRouter({ pingDatabase }: HealthDeps): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    let database: HealthResponse['checks']['database'] = 'up';
    try {
      await pingDatabase();
    } catch {
      database = 'down';
    }
    const body: HealthResponse = {
      status: database === 'up' ? 'ok' : 'degraded',
      uptime: process.uptime(),
      checks: { database },
    };
    res.status(database === 'up' ? 200 : 503).json(body);
  });

  return router;
}
