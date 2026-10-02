'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';
import { useUi } from '@/lib/ui-store';

/** Lenis inertia scrolling, as on the reference site. Paused while a drawer is open. */
export function SmoothScroll() {
  const panel = useUi((s) => s.panel);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    window.__lenis = lenis;
    let frame = requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      window.__lenis = undefined;
    };
  }, []);

  useEffect(() => {
    const lenis = window.__lenis;
    if (!lenis) return;
    if (panel) lenis.stop();
    else lenis.start();
  }, [panel]);

  return null;
}

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}
