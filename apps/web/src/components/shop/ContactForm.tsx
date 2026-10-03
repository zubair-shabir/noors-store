'use client';

import type { ContactInput } from '@noors/shared';
import { useId, useState, type FormEvent } from 'react';
import { ShopError, shopFetch } from '@/lib/shop-api';
import { errorText, labelClass, primaryButton, TextField } from './form';

const empty = { name: '', email: '', phone: '', orderNumber: '', message: '', website: '' };

/** Contact form: emailed to the store, which replies to the shopper's address. */
export function ContactForm() {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<ShopError | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const messageId = useId();

  const set = (key: keyof typeof empty) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: ContactInput = form;
      await shopFetch<void>('/contact', { method: 'POST', body });
      setSent(true);
      setForm(empty);
    } catch (err) {
      setError(err instanceof ShopError ? err : new ShopError(0, 'error', 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="border border-line p-8 text-center sm:p-12">
        <p className="font-display text-3xl uppercase sm:text-4xl">Message sent</p>
        <p className="mt-4 text-sm text-muted">Thanks, we will reply within 24 hours.</p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-8 text-[11px] font-medium tracking-[0.14em] uppercase underline decoration-1 underline-offset-[5px] transition-opacity hover:opacity-60"
        >
          Send another message
        </button>
      </div>
    );
  }

  const messageError = error?.fieldError('message');
  return (
    <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
      <TextField
        label="Name"
        autoComplete="name"
        required
        maxLength={100}
        value={form.name}
        onChange={(e) => set('name')(e.target.value)}
        error={error?.fieldError('name')}
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        required
        maxLength={200}
        value={form.email}
        onChange={(e) => set('email')(e.target.value)}
        error={error?.fieldError('email')}
      />
      <TextField
        label="Phone (optional)"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="98765 43210"
        value={form.phone}
        onChange={(e) => set('phone')(e.target.value)}
        error={error?.fieldError('phone')}
      />
      <TextField
        label="Order number (optional)"
        placeholder="NR-100245"
        autoCapitalize="characters"
        maxLength={20}
        value={form.orderNumber}
        onChange={(e) => set('orderNumber')(e.target.value)}
        error={error?.fieldError('orderNumber')}
      />
      <div className="sm:col-span-2">
        <label htmlFor={messageId} className={labelClass}>
          Message
        </label>
        <textarea
          id={messageId}
          required
          rows={6}
          maxLength={4000}
          value={form.message}
          onChange={(e) => set('message')(e.target.value)}
          aria-invalid={Boolean(messageError)}
          aria-describedby={messageError ? `${messageId}-note` : undefined}
          className={`mt-2 block w-full resize-y border bg-transparent px-3 py-3 text-sm outline-none transition-colors focus:border-foreground ${messageError ? 'border-red-700 dark:border-red-400' : 'border-line'}`}
        />
        {messageError && (
          <p id={`${messageId}-note`} className={`mt-1.5 ${errorText}`}>
            {messageError}
          </p>
        )}
      </div>
      {/* Honeypot: hidden from people and screen readers; bots that fill it are ignored. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => set('website')(e.target.value)}
          />
        </label>
      </div>
      <div className="sm:col-span-2">
        {error && !error.issues.length && (
          <p className={`mb-4 ${errorText}`} role="alert">
            {error.message}
          </p>
        )}
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  );
}
