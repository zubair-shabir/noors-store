'use client';

import Image from 'next/image';
import { m, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Marquee } from '@/components/motion/Marquee';

interface HeroProps {
  eyebrow: string;
  lines: [string, string];
  images: string[];
}

/**
 * Centered display headline over an endlessly scrolling photo strip. As the page scrolls,
 * the headline blurs away and the strip grows to fill the screen. The entrance animations
 * are CSS (globals.css), so they start with the first paint instead of after hydration.
 */
export function Hero({ eyebrow, lines, images }: HeroProps) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const headlineBlur = useTransform(scrollYProgress, [0, 0.35], ['blur(0px)', 'blur(10px)']);
  const headlineOpacity = useTransform(scrollYProgress, [0, 0.35], [1, 0]);
  const stripScale = useTransform(scrollYProgress, [0, 0.45], [1, 1.32]);

  return (
    <section ref={ref} className="relative overflow-hidden pt-14 pb-28 sm:pt-20">
      <m.div
        className="px-4 text-center"
        style={reduce ? undefined : { filter: headlineBlur, opacity: headlineOpacity }}
      >
        <p className="hero-fade text-sm text-muted sm:text-base">{eyebrow}</p>
        <h1 className="mt-4 font-display text-[clamp(2.4rem,7vw,5.6rem)] leading-[0.98] uppercase">
          {lines.map((line, i) => (
            <span key={line} className="block overflow-hidden pb-1">
              <span className="hero-rise block" style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
                {line}
              </span>
            </span>
          ))}
        </h1>
      </m.div>

      <m.div
        className="mt-10 origin-top sm:mt-14"
        style={reduce ? undefined : { scale: stripScale }}
      >
        {/* The entrance runs in CSS so the photos show before the page's scripts load. */}
        <div className="hero-strip">
          <Marquee duration={45}>
            {images.map((src, i) => (
              <div
                key={`${i}-${src}`}
                className="relative aspect-[420/606] w-[46vw] shrink-0 sm:w-[24vw] lg:w-[16.5vw]"
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  // Two or three photos fill a phone screen; load those first.
                  loading={i < 3 ? 'eager' : 'lazy'}
                  fetchPriority={i < 2 ? 'high' : 'auto'}
                  sizes="(min-width: 1024px) 17vw, (min-width: 640px) 24vw, 46vw"
                  className="object-cover"
                />
              </div>
            ))}
          </Marquee>
        </div>
      </m.div>
    </section>
  );
}
