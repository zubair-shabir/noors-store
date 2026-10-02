import type { ProductSummaryDto } from '@noors/shared';
import Link from 'next/link';
import { Reveal } from '@/components/motion/Reveal';
import { ProductCard } from '@/components/product/ProductCard';

/** Three-up product grid with staggered reveals, plus page links when there is more than one page. */
export function ProductGrid({
  products,
  page,
  totalPages,
  pageHref,
}: {
  products: ProductSummaryDto[];
  page: number;
  totalPages: number;
  pageHref: (page: number) => string;
}) {
  return (
    <>
      <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product, i) => (
          <Reveal key={product.id} delay={(i % 3) * 0.08}>
            <ProductCard product={product} priority={page === 1 && i < 3} />
          </Reveal>
        ))}
      </div>
      {totalPages > 1 && (
        <nav
          aria-label="Pages"
          className="mt-16 flex items-center justify-center gap-6 text-[11px] font-semibold tracking-[0.14em] uppercase"
        >
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="hover:opacity-60">
              ← Previous
            </Link>
          ) : (
            <span className="text-subtle">← Previous</span>
          )}
          <span className="text-muted">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="hover:opacity-60">
              Next →
            </Link>
          ) : (
            <span className="text-subtle">Next →</span>
          )}
        </nav>
      )}
    </>
  );
}
