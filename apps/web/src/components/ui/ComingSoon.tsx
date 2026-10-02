import { Reveal } from '@/components/motion/Reveal';

/** Holding page for routes the plan builds in a later step. */
export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center sm:py-32">
      <Reveal as="h1" className="font-display text-5xl uppercase sm:text-7xl">
        {title}
      </Reveal>
      <Reveal as="p" delay={0.1} className="mt-6 text-lg text-muted">
        {note}
      </Reveal>
    </section>
  );
}
