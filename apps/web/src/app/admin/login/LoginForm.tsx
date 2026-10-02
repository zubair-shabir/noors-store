'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/brand/Logo';
import { Button, ErrorNote, Field, Input } from '@/components/admin/ui';
import { adminFetch, type ApiError } from '@/lib/admin/api';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await adminFetch('/auth/login', {
        body: { email: form.get('email'), password: form.get('password') },
      });
      const next = params.get('next');
      // Only follow same-site dashboard paths.
      router.replace(next?.startsWith('/admin') ? next : '/admin/products');
    } catch (err) {
      setError(err as ApiError);
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-5 rounded-xl border border-line bg-background p-8 shadow-sm"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo />
        <h1 className="text-lg font-semibold">Sign in to the dashboard</h1>
      </div>
      <ErrorNote error={error} />
      <Field label="Email">
        {(id) => (
          <Input id={id} name="email" type="email" autoComplete="username" required autoFocus />
        )}
      </Field>
      <Field label="Password">
        {(id) => (
          <Input id={id} name="password" type="password" autoComplete="current-password" required />
        )}
      </Field>
      <Button type="submit" variant="primary" busy={busy} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
