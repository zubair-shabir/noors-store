import { BrandStory } from '@/components/home/BrandStory';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { Faq } from '@/components/home/Faq';
import { FeatureTiles } from '@/components/home/FeatureTiles';
import { Hero } from '@/components/home/Hero';
import { StatementBand } from '@/components/home/StatementBand';
import { StoresParallax } from '@/components/home/StoresParallax';
import { ProductRow } from '@/components/product/ProductRow';
import { categories, featuredProducts, latestProducts, lookbook } from '@/lib/catalog';
import { brandStory, faqs, storesLines } from './content';

export default function HomePage() {
  return (
    <>
      <Hero
        eyebrow="Noor's since 2024"
        lines={['Clothing beyond time.', 'Wear your story, every single drop.']}
        images={[...lookbook, ...lookbook]}
      />
      <CategoryGrid categories={categories} />
      <BrandStory>{brandStory}</BrandStory>
      <ProductRow title="Explore Noor's" products={featuredProducts} viewAllHref="/shop/latest" />
      <StatementBand
        heading={['Designed for', 'comfort,', 'Made for everyday', 'wear']}
        body="These are pieces that settle into your routine without effort, giving you the same reliable fit and comfort every time you wear them, while keeping a sharp, put-together look that works across different moments of your day."
      />
      <StoresParallax lines={storesLines} images={[lookbook[0], lookbook[3]]} />
      <ProductRow title="Latest Drip" products={latestProducts} viewAllHref="/shop/latest" />
      <Faq items={faqs} />
      <FeatureTiles />
    </>
  );
}
