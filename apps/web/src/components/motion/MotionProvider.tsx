'use client';

import { domAnimation, LazyMotion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Storefront components animate with the slim `m` component, which only carries the
 * animation features loaded here; that keeps most of motion's code out of the store's bundle.
 * `strict` makes a stray full `motion` component an error instead of a silent size cost.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
