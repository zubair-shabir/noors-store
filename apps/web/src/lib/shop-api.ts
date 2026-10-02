/** Browser calls to the store API (cart, sign-in, checkout), through this app's own origin. */

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    issues?: { path: (string | number)[]; message: string }[];
  };
}

export class ShopError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: { path: (string | number)[]; message: string }[] = [],
  ) {
    super(message);
  }

  /** The first validation message for a field path such as "address.pincode". */
  fieldError(path: string): string | undefined {
    return this.issues.find((i) => i.path.join('.') === path)?.message;
  }
}

export async function shopFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch {
    throw new ShopError(0, 'network', 'Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!res.ok) {
    const issues = body.error?.issues ?? [];
    throw new ShopError(
      res.status,
      body.error?.code ?? 'error',
      body.error?.message ?? issues[0]?.message ?? 'Something went wrong. Please try again.',
      issues,
    );
  }
  return body;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.';
