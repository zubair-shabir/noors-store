import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Reveal } from '@/components/motion/Reveal';
import { FilterBar } from '@/components/shop/FilterBar';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { facetsOf } from '@/lib/facets';
import { filtersToSearch, parseFilters, toApiQuery } from '@/lib/filters';
import { LATEST_SLUG, latestLink } from '@/lib/site';
import { getCategory, listProducts } from '@/lib/store-api';

/** Latest Drip is every product, newest first; any other slug is a category from the dashboard. */
async function resolve(slug: string) {
  if (slug === LATEST_SLUG) {
    return {
      name: latestLink.label,
      description: 'Fresh from the studio in Srinagar: every piece, newest first.',
      category: undefined,
    };
  }
  const category = await getCategory(slug);
  return category
    ? { name: category.name, description: category.description, category: slug }
    : null;
}

export async function generateMetadata(props: PageProps<'/shop/[category]'>): Promise<Metadata> {
  const { category: slug } = await props.params;
  const listing = await resolve(slug);
  if (!listing) return { title: 'Not found' };
  return {
    title: listing.name,
    description: listing.description ?? `Shop ${listing.name} from Noor's, designed in Kashmir.`,
    alternates: { canonical: `/shop/${slug}` },
  };
}

export default async function CategoryPage(props: PageProps<'/shop/[category]'>) {
  const [{ category: slug }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const listing = await resolve(slug);
  if (!listing) notFound();

  const filters = parseFilters(searchParams);
  const [all, results] = await Promise.all([
    listProducts({ category: listing.category, limit: 60 }),
    listProducts({ category: listing.category, ...toApiQuery(filters), limit: 24 }),
  ]);
  const { sizes, colours } = facetsOf(all.items);

  return (
    <section className="mx-auto max-w-6xl px-4 pt-16 pb-24 sm:px-10">
      <Reveal as="h1" className="font-display text-5xl uppercase sm:text-6xl">
        {listing.name}
      </Reveal>
      {listing.description && (
        <Reveal as="p" delay={0.1} className="mt-4 max-w-xl text-sm text-muted">
          {listing.description}
        </Reveal>
      )}
      <div className="mt-10">
        {all.total === 0 ? (
          <p className="text-muted">New pieces are on the way.</p>
        ) : (
          <>
            <FilterBar filters={filters} sizes={sizes} colours={colours} total={results.total} />
            {results.items.length === 0 ? (
              <p className="py-16 text-center text-muted">
                Nothing matches those filters. Try fewer sizes or a wider price.
              </p>
            ) : (
              <ProductGrid
                products={results.items}
                page={results.page}
                totalPages={results.totalPages}
                pageHref={(page) => `/shop/${slug}${filtersToSearch({ ...filters, page })}`}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
