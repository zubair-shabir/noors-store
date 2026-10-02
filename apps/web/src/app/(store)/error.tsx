'use client';

import { useEffect } from 'react';

export default function StoreError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="font-display text-5xl uppercase sm:text-7xl">Back in a moment</h1>
      <p className="mt-4 max-w-sm text-sm text-muted">
        We couldn&apos;t load this page just now. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 border border-foreground px-8 py-3 text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors hover:bg-foreground hover:text-background"
      >
        Try again
      </button>
    </section>
  );
}
