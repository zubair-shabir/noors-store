'use client';

import { motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';

/**
 * Small dot that trails the pointer. Over any element with data-cursor-label it grows
 * into a white disc showing that label ("Explore", "View"), as on the reference site.
 */
export function CursorFollower() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 500, damping: 40, mass: 0.4 });
  const [label, setLabel] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
      const target = (e.target as Element | null)?.closest<HTMLElement>('[data-cursor-label]');
      setLabel(target?.dataset.cursorLabel ?? null);
    };
    const onLeave = () => setVisible(false);

    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [x, y]);

  const size = label ? 96 : 12;

  return (
    <motion.div
      data-cursor-follower
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[90] flex items-center justify-center rounded-full"
      style={{ x: sx, y: sy, translateX: '-50%', translateY: '-50%' }}
      animate={{
        width: size,
        height: size,
        opacity: visible ? 1 : 0,
        backgroundColor: label ? '#ffffff' : 'var(--foreground)',
        boxShadow: label ? '0 8px 30px rgb(0 0 0 / 0.18)' : '0 0 0 rgb(0 0 0 / 0)',
      }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      <motion.span
        className="text-[11px] font-semibold tracking-[0.08em] text-black uppercase"
        animate={{ opacity: label ? 1 : 0, scale: label ? 1 : 0.6 }}
        transition={{ duration: 0.2 }}
      >
        {label}
      </motion.span>
    </motion.div>
  );
}
