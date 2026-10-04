import { logger } from './logger.js';

export interface RevalidateConfig {
  /** The storefront's public address, e.g. https://noors.in. */
  webUrl?: string;
  /** Shared with the storefront's REVALIDATE_SECRET. */
  secret?: string;
  fetch?: typeof fetch;
}

/** Header the storefront's /api/revalidate route checks the secret in. */
export const REVALIDATE_HEADER = 'x-revalidate-secret';

/**
 * Tells the storefront to drop its cached catalogue, so a dashboard edit shows up at once
 * instead of within a minute. Does nothing unless WEB_URL and REVALIDATE_SECRET are set.
 * Never throws: a failure is logged and the store simply catches up when its cache expires.
 */
export async function revalidateCatalog({
  webUrl = process.env.WEB_URL,
  secret = process.env.REVALIDATE_SECRET,
  fetch: fetchFn = fetch,
}: RevalidateConfig = {}): Promise<void> {
  if (!webUrl || !secret) return;
  try {
    const res = await fetchFn(`${webUrl.replace(/\/+$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: { [REVALIDATE_HEADER]: secret },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) logger.warn(`Storefront revalidation failed with ${res.status}`);
  } catch (err) {
    logger.warn({ err }, 'Storefront revalidation failed');
  }
}
