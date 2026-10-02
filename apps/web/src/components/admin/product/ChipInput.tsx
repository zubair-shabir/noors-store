'use client';

import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cx } from '../ui';

/**
 * A list of short values typed as chips: Enter or comma adds, Backspace on an empty input
 * removes the last one. `renderChip` lets callers add controls (e.g. a colour swatch).
 */
export function ChipInput({
  id,
  values,
  onChange,
  placeholder,
  normalize = (v) => v.trim(),
  max,
  disabled,
  renderChip,
  invalid,
}: {
  id?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  normalize?: (value: string) => string;
  max?: number;
  disabled?: boolean;
  renderChip?: (value: string, index: number) => ReactNode;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const full = max !== undefined && values.length >= max;

  function commit(text: string) {
    const added = text
      .split(',')
      .map(normalize)
      .filter(Boolean)
      .filter(
        (v, i, all) =>
          all.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i &&
          !values.some((x) => x.toLowerCase() === v.toLowerCase()),
      );
    if (added.length) onChange([...values, ...added].slice(0, max));
    setDraft('');
  }

  return (
    <div
      aria-invalid={invalid}
      className={cx(
        'flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-line bg-background px-2 py-1.5 transition focus-within:border-foreground aria-[invalid=true]:border-red-600',
        disabled && 'opacity-60',
      )}
    >
      {values.map((v, i) => (
        <span
          key={v}
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface pr-1 pl-2.5 text-sm"
        >
          {renderChip?.(v, i)}
          {v}
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="rounded-full p-0.5 text-subtle hover:bg-line hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </span>
      ))}
      {!disabled && !full && (
        <input
          id={id}
          value={draft}
          placeholder={values.length ? undefined : placeholder}
          onChange={(e) => {
            if (e.target.value.includes(',')) commit(e.target.value);
            else setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(draft);
            } else if (e.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => draft && commit(draft)}
          className="h-7 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-subtle"
        />
      )}
    </div>
  );
}
