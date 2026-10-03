import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase, testPrisma } from '../../../test/db.js';
import { createApp } from '../../app.js';
import { hashPassword } from '../../lib/password.js';

const prisma = testPrisma();
const fetchMock = vi.fn(
  async (_url: string | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
);
let app: ReturnType<typeof createApp>;
let cookie: string;

beforeAll(async () => {
  vi.stubEnv('WEB_URL', 'https://shop.test');
  vi.stubEnv('REVALIDATE_SECRET', 'shh');
  vi.stubGlobal('fetch', fetchMock);
  app = createApp({ corsOrigins: ['http://localhost:3000'], prisma, loginRateLimit: 1000 });
  await resetDatabase(prisma);
  const passwordHash = await hashPassword('correct-horse-battery');
  await prisma.adminUser.create({
    data: { email: 'owner@test.in', name: 'Owner', role: 'OWNER', passwordHash },
  });
  const res = await request(app)
    .post('/api/v1/admin/auth/login')
    .send({ email: 'owner@test.in', password: 'correct-horse-battery' });
  cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
});

beforeEach(() => fetchMock.mockClear());

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

const revalidations = () =>
  fetchMock.mock.calls.filter(([url]) => String(url) === 'https://shop.test/api/revalidate');

describe('storefront refresh after catalogue changes', () => {
  it('asks the storefront to revalidate after a successful change', async () => {
    const res = await request(app)
      .post('/api/v1/admin/categories')
      .set('Cookie', cookie)
      .send({ slug: 'pherans', name: 'Pherans' });
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(revalidations()).toHaveLength(1));
  });

  it('skips reads and failed changes', async () => {
    expect((await request(app).get('/api/v1/admin/categories').set('Cookie', cookie)).status).toBe(
      200,
    );
    const bad = await request(app).post('/api/v1/admin/categories').set('Cookie', cookie).send({});
    expect(bad.status).toBe(400);
    await new Promise((r) => setTimeout(r, 20));
    expect(revalidations()).toHaveLength(0);
  });
});
