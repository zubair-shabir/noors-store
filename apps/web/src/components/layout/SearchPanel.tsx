'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { formatINR, type ProductSummaryDto } from '@noors/shared';
import { easeInOutQuart } from '@/lib/motion';
import { productHref } from '@/lib/site';
import { useUi } from '@/lib/ui-store';

/** Drop-down search sheet: live matches as you type, Enter for the full results page. */
export function SearchPanel() {
  const panel = useUi((s) => s.panel);
  const close = useUi((s) => s.close);
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ q: string; items: ProductSummaryDto[] } | null>(null);
  const open = panel === 'search';
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data: { items: ProductSummaryDto[] }) => setFound({ q, items: data.items }))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const results = q && found?.q === q ? found.items : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!q) return;
    close();
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <AnimatePresence
      onExitComplete={() => {
        setQuery('');
        setFound(null);
      }}
    >
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
            <form
              onSubmit={submit}
              role="search"
              className="mx-auto flex max-w-3xl items-center gap-3 border-b border-foreground pb-3"
            >
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
            </form>
            {results && (
              <ul className="mx-auto mt-4 max-w-3xl divide-y divide-line">
                {results.length === 0 && <li className="py-4 text-sm text-muted">No matches.</li>}
                {results.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={productHref(p.slug)}
                      onClick={close}
                      className="flex items-center gap-4 py-3 text-sm uppercase hover:opacity-60"
                    >
                      <span className="relative h-14 w-12 shrink-0 overflow-hidden bg-surface">
                        {p.images[0] && (
                          <Image
                            src={p.images[0].url}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        )}
                      </span>
                      <span className="flex-1">{p.name}</span>
                      <span>{formatINR(p.price)}</span>
                    </Link>
                  </li>
                ))}
                {results.length > 0 && (
                  <li className="pt-4">
                    <button
                      type="button"
                      onClick={submit}
                      className="text-[11px] font-semibold tracking-[0.14em] uppercase underline underline-offset-4"
                    >
                      See all results
                    </button>
                  </li>
                )}
              </ul>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
