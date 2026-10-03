'use client';

import type { TwoFactorSetupDto } from '@noors/shared';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiError, adminFetch } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { useAdmin } from '../../AdminShell';
import { Badge, Button, Card, ErrorNote, Field, Input, PageHeader } from '../../ui';

/** Your own password and two-factor sign-in. */
export function AccountSecurity() {
  const admin = useAdmin();
  return (
    <>
      <PageHeader
        title="Your account"
        description={`Signed in as ${admin.name} (${admin.email}).`}
      />
      <div className="space-y-6">
        <ChangePassword />
        <TwoFactor />
      </div>
    </>
  );
}

function ChangePassword() {
  const admin = useAdmin();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const found: typeof errors = {};
    if (!current) found.current = 'Enter your current password';
    if (next.length < 10) found.next = 'Use at least 10 characters';
    else if (next === current) found.next = 'Choose a password you are not using now';
    if (confirm !== next) found.confirm = 'The passwords do not match';
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await adminFetch('/auth/password', { body: { current, next } });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed. Your other devices have been signed out.');
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'invalid_password') setErrors({ current: apiError.message });
      else if (apiError.fieldError?.('next')) setErrors({ next: apiError.fieldError('next') });
      else setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Password" description="Changing it signs you out on every other device.">
      <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4">
        <ErrorNote error={error} />
        {/* Helps password managers save the new password against the right account. */}
        <input type="hidden" name="username" autoComplete="username" value={admin.email} readOnly />
        <Field label="Current password" error={errors.current}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              aria-invalid={Boolean(errors.current)}
            />
          )}
        </Field>
        <Field label="New password" error={errors.next} hint="At least 10 characters.">
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={Boolean(errors.next)}
            />
          )}
        </Field>
        <Field label="Confirm new password" error={errors.confirm}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={Boolean(errors.confirm)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" busy={busy}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

/** Six digits only, as the user types. */
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

function CodeField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <Field
      label="6-digit code"
      error={error}
      hint="From your authenticator app."
      className="max-w-48"
    >
      {(id) => (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(digits(e.target.value))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="123456"
          aria-invalid={Boolean(error)}
          className="font-mono tracking-[0.3em]"
        />
      )}
    </Field>
  );
}

/** Reads "That code is not right" style errors onto the code field. */
function codeError(err: ApiError): string | undefined {
  return err.code === 'invalid_code' ? err.message : err.fieldError?.('code');
}

function TwoFactor() {
  const admin = useAdmin();
  const [setup, setSetup] = useState<TwoFactorSetupDto>();
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState<string>();
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setError(undefined);
    setCodeErr(undefined);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      const apiError = err as ApiError;
      const onField = codeError(apiError);
      if (onField) setCodeErr(onField);
      else setError(apiError);
      setBusy(false);
    }
  }

  const start = () =>
    run(async () => {
      setSetup(await adminFetch<TwoFactorSetupDto>('/auth/2fa/setup', { method: 'POST' }));
      setBusy(false);
    });

  function onEnable(e: FormEvent) {
    e.preventDefault();
    if (!setup) return;
    if (code.length !== 6) return setCodeErr('Enter the 6-digit code');
    void run(async () => {
      await adminFetch('/auth/2fa/enable', { body: { secret: setup.secret, code } });
      toast.success('Two-factor sign-in is on');
      window.location.reload();
    });
  }

  function onDisable(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return setCodeErr('Enter the 6-digit code');
    void run(async () => {
      await adminFetch('/auth/2fa/disable', { body: { code } });
      toast.success('Two-factor sign-in is off');
      window.location.reload();
    });
  }

  const status = admin.twoFactor ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>;

  if (admin.twoFactor) {
    return (
      <Card
        title="Two-factor sign-in"
        description="You enter a code from your phone each time you sign in."
        actions={status}
      >
        <form onSubmit={onDisable} noValidate className="space-y-4">
          <ErrorNote error={error} />
          <p className="flex items-start gap-2 text-sm text-muted">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
              aria-hidden
            />
            Your account is protected even if someone learns your password. To turn it off, enter a
            code from your authenticator app.
          </p>
          <CodeField value={code} onChange={setCode} error={codeErr} />
          <Button type="submit" variant="danger" busy={busy}>
            Turn off two-factor
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card
      title="Two-factor sign-in"
      description="Ask for a code from your phone as well as your password when you sign in."
      actions={status}
    >
      <ErrorNote error={error} />
      {!setup ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-muted">
            <ShieldOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            You will need an authenticator app such as Google Authenticator or Authy on your phone.
          </p>
          <Button variant="primary" busy={busy} onClick={start}>
            Turn on
          </Button>
        </div>
      ) : (
        <form onSubmit={onEnable} noValidate className="space-y-5">
          <ol className="space-y-5 text-sm">
            <li>
              <p className="font-medium">1. Add a key manually</p>
              <p className="mt-1 text-muted">
                In your authenticator app, choose to add an account by entering a setup key (not by
                scanning), then type in these details. Use a time-based key.
              </p>
              <dl className="mt-3 grid max-w-md gap-3 rounded-lg border border-line bg-surface p-4">
                <div>
                  <dt className="text-xs text-muted">Account name</dt>
                  <dd className="font-medium break-all">{admin.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Key</dt>
                  <dd className="font-mono text-base tracking-wider break-words select-all">
                    {setup.secret.match(/.{1,4}/g)?.join(' ')}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-muted">
                On your phone? You can{' '}
                <a href={setup.uri} className="underline hover:text-foreground">
                  open this link in your authenticator app
                </a>{' '}
                instead.
              </p>
            </li>
            <li>
              <p className="font-medium">2. Enter the code it shows</p>
              <p className="mt-1 text-muted">The code changes every 30 seconds.</p>
            </li>
          </ol>
          <CodeField value={code} onChange={setCode} error={codeErr} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" busy={busy}>
              Turn on two-factor
            </Button>
            <Button
              onClick={() => {
                setSetup(undefined);
                setCode('');
                setCodeErr(undefined);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
