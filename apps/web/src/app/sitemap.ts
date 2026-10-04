import type { MetadataRoute } from 'next';
import { LATEST_SLUG, productHref, siteUrl } from '@/lib/site';
import { getCategories, listProducts, orFallback } from '@/lib/store-api';

async function allProducts() {
  const first = await listProducts({ limit: 60 });
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) =>
      listProducts({ limit: 60, page: i + 2 }),
    ),
  );
  return [first, ...rest].flatMap((r) => r.items);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products] = await Promise.all([
    orFallback(getCategories, []),
    orFallback(allProducts, []),
  ]);
  const url = (path: string) => `${siteUrl}${path}`;
  return [
    { url: url('/'), changeFrequency: 'daily', priority: 1 },
    { url: url(`/shop/${LATEST_SLUG}`), changeFrequency: 'daily', priority: 0.9 },
    ...categories.map((c) => ({
      url: url(`/shop/${c.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: url(productHref(p.slug)),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    { url: url('/about'), priority: 0.4 },
    { url: url('/contact'), priority: 0.3 },
    { url: url('/faq'), priority: 0.4 },
    ...['/shipping', '/returns', '/privacy', '/terms'].map((path) => ({
      url: url(path),
      changeFrequency: 'yearly' as const,
      priority: 0.2,
    })),
  ];
}
