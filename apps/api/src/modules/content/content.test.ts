import type { StoreInfoDto } from '@noors/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, testPrisma } from '../../../test/db.js';
import { createApp } from '../../app.js';
import { LogEmailSender } from '../../lib/email.js';
import { createServices } from '../../services.js';
import { saveSettings } from '../settings/settings.service.js';

const prisma = testPrisma();
const sender = new LogEmailSender();

/** A fresh app per test, so each starts with an empty contact rate limit. */
function makeApp(alertEmail?: string) {
  const services = createServices({
    prisma,
    emailSender: sender,
    storeUrl: 'https://noors.in',
    alertEmail,
  });
  return {
    services,
    app: createApp({ corsOrigins: ['http://localhost:3000'], prisma, services }),
  };
}

let app: ReturnType<typeof makeApp>['app'];
let services: ReturnType<typeof makeApp>['services'];

const message = {
  name: 'Zoya Mir',
  email: 'Zoya@Example.com',
  phone: '+91 98765 43210',
  orderNumber: 'nr-100245',
  message: 'The hoodie I ordered is a little big. Can I swap it for a medium?',
};

async function saveStore(store: Partial<StoreInfoDto> = {}) {
  await saveSettings(prisma, {
    store: {
      name: "Noor's",
      email: 'hello@noors.in',
      phone: '+91 94190 00000',
      address: 'Residency Road, Srinagar, Jammu and Kashmir 190001',
      gstNumber: '01ABCDE1234F1Z5',
      ...store,
    },
    shipping: { flatFee: 12900, freeFrom: 249900 },
    cod: { enabled: true, fee: 4900 },
    returns: { windowDays: 10 },
    fulfilment: { autoShip: false },
    inventory: { lowStockThreshold: 5 },
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
  ({ app, services } = makeApp('team@noors.in'));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /store-info', () => {
  it('falls back to the default settings', async () => {
    const res = await request(app).get('/api/v1/store-info');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: "Noor's",
      email: '',
      phone: '',
      address: 'Srinagar, Jammu and Kashmir',
      gstNumber: '',
      shipping: { fee: 9900, freeAbove: 199900 },
      cod: { enabled: false, fee: 0 },
      returns: { windowDays: 7 },
    } satisfies StoreInfoDto);
    expect(res.headers['cache-control']).toContain('public');
    expect(res.headers['cache-control']).toContain('s-maxage=60');
  });

  it('returns the saved settings without the private ones', async () => {
    await saveStore();
    const res = await request(app).get('/api/v1/store-info');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: "Noor's",
      email: 'hello@noors.in',
      phone: '+91 94190 00000',
      address: 'Residency Road, Srinagar, Jammu and Kashmir 190001',
      gstNumber: '01ABCDE1234F1Z5',
      shipping: { fee: 12900, freeAbove: 249900 },
      cod: { enabled: true, fee: 4900 },
      returns: { windowDays: 10 },
    });
    expect(res.body).not.toHaveProperty('fulfilment');
    expect(res.body).not.toHaveProperty('inventory');
  });
});

describe('POST /contact', () => {
  const send = (body: Record<string, unknown>, origin?: string) => {
    const req = request(app).post('/api/v1/contact');
    if (origin) req.set('Origin', origin);
    return req.send(body);
  };

  it('queues an email to the store email with the message', async () => {
    await saveStore();
    const res = await send(message, 'http://localhost:3000');
    expect(res.status, JSON.stringify(res.body)).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');

    const emails = await prisma.email.findMany();
    expect(emails).toHaveLength(1);
    const email = emails[0]!;
    expect(email).toMatchObject({ kind: 'contact_message', to: 'hello@noors.in', orderId: null });
    expect(email.subject).toBe('Contact form: Zoya Mir (order NR-100245)');
    expect(email.text).toContain('From: Zoya Mir <zoya@example.com>');
    expect(email.text).toContain('Phone: 9876543210');
    expect(email.text).toContain('swap it for a medium');
    expect(email.html).toContain('mailto:zoya@example.com');

    expect(await services.outbox.dispatch()).toBe(1);
    expect(sender.sent.at(-1)).toMatchObject({ to: 'hello@noors.in' });
  });

  it('falls back to the alert address when no store email is set', async () => {
    const res = await send({ name: 'Zoya', email: 'zoya@example.com', message: message.message });
    expect(res.status).toBe(204);
    const emails = await prisma.email.findMany();
    expect(emails.map((e) => e.to)).toEqual(['team@noors.in']);
    expect(emails[0]!.subject).toBe('Contact form: Zoya');
  });

  it('says so when there is nowhere to send the message', async () => {
    ({ app } = makeApp());
    const res = await send(message);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('contact_unavailable');
    expect(await prisma.email.count()).toBe(0);
  });

  it('rejects invalid fields with issues per field', async () => {
    const res = await send({
      name: ' ',
      email: 'not-an-email',
      phone: '12345',
      message: 'Hi',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    const paths = (res.body.error.issues as { path: string[] }[]).map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'phone', 'message']));
    expect(await prisma.email.count()).toBe(0);
  });

  it('treats blank optional fields as missing', async () => {
    await saveStore();
    const res = await send({ ...message, phone: '', orderNumber: '  ' });
    expect(res.status, JSON.stringify(res.body)).toBe(204);
    const email = await prisma.email.findFirstOrThrow();
    expect(email.subject).toBe('Contact form: Zoya Mir');
    expect(email.text).not.toContain('Phone:');
  });

  it('silently drops messages that fill in the honeypot', async () => {
    await saveStore();
    const res = await send({ ...message, website: 'http://spam.example' });
    expect(res.status).toBe(204);
    expect(await prisma.email.count()).toBe(0);
  });

  it('blocks cross-site posts', async () => {
    await saveStore();
    const res = await send(message, 'https://evil.example');
    expect(res.status).toBe(403);
    expect(await prisma.email.count()).toBe(0);
  });

  it('allows five messages per 15 minutes from one address', async () => {
    await saveStore();
    for (let i = 0; i < 5; i++) {
      expect((await send(message)).status).toBe(204);
    }
    const res = await send(message);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate_limited');
    expect(await prisma.email.count()).toBe(5);
  });
});
