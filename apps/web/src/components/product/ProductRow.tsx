import { ButtonLink } from '@/components/ui/ButtonLink';
import { Reveal } from '@/components/motion/Reveal';
import type { Product } from '@/lib/catalog';
import { ProductCard } from './ProductCard';

interface ProductRowProps {
  title: string;
  products: Product[];
  viewAllHref: string;
}

/** "Explore Noor's" / "Latest Drip": display heading, View all button, three product cards. */
export function ProductRow({ title, products, viewAllHref }: ProductRowProps) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-10 sm:py-24">
      <Reveal className="mb-8 flex items-end justify-between gap-4">
        <h2 className="font-display text-4xl sm:text-5xl">{title}</h2>
        <ButtonLink href={viewAllHref}>View all</ButtonLink>
      </Reveal>
      <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product, i) => (
          <Reveal key={product.slug} delay={i * 0.08}>
            <ProductCard product={product} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
