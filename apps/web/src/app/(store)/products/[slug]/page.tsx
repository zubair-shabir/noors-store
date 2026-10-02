import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductRow } from '@/components/product/ProductRow';
import { ProductView } from '@/components/product/ProductView';
import { productHref, siteUrl } from '@/lib/site';
import { getProduct, listProducts } from '@/lib/store-api';

const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export async function generateMetadata(props: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProduct(slug);
  if (!product) return { title: 'Not found' };
  const description =
    product.seoDescription ?? (plainText(product.description).slice(0, 160) || undefined);
  const image = product.images[0];
  return {
    title: product.seoTitle ?? product.name,
    description,
    alternates: { canonical: productHref(product.slug) },
    openGraph: {
      title: product.seoTitle ?? product.name,
      description,
      url: productHref(product.slug),
      images: image ? [{ url: image.url, alt: image.alt ?? product.name }] : undefined,
    },
  };
}

export default async function ProductPage(props: PageProps<'/products/[slug]'>) {
  const { slug } = await props.params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const related = (await listProducts({ category: product.category.slug, limit: 4 })).items
    .filter((p) => p.id !== product.id)
    .slice(0, 3);

  // Product structured data, so search results can show price and availability.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: plainText(product.description) || undefined,
    image: product.images.map((i) => new URL(i.url, siteUrl).toString()),
    sku: product.variants[0]?.sku,
    brand: { '@type': 'Brand', name: "Noor's" },
    category: product.category.name,
    offers: product.variants.map((v) => ({
      '@type': 'Offer',
      sku: v.sku,
      price: (v.price / 100).toFixed(2),
      priceCurrency: 'INR',
      availability: v.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: new URL(productHref(product.slug), siteUrl).toString(),
    })),
  };

  return (
    <>
      <section className="mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-10 sm:pt-12">
        <ProductView key={product.id} product={product} />
      </section>
      {related.length > 0 && (
        <ProductRow
          title="You may also like"
          products={related}
          viewAllHref={`/shop/${product.category.slug}`}
        />
      )}
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped cannot break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
