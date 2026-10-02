import { Reveal } from '@/components/motion/Reveal';

interface StatementBandProps {
  heading: string[];
  body: string;
}

/** Full-width dark band: large display heading on the left, supporting copy on the right. */
export function StatementBand({ heading, body }: StatementBandProps) {
  return (
    <section className="bg-band text-band-foreground">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 sm:px-10 md:grid-cols-2 md:py-24">
        <Reveal as="h2" className="font-display text-5xl leading-[1.02] sm:text-6xl">
          {heading.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </Reveal>
        <Reveal as="p" delay={0.15} className="max-w-md text-base leading-relaxed sm:text-lg">
          {body}
        </Reveal>
      </div>
    </section>
  );
}
