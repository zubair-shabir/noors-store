import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { PrismaClient } from './lib/prisma.js';

const corsOrigins = ['http://localhost:3000'];

// Only $queryRaw is touched by these routes, so a stub stands in for the database.
const fakePrisma = (queryRaw: () => Promise<unknown>) =>
  ({ $queryRaw: queryRaw }) as unknown as PrismaClient;

describe('GET /api/v1/health', () => {
  it('reports ok when the database answers', async () => {
    const app = createApp({ corsOrigins, prisma: fakePrisma(async () => [1]) });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
  });

  it('reports degraded when the database is down', async () => {
    const app = createApp({
      corsOrigins,
      prisma: fakePrisma(async () => {
        throw new Error('connection refused');
      }),
    });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', checks: { database: 'down' } });
  });
});

describe('unknown routes', () => {
  it('return a JSON 404', async () => {
    const app = createApp({ corsOrigins, prisma: fakePrisma(async () => [1]) });
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});
