'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatINR } from '@noors/shared';
import { products } from '@/lib/catalog';
import { easeInOutQuart } from '@/lib/motion';
import { useUi } from '@/lib/ui-store';

/** Drop-down search sheet. Matches names locally for now; Step 5 switches it to the API search endpoint. */
export function SearchPanel() {
  const panel = useUi((s) => s.panel);
  const close = useUi((s) => s.close);
  const [query, setQuery] = useState('');
  const open = panel === 'search';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const q = query.trim().toLowerCase();
  const results = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : [];

  return (
    <AnimatePresence onExitComplete={() => setQuery('')}>
      {open && (
        <div className="fixed inset-0 z-[80]">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="absolute inset-x-0 top-0 bg-background px-4 pt-6 pb-8 shadow-xl sm:px-10"
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ duration: 0.6, ease: easeInOutQuart }}
          >
            <div className="mx-auto flex max-w-3xl items-center gap-3 border-b border-foreground pb-3">
              <Search className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search hoodies, jackets, overshirts"
                className="flex-1 bg-transparent text-lg outline-none placeholder:text-subtle"
                aria-label="Search products"
              />
              <button type="button" onClick={close} aria-label="Close search" className="p-1">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            {q && (
              <ul className="mx-auto mt-4 max-w-3xl divide-y divide-line">
                {results.length === 0 && <li className="py-4 text-sm text-muted">No matches.</li>}
                {results.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/shop/${p.category}`}
                      onClick={close}
                      className="flex justify-between py-3 text-sm uppercase hover:opacity-60"
                    >
                      <span>{p.name}</span>
                      <span>{formatINR(p.price)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
