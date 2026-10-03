'use client';

import { m, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { easeOutExpo } from '@/lib/motion';

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Vertical travel in px. */
  y?: number;
  as?: 'div' | 'section' | 'li' | 'p' | 'h1' | 'h2';
}

/** Blur-to-sharp fade up when the element scrolls into view (images, headings and copy on the reference site). */
export function Reveal({ children, className, delay = 0, y = 24, as = 'div' }: RevealProps) {
  const reduce = useReducedMotion();
  const Tag = m[as];
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(14px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 1, delay, ease: easeOutExpo }}
    >
      {children}
    </Tag>
  );
}
