import { BrandStory } from '@/components/home/BrandStory';
import { CategoryGrid, type CategoryTile } from '@/components/home/CategoryGrid';
import { Faq } from '@/components/home/Faq';
import { FeatureTiles } from '@/components/home/FeatureTiles';
import { Hero } from '@/components/home/Hero';
import { StatementBand } from '@/components/home/StatementBand';
import { StoresParallax } from '@/components/home/StoresParallax';
import { ProductRow } from '@/components/product/ProductRow';
import { LATEST_SLUG, latestLink, lookbook } from '@/lib/site';
import { getBanners, getFeatured, listProducts, orFallback } from '@/lib/store-api';
import { brandStory, faqs, storesLines } from './content';

const HERO_FALLBACK: [string, string] = [
  'Clothing beyond time.',
  'Wear your story, every single drop.',
];

/** "/shop/hoodies" -> "hoodies"; the round hover photo comes from that listing's newest product. */
async function detailImageFor(href: string | null): Promise<string | null> {
  const slug = href?.match(/^\/shop\/([a-z0-9-]+)$/)?.[1];
  if (!slug) return null;
  const { items } = await listProducts({
    category: slug === LATEST_SLUG ? undefined : slug,
    sort: 'newest',
    limit: 1,
  });
  return items[0]?.images[0]?.url ?? null;
}

export default async function HomePage() {
  // The home page is the front door: if the API is down it still renders, with the
  // built-in hero and without the product sections.
  const [heroBanners, tileBanners, featured, latest] = await Promise.all([
    orFallback(() => getBanners('HERO'), []),
    orFallback(() => getBanners('CATEGORY_TILE'), []),
    orFallback(getFeatured, []),
    orFallback(() => listProducts({ sort: 'newest', limit: 3 }), null),
  ]);

  const heroImages = heroBanners.flatMap((b) => (b.imageUrl ? [b.imageUrl] : []));
  const strip = heroImages.length ? heroImages : lookbook;
  const headline = heroBanners[0];
  const lines: [string, string] = headline?.title
    ? [headline.title, headline.subtitle ?? '']
    : HERO_FALLBACK;

  const tiles: CategoryTile[] = await Promise.all(
    tileBanners
      .filter((b) => b.imageUrl && b.title)
      .map(async (b) => ({
        href: b.linkUrl ?? '/',
        name: b.title!,
        image: b.imageUrl!,
        detailImage: await orFallback(() => detailImageFor(b.linkUrl), null),
      })),
  );

  return (
    <>
      {/* The strip loops, so it needs at least two screens' worth of photos. */}
      <Hero eyebrow="Noor's since 2024" lines={lines} images={[...strip, ...strip]} />
      {tiles.length > 0 && <CategoryGrid tiles={tiles} />}
      <BrandStory>{brandStory}</BrandStory>
      {featured.length > 0 && (
        <ProductRow
          title="Explore Noor's"
          products={featured.slice(0, 6)}
          viewAllHref={latestLink.href}
        />
      )}
      <StatementBand
        heading={['Designed for', 'comfort,', 'Made for everyday', 'wear']}
        body="These are pieces that settle into your routine without effort, giving you the same reliable fit and comfort every time you wear them, while keeping a sharp, put-together look that works across different moments of your day."
      />
      <StoresParallax lines={storesLines} images={[strip[0]!, strip[3] ?? strip.at(-1)!]} />
      {latest && latest.items.length > 0 && (
        <ProductRow title="Latest Drip" products={latest.items} viewAllHref={latestLink.href} />
      )}
      <Faq items={faqs} />
      <FeatureTiles />
    </>
  );
}
