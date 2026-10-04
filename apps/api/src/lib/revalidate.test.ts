import { describe, expect, it, vi } from 'vitest';
import { REVALIDATE_HEADER, revalidateCatalog } from './revalidate.js';

const ok = () => vi.fn(async () => new Response(null, { status: 200 }));

describe('revalidateCatalog', () => {
  it('does nothing without both WEB_URL and REVALIDATE_SECRET', async () => {
    const fetch = ok();
    await revalidateCatalog({ webUrl: '', secret: 'shh', fetch });
    await revalidateCatalog({ webUrl: 'https://shop.test', secret: '', fetch });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the secret to the storefront', async () => {
    const fetch = ok();
    await revalidateCatalog({ webUrl: 'https://shop.test/', secret: 'shh', fetch });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://shop.test/api/revalidate');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ [REVALIDATE_HEADER]: 'shh' });
  });

  it('swallows network errors and bad responses', async () => {
    const down = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(
      revalidateCatalog({ webUrl: 'https://shop.test', secret: 'shh', fetch: down }),
    ).resolves.toBeUndefined();
    const denied = vi.fn(async () => new Response(null, { status: 401 }));
    await expect(
      revalidateCatalog({ webUrl: 'https://shop.test', secret: 'shh', fetch: denied }),
    ).resolves.toBeUndefined();
  });
});
