import type { Metadata } from 'next';
import { Reveal } from '@/components/motion/Reveal';
import { FilterBar } from '@/components/shop/FilterBar';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { facetsOf } from '@/lib/facets';
import { filtersToSearch, parseFilters, toApiQuery } from '@/lib/filters';
import { listProducts } from '@/lib/store-api';

export const metadata: Metadata = { title: 'Search', robots: { index: false } };

export default async function SearchPage(props: PageProps<'/search'>) {
  const searchParams = await props.searchParams;
  const raw = searchParams.q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? '';
  const filters = parseFilters(searchParams);

  const [all, results] = q
    ? await Promise.all([
        listProducts({ q, limit: 60 }),
        listProducts({ q, ...toApiQuery(filters), limit: 24 }),
      ])
    : [null, null];

  return (
    <section className="mx-auto max-w-6xl px-4 pt-16 pb-24 sm:px-10">
      <Reveal as="h1" className="font-display text-4xl uppercase sm:text-5xl">
        {q ? `Results for “${q}”` : 'Search'}
      </Reveal>
      <form action="/search" className="mt-8 flex max-w-xl border-b border-foreground pb-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search hoodies, jackets, overshirts"
          aria-label="Search products"
          className="flex-1 bg-transparent text-lg outline-none placeholder:text-subtle"
        />
        <button type="submit" className="text-[11px] font-semibold tracking-[0.14em] uppercase">
          Search
        </button>
      </form>
      <div className="mt-10">
        {all && results && all.total > 0 ? (
          <>
            <FilterBar filters={filters} q={q} total={results.total} {...facetsOf(all.items)} />
            {results.items.length === 0 ? (
              <p className="py-16 text-center text-muted">Nothing matches those filters.</p>
            ) : (
              <ProductGrid
                products={results.items}
                page={results.page}
                totalPages={results.totalPages}
                pageHref={(page) => `/search${filtersToSearch({ ...filters, page, q })}`}
              />
            )}
          </>
        ) : (
          q && (
            <p className="text-muted">No pieces match “{q}”. Try a colour, fabric or category.</p>
          )
        )}
      </div>
    </section>
  );
}
