import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Reveal } from '@/components/motion/Reveal';
import { ProductCard } from '@/components/product/ProductCard';
import { categories, getCategory, getProductsByCategory } from '@/lib/catalog';

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata(props: PageProps<'/shop/[category]'>): Promise<Metadata> {
  const { category } = await props.params;
  return { title: getCategory(category)?.name };
}

// Placeholder listing for the design review; filters, sorting and real data arrive in Step 5.
export default async function CategoryPage(props: PageProps<'/shop/[category]'>) {
  const { category: slug } = await props.params;
  const category = getCategory(slug);
  if (!category) notFound();
  const items = getProductsByCategory(category.slug);

  return (
    <section className="mx-auto max-w-6xl px-4 pt-16 pb-24 sm:px-10">
      <Reveal as="h1" className="mb-10 font-display text-5xl uppercase sm:text-6xl">
        {category.name}
      </Reveal>
      {items.length === 0 ? (
        <p className="text-muted">New pieces are on the way.</p>
      ) : (
        <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((product, i) => (
            <Reveal key={product.slug} delay={i * 0.08}>
              <ProductCard product={product} priority={i < 3} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
