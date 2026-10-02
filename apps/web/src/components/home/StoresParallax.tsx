'use client';

import Image from 'next/image';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';

interface StoresParallaxProps {
  lines: string[];
  images: [string, string];
}

/**
 * Big grey statement with two tilted photos drifting past it on scroll: one rising from the
 * bottom-left, one sinking from the top-right, both straightening as they move.
 */
export function StoresParallax({ lines, images }: StoresParallaxProps) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const leftY = useTransform(scrollYProgress, [0, 1], ['35%', '-45%']);
  const leftRotate = useTransform(scrollYProgress, [0, 1], [-14, 4]);
  const rightY = useTransform(scrollYProgress, [0, 1], ['-30%', '40%']);
  const rightRotate = useTransform(scrollYProgress, [0, 1], [12, -4]);
  const textY = useTransform(scrollYProgress, [0, 1], ['12%', '-12%']);

  return (
    <section ref={ref} className="relative overflow-hidden py-40 sm:py-56">
      <motion.div
        className="absolute top-[18%] -left-[4%] w-[38vw] max-w-[360px] shadow-[0_30px_60px_-15px_rgb(0_0_0/0.35)] sm:w-[24vw]"
        style={reduce ? { rotate: -8 } : { y: leftY, rotate: leftRotate }}
      >
        <div className="relative aspect-[4/5]">
          <Image src={images[0]} alt="" fill sizes="360px" className="object-cover" />
        </div>
      </motion.div>
      <motion.div
        className="absolute top-[22%] -right-[3%] w-[38vw] max-w-[360px] shadow-[0_30px_60px_-15px_rgb(0_0_0/0.35)] sm:w-[24vw]"
        style={reduce ? { rotate: 8 } : { y: rightY, rotate: rightRotate }}
      >
        <div className="relative aspect-[4/5]">
          <Image src={images[1]} alt="" fill sizes="360px" className="object-cover" />
        </div>
      </motion.div>
      <motion.h2
        className="relative mx-auto max-w-2xl px-6 text-center font-display text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.15] text-statement uppercase"
        style={reduce ? undefined : { y: textY }}
      >
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </motion.h2>
    </section>
  );
}
