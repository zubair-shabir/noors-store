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
  /** Shown once the API says this account signs in with an authenticator code. */
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (needsCode && !/^\d{6}$/.test(code)) {
      setCodeError('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    setError(undefined);
    setCodeError(undefined);
    try {
      await adminFetch('/auth/login', {
        body: {
          email: form.get('email'),
          password: form.get('password'),
          ...(needsCode && { code }),
        },
      });
      const next = params.get('next');
      // Only follow same-site dashboard paths. /admin sends owners and staff to their start page.
      router.replace(next?.startsWith('/admin') ? next : '/admin');
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'two_factor_required') {
        setNeedsCode(true);
      } else if (apiError.code === 'invalid_code') {
        setNeedsCode(true);
        setCodeError(apiError.message);
        setCode('');
      } else {
        setError(apiError);
      }
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate={needsCode}
      className="w-full max-w-sm space-y-5 rounded-xl border border-line bg-background p-8 shadow-sm"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo />
        <h1 className="text-lg font-semibold">Sign in to the dashboard</h1>
      </div>
      <ErrorNote error={error} />
      {/* Email and password stay in the form (hidden once a code is asked for) so they are resent with it. */}
      <div className={needsCode ? 'hidden' : 'space-y-5'}>
        <Field label="Email">
          {(id) => (
            <Input id={id} name="email" type="email" autoComplete="username" required autoFocus />
          )}
        </Field>
        <Field label="Password">
          {(id) => (
            <Input
              id={id}
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          )}
        </Field>
      </div>
      {needsCode && (
        <>
          <p className="text-center text-sm text-muted">
            Open your authenticator app and enter the 6-digit code for Noor&apos;s dashboard.
          </p>
          <Field label="Authenticator code" error={codeError}>
            {(id) => (
              <Input
                id={id}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                aria-invalid={Boolean(codeError)}
                className="text-center font-mono tracking-[0.3em]"
                autoFocus
              />
            )}
          </Field>
        </>
      )}
      <Button type="submit" variant="primary" busy={busy} className="w-full">
        {needsCode ? 'Verify and sign in' : 'Sign in'}
      </Button>
      {needsCode && (
        <button
          type="button"
          onClick={() => {
            setNeedsCode(false);
            setCode('');
            setCodeError(undefined);
          }}
          className="block w-full text-center text-sm text-muted hover:text-foreground"
        >
          Use a different account
        </button>
      )}
    </form>
  );
}
