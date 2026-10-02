'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ChinarLeaf } from '@/components/brand/ChinarLeaf';
import { easeInOutQuart, easeOutExpo } from '@/lib/motion';

const LETTERS = ['N', 'O', 'O', 'R', 'S'];
export const INTRO_KEY = 'noors-intro-seen';

/**
 * Black splash on the first visit of a session: NOORS types in letter by letter, the
 * chinar leaf drops onto the S, an underline draws, then the panel lifts away.
 * Server-rendered so it covers the page from the first paint; an inline script in the
 * root layout hides it (html[data-intro=seen]) on later page loads in the same session.
 */
export function IntroLoader() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    // Already played this session: the pre-paint script set data-intro and CSS keeps it hidden.
    if (document.documentElement.dataset.intro === 'seen') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(
      () => {
        setShow(false);
        try {
          sessionStorage.setItem(INTRO_KEY, '1');
        } catch {
          // Storage can be blocked; the intro then simply plays again next time.
        }
      },
      reduce ? 300 : 2100,
    );
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          data-intro-loader
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-white"
          exit={{ y: '-100%' }}
          transition={{ duration: 0.9, ease: easeInOutQuart }}
        >
          <div className="relative">
            <div className="flex font-brand text-4xl tracking-[0.22em] sm:text-5xl">
              {LETTERS.map((letter, i) => (
                <motion.span
                  key={i}
                  className="relative"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.14, duration: 0.35, ease: easeOutExpo }}
                >
                  {letter === 'S' && i === LETTERS.length - 1 && (
                    <motion.span
                      className="absolute -top-[0.62em] left-[-0.32em] block h-[0.62em] w-[0.62em]"
                      initial={{ opacity: 0, y: -18, rotate: -40 }}
                      animate={{ opacity: 1, y: 0, rotate: 0 }}
                      transition={{ delay: 1.0, duration: 0.6, ease: easeOutExpo }}
                    >
                      <ChinarLeaf className="h-full w-full" />
                    </motion.span>
                  )}
                  {letter}
                </motion.span>
              ))}
            </div>
            <motion.div
              className="mt-3 h-px origin-left bg-white"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.3, duration: 1.2, ease: easeOutExpo }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
