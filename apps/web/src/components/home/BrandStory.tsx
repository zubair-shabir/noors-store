import { Reveal } from '@/components/motion/Reveal';

export function BrandStory({ children }: { children: string }) {
  return (
    <section className="mx-auto max-w-[44rem] px-6 py-16 sm:py-24">
      <Reveal as="p" className="text-base leading-7 sm:text-lg sm:leading-8">
        {children}
      </Reveal>
    </section>
  );
}
