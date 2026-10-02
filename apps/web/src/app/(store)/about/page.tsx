import type { Metadata } from 'next';
import { BrandStory } from '@/components/home/BrandStory';
import { FeatureTiles } from '@/components/home/FeatureTiles';
import { StatementBand } from '@/components/home/StatementBand';
import { StoresParallax } from '@/components/home/StoresParallax';
import { Reveal } from '@/components/motion/Reveal';
import { lookbook } from '@/lib/catalog';
import { brandStory, storesLines } from '../content';

export const metadata: Metadata = { title: 'About us' };

export default function AboutPage() {
  return (
    <>
      <section className="px-4 pt-20 pb-6 text-center sm:pt-28">
        <Reveal
          as="h1"
          className="font-display text-[clamp(3rem,9vw,7.5rem)] leading-[0.95] uppercase"
        >
          <span className="block">Rooted in Kashmir,</span>
          <span className="block">always.</span>
        </Reveal>
      </section>
      <BrandStory>{brandStory}</BrandStory>
      <StatementBand
        heading={['Tradition in details,', 'Modern in form']}
        body="Heritage, craftsmanship and a modern silhouette. Every stitch carries culture, and every piece is designed for tomorrow."
      />
      <StoresParallax lines={storesLines} images={[lookbook[0], lookbook[3]]} />
      <FeatureTiles />
    </>
  );
}
