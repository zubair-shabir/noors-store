'use client';

import type { OptionValueDto } from '@noors/shared';
import { SlidersHorizontal, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { filtersToSearch, priceBands, sortOptions, type ListingFilters } from '@/lib/filters';

interface FilterBarProps {
  filters: ListingFilters;
  sizes: string[];
  colours: OptionValueDto[];
  total: number;
  /** Kept in the URL on search results. */
  q?: string;
}

const chip =
  'h-8 min-w-10 border px-3 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors';
const label = 'text-[11px] font-semibold tracking-[0.14em] uppercase';

/** Size, colour and price filters plus sorting. Every change is a URL change, so results are shareable. */
export function FilterBar({ filters, sizes, colours, total, q }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const activeCount = filters.size.length + filters.colour.length + (filters.price ? 1 : 0);

  const apply = (next: Partial<ListingFilters>) => {
    // Any filter change starts again from page 1.
    const search = filtersToSearch({ ...filters, page: 1, ...next, q });
    startTransition(() => router.push(`${pathname}${search}`, { scroll: false }));
  };

  const toggle = (list: string[], value: string) =>
    list.some((v) => v.toLowerCase() === value.toLowerCase())
      ? list.filter((v) => v.toLowerCase() !== value.toLowerCase())
      : [...list, value];

  const isOn = (list: string[], value: string) =>
    list.some((v) => v.toLowerCase() === value.toLowerCase());

  return (
    <div className="mb-10 border-y border-line py-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`${label} flex items-center gap-2 hover:opacity-60`}
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Filter{activeCount > 0 && ` (${activeCount})`}
        </button>
        <p className={`text-xs text-muted transition-opacity ${pending ? 'opacity-40' : ''}`}>
          {total} {total === 1 ? 'piece' : 'pieces'}
        </p>
        <label className="flex items-center gap-2">
          <span className={label}>Sort</span>
          <select
            value={filters.sort}
            onChange={(e) => apply({ sort: e.target.value as ListingFilters['sort'] })}
            className="cursor-pointer border-b border-foreground bg-transparent py-0.5 text-[11px] font-medium uppercase"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {open && (
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {sizes.length > 0 && (
            <fieldset>
              <legend className={`${label} mb-3`}>Size</legend>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={isOn(filters.size, s)}
                    onClick={() => apply({ size: toggle(filters.size, s) })}
                    className={`${chip} ${isOn(filters.size, s) ? 'border-foreground bg-foreground text-background' : 'border-line hover:border-foreground'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {colours.length > 0 && (
            <fieldset>
              <legend className={`${label} mb-3`}>Colour</legend>
              <div className="flex flex-wrap gap-2">
                {colours.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={isOn(filters.colour, c.value)}
                    onClick={() => apply({ colour: toggle(filters.colour, c.value) })}
                    className={`${chip} flex items-center gap-2 ${isOn(filters.colour, c.value) ? 'border-foreground' : 'border-line hover:border-foreground'}`}
                  >
                    {c.swatch && (
                      <span
                        aria-hidden
                        className="h-3 w-3 rounded-full border border-line"
                        style={{ background: c.swatch }}
                      />
                    )}
                    {c.value}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend className={`${label} mb-3`}>Price</legend>
            <div className="flex flex-col items-start gap-2">
              {priceBands.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  aria-pressed={filters.price === b.key}
                  onClick={() => apply({ price: filters.price === b.key ? null : b.key })}
                  className={`text-xs ${filters.price === b.key ? 'font-semibold underline underline-offset-4' : 'text-muted hover:text-foreground'}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => apply({ size: [], colour: [], price: null })}
          className={`${label} mt-4 flex items-center gap-1 text-muted hover:text-foreground`}
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Clear filters
        </button>
      )}
    </div>
  );
}
