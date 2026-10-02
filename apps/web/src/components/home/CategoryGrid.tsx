import Image from 'next/image';
import Link from 'next/link';
import { Reveal } from '@/components/motion/Reveal';
import type { Category } from '@/lib/catalog';

/**
 * Two-up category tiles, edge to edge. On hover a round detail photo pops up
 * from the bottom-left corner and the cursor reads "Explore".
 */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <section className="mx-auto grid max-w-[960px] grid-cols-2 gap-y-12 px-4 py-16 sm:py-24">
      {categories.map((category, i) => (
        <Reveal key={category.slug} delay={(i % 2) * 0.1} y={40}>
          <Link href={`/shop/${category.slug}`} data-cursor-label="Explore" className="group block">
            <div className="relative aspect-[477/524] overflow-hidden bg-surface">
              <Image
                src={category.image}
                alt={category.name}
                fill
                sizes="(min-width: 960px) 480px, 50vw"
                className="object-cover transition-transform duration-[1.4s] ease-out-expo group-hover:scale-[1.04]"
              />
              <div className="absolute -bottom-6 -left-6 aspect-square w-[34%] scale-0 overflow-hidden rounded-full border-4 border-background transition-transform duration-700 ease-out-expo group-hover:scale-100">
                <Image
                  src={category.detailImage}
                  alt=""
                  fill
                  sizes="160px"
                  className="object-cover"
                />
              </div>
            </div>
            <p className="mt-3 text-[11px] tracking-[0.06em] uppercase">{category.name}</p>
            <p className="mt-1 inline-block text-[10px] tracking-[0.08em] uppercase underline-offset-4 group-hover:underline">
              Explore
            </p>
          </Link>
        </Reveal>
      ))}
    </section>
  );
}
