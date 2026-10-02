import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const corsOrigins = ['http://localhost:3000'];

describe('GET /api/v1/health', () => {
  it('reports ok when the database answers', async () => {
    const app = createApp({ corsOrigins, pingDatabase: async () => {} });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
  });

  it('reports degraded when the database is down', async () => {
    const app = createApp({
      corsOrigins,
      pingDatabase: async () => {
        throw new Error('connection refused');
      },
    });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', checks: { database: 'down' } });
  });
});

describe('unknown routes', () => {
  it('return a JSON 404', async () => {
    const app = createApp({ corsOrigins, pingDatabase: async () => {} });
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});
