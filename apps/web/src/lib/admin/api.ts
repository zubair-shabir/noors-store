'use client';

import { useCallback, useEffect, useState } from 'react';

/** An error response from the admin API: { error: { code, message, issues? } }. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues: { path: (string | number)[]; message: string }[] = [],
  ) {
    super(message);
  }

  /** First validation message for a field, e.g. fieldError('slug'). */
  fieldError(field: string): string | undefined {
    return this.issues.find((i) => i.path[0] === field)?.message;
  }
}

const BASE = '/api/v1/admin';

/**
 * Calls the admin API through the web app's own origin (next.config rewrites /api to Express),
 * so the httpOnly session cookie rides along. A 401 sends the browser to the sign-in page.
 */
export async function adminFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body || init.form ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      // A full page load on purpose: it drops all dashboard state from the expired session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/admin/login?next=${next}`);
    }
    const err = data?.error ?? {};
    const message =
      err.code === 'validation_error'
        ? (err.issues?.[0]?.message ?? 'Check the highlighted fields')
        : (err.message ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, err.code ?? 'error', message, err.issues ?? []);
  }
  return data as T;
}

/** Loads `path` on mount and whenever `reload()` is called. Pass null to skip. */
export function useAdminData<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: ApiError; path?: string | null }>({});
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let alive = true;
    adminFetch<T>(path).then(
      (data) => alive && setState({ data, path }),
      (error: ApiError) => alive && setState((s) => ({ ...s, error, path })),
    );
    return () => {
      alive = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((data: T) => setState({ data, path }), [path]);
  return {
    data: state.data,
    error: state.error,
    loading: path !== null && state.path !== path && !state.error,
    reload,
    setData,
  };
}

/** Uploads one image and returns its URL. */
export async function uploadImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  return adminFetch('/uploads', { form });
}

/** "2499" or "2,499.50" -> 249950 paise. Empty -> null. NaN -> undefined (invalid). */
export function rupeesToPaise(text: string): number | null | undefined {
  const clean = text.replace(/[,₹\s]/g, '');
  if (!clean) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return undefined;
  return Math.round(Number(clean) * 100);
}

/** 249950 -> "2499.50", 249900 -> "2499". */
export function paiseToRupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
