'use client';

import Image from 'next/image';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Marquee } from '@/components/motion/Marquee';
import { easeOutExpo } from '@/lib/motion';

interface HeroProps {
  eyebrow: string;
  lines: [string, string];
  images: string[];
}

/**
 * Centered display headline over an endlessly scrolling photo strip. As the page scrolls,
 * the headline blurs away and the strip grows to fill the screen.
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
      <motion.div
        className="px-4 text-center"
        style={reduce ? undefined : { filter: headlineBlur, opacity: headlineOpacity }}
      >
        <motion.p
          className="text-sm text-muted sm:text-base"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.8 }}
        >
          {eyebrow}
        </motion.p>
        <h1 className="mt-4 font-display text-[clamp(2.4rem,7vw,5.6rem)] leading-[0.98] uppercase">
          {lines.map((line, i) => (
            <span key={line} className="block overflow-hidden pb-1">
              <motion.span
                className="block"
                initial={reduce ? false : { y: '105%' }}
                animate={{ y: 0 }}
                transition={{ delay: 0.25 + i * 0.12, duration: 1, ease: easeOutExpo }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>
      </motion.div>

      <motion.div
        className="mt-10 origin-top sm:mt-14"
        style={reduce ? undefined : { scale: stripScale }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 1.1, ease: easeOutExpo }}
      >
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
                priority={i < 2}
                sizes="(min-width: 1024px) 17vw, (min-width: 640px) 24vw, 46vw"
                className="object-cover"
              />
            </div>
          ))}
        </Marquee>
      </motion.div>
    </section>
  );
}
