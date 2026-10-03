'use client';

import type { CustomerDto, OtpRequestResult } from '@noors/shared';
import { useState } from 'react';
import { useShop } from '@/lib/cart-store';
import { errorMessage, shopFetch } from '@/lib/shop-api';
import { errorText, primaryButton, textButton, TextField } from './form';

/** Email, then the 6-digit code we send to it. Signs in and refreshes the bag. */
export function SignInForm({
  initialEmail = '',
  onSignedIn,
}: {
  initialEmail?: string;
  onSignedIn?: (customer: CustomerDto) => void;
}) {
  const load = useShop((s) => s.load);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<OtpRequestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      setSent(
        await shopFetch<OtpRequestResult>('/auth/otp/request', { method: 'POST', body: { email } }),
      );
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { customer } = await shopFetch<{ customer: CustomerDto }>('/auth/otp/verify', {
        method: 'POST',
        body: { email, code },
      });
      await load();
      onSignedIn?.(customer);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void (sent ? verify() : requestCode());
      }}
      className="space-y-5"
    >
      {!sent ? (
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      ) : (
        <>
          <p className="text-sm">
            We sent a 6-digit code to <span className="font-medium">{email}</span>. It works for 10
            minutes.
          </p>
          {sent.devCode && (
            <p className="border border-dashed border-line px-3 py-2 text-xs text-muted">
              Development mode, no email was sent. Your code is{' '}
              <span className="font-semibold text-foreground tabular-nums">{sent.devCode}</span>.
            </p>
          )}
          <TextField
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            disabled={busy}
          />
        </>
      )}
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <button
        type="submit"
        className={primaryButton}
        disabled={busy || (sent ? code.length !== 6 : !email)}
      >
        {sent ? 'Sign in' : 'Email me a code'}
      </button>
      {sent && (
        <div className="flex gap-6">
          <button type="button" className={textButton} onClick={requestCode} disabled={busy}>
            Send a new code
          </button>
          <button
            type="button"
            className={textButton}
            onClick={() => {
              setSent(null);
              setError(null);
            }}
            disabled={busy}
          >
            Use another email
          </button>
        </div>
      )}
    </form>
  );
}
