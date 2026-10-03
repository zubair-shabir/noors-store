import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';

/*
 * Called by the API after a dashboard catalogue change (apps/api/src/lib/revalidate.ts), so the
 * store shows it at once instead of when the 60-second cache runs out. This route handler
 * answers before the /api/* rewrite to Express in next.config.ts, which only applies to paths
 * no page or route here matches.
 */

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Compares in constant time; hashing first makes both sides the same length. */
function secretMatches(given: string | null): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || !given) return false;
  return timingSafeEqual(digest(given), digest(secret));
}

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get('x-revalidate-secret'))) {
    return Response.json({ revalidated: false }, { status: 401 });
  }
  // Expire now rather than serving stale data once more, so the next page view is fresh.
  revalidateTag('catalog', { expire: 0 });
  return Response.json({ revalidated: true });
}
