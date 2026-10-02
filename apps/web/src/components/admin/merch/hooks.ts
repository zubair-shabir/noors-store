'use client';

import { slugify } from '@noors/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';

/** Name + slug pair where the slug follows the name until the slug is edited by hand. */
export function useNameSlug(initial: { name: string; slug: string }) {
  const [name, setNameValue] = useState(initial.name);
  const [slug, setSlugValue] = useState(initial.slug);
  const [slugEdited, setSlugEdited] = useState(initial.slug !== '');

  function setName(value: string) {
    setNameValue(value);
    if (!slugEdited) setSlugValue(slugify(value));
  }

  function setSlug(value: string) {
    setSlugValue(value);
    setSlugEdited(value !== '');
  }

  return { name, slug, setName, setSlug };
}

/**
 * Persists a drag-reordered list once the drag settles (pointer released, or after a pause),
 * and puts the order from before the drag back if saving fails.
 * Returns `reorder(before, next)` to pass the SortableList's change through.
 */
export function useOrderSaver<T>(
  apply: (items: T[]) => void,
  save: (items: T[]) => Promise<unknown>,
) {
  const pending = useRef<{ before: T[]; next: T[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fns = useRef({ apply, save });
  useEffect(() => {
    fns.current = { apply, save };
  });

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    try {
      await fns.current.save(p.next);
    } catch (err) {
      fns.current.apply(p.before);
      toast.error(err);
    }
  }, []);

  useEffect(
    () => () => {
      window.removeEventListener('pointerup', flush);
      void flush();
    },
    [flush],
  );

  return useCallback(
    (before: T[], next: T[]) => {
      pending.current = { before: pending.current?.before ?? before, next };
      fns.current.apply(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 1200);
      window.addEventListener('pointerup', flush, { once: true });
    },
    [flush],
  );
}

/** The API's message for one field, if the error is a validation error about it. */
export function fieldError(err: Error | null, field: string): string | undefined {
  return err instanceof ApiError ? err.fieldError(field) : undefined;
}

/** The error to show above a form: undefined when it is already shown next to one of `fields`. */
export function formLevelError(err: Error | null, fields: string[]): Error | undefined {
  if (!err) return undefined;
  if (err instanceof ApiError && err.issues.some((i) => fields.includes(String(i.path[0]))))
    return undefined;
  return err;
}
