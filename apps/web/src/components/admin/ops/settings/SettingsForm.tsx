'use client';

import type { AdminSettingsDto, Settings } from '@noors/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, adminFetch, paiseToRupees, rupeesToPaise, useAdminData } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { useIsOwner } from '../../AdminShell';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Spinner,
  Switch,
  Textarea,
} from '../../ui';

/** Everything editable, as the text the inputs hold. */
interface FormState {
  name: string;
  email: string;
  phone: string;
  address: string;
  gstNumber: string;
  flatFee: string;
  freeFrom: string;
  neverFree: boolean;
  codEnabled: boolean;
  codFee: string;
  windowDays: string;
  autoShip: boolean;
  lowStockThreshold: string;
}

/** Errors keyed by the API path joined with dots, e.g. "store.gstNumber". */
type Errors = Record<string, string>;

function toForm(s: Settings): FormState {
  return {
    name: s.store.name,
    email: s.store.email,
    phone: s.store.phone,
    address: s.store.address,
    gstNumber: s.store.gstNumber,
    flatFee: paiseToRupees(s.shipping.flatFee),
    freeFrom: paiseToRupees(s.shipping.freeFrom),
    neverFree: s.shipping.freeFrom === null,
    codEnabled: s.cod.enabled,
    codFee: paiseToRupees(s.cod.fee),
    windowDays: String(s.returns.windowDays),
    autoShip: s.fulfilment.autoShip,
    lowStockThreshold: String(s.inventory.lowStockThreshold),
  };
}

/** Builds the PUT body, or returns the fields that can't be read. */
function toSettings(f: FormState): { settings?: Settings; errors: Errors } {
  const errors: Errors = {};
  const money = (key: string, text: string, required: boolean) => {
    const value = rupeesToPaise(text);
    if (value === undefined) errors[key] = 'Enter an amount in rupees, like 99 or 99.50';
    else if (value === null && required) errors[key] = 'Enter an amount, or 0';
    return value ?? 0;
  };
  const whole = (key: string, text: string, max: number) => {
    const value = Number(text.trim());
    if (!text.trim() || !Number.isInteger(value) || value < 0 || value > max) {
      errors[key] = `Enter a whole number from 0 to ${max}`;
    }
    return value;
  };

  const flatFee = money('shipping.flatFee', f.flatFee, true);
  const freeFrom = f.neverFree ? null : money('shipping.freeFrom', f.freeFrom, true);
  const codFee = money('cod.fee', f.codFee, true);
  const windowDays = whole('returns.windowDays', f.windowDays, 90);
  const lowStockThreshold = whole('inventory.lowStockThreshold', f.lowStockThreshold, 1000);
  if (!f.name.trim()) errors['store.name'] = 'Enter the store name';

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    settings: {
      store: {
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        address: f.address.trim(),
        gstNumber: f.gstNumber.trim().toUpperCase(),
      },
      shipping: { flatFee, freeFrom },
      cod: { enabled: f.codEnabled, fee: codFee },
      returns: { windowDays },
      fulfilment: { autoShip: f.autoShip },
      inventory: { lowStockThreshold },
    },
  };
}

const integrationLabels = {
  payments: {
    live: { label: 'Razorpay, live', tone: 'green', note: 'Real payments are taken.' },
    test: { label: 'Razorpay, test mode', tone: 'amber', note: 'Test cards only, no real money.' },
    mock: { label: 'Not set up', tone: 'neutral', note: 'Checkout uses a pretend payment.' },
  },
  shipping: {
    shiprocket: { label: 'Shiprocket', tone: 'green', note: 'Orders can be booked with couriers.' },
    mock: { label: 'Not set up', tone: 'neutral', note: 'Bookings are pretend, for testing.' },
  },
  email: {
    resend: { label: 'Resend', tone: 'green', note: 'Order emails go out to shoppers.' },
    log: { label: 'Not set up', tone: 'neutral', note: 'Emails are written to the server log.' },
  },
} as const;

export function SettingsForm() {
  const isOwner = useIsOwner();
  const router = useRouter();
  const { data, error, setData } = useAdminData<AdminSettingsDto>(isOwner ? '/settings' : null);
  const [form, setForm] = useState<FormState>();
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOwner) router.replace('/admin/orders');
  }, [isOwner, router]);

  // Fill the form once the settings arrive (and again after each save).
  const [loadedFrom, setLoadedFrom] = useState<AdminSettingsDto>();
  if (data && data !== loadedFrom) {
    setLoadedFrom(data);
    setForm(toForm(data));
  }

  if (!isOwner) return <Spinner label="Opening orders" />;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaveError(undefined);
    const { settings, errors: found } = toSettings(form);
    setErrors(found);
    if (!settings) {
      toast.error(new Error('Check the highlighted fields'));
      return;
    }
    setBusy(true);
    try {
      const saved = await adminFetch<AdminSettingsDto>('/settings', {
        method: 'PUT',
        body: settings,
      });
      setData(saved);
      toast.success('Settings saved');
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) {
        const fromApi: Errors = {};
        for (const issue of err.issues) {
          const key = issue.path.join('.');
          fromApi[key] ??= issue.message;
        }
        setErrors(fromApi);
      }
      setSaveError(err as ApiError);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const saveButton = (
    <Button type="submit" form="settings-form" variant="primary" busy={busy} disabled={!form}>
      Save settings
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Settings"
        description="How the store charges, ships and handles returns."
        actions={form && <div className="hidden sm:block">{saveButton}</div>}
      />
      <ErrorNote error={error} />
      {!form ? (
        !error && <Spinner />
      ) : (
        <form id="settings-form" onSubmit={onSubmit} noValidate className="space-y-6">
          <ErrorNote error={saveError} />

          <Card title="Store details" description="Shown on invoices and in emails to shoppers.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Store name" error={errors['store.name']}>
                {(id) => (
                  <Input
                    id={id}
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    aria-invalid={Boolean(errors['store.name'])}
                    maxLength={100}
                  />
                )}
              </Field>
              <Field
                label="Email"
                error={errors['store.email']}
                hint="Where shoppers can reach you."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    aria-invalid={Boolean(errors['store.email'])}
                  />
                )}
              </Field>
              <Field label="Phone" error={errors['store.phone']}>
                {(id) => (
                  <Input
                    id={id}
                    type="tel"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    aria-invalid={Boolean(errors['store.phone'])}
                    maxLength={30}
                  />
                )}
              </Field>
              <Field
                label="GSTIN"
                error={errors['store.gstNumber']}
                hint="15 characters. Leave empty if you are not registered."
              >
                {(id) => (
                  <Input
                    id={id}
                    value={form.gstNumber}
                    onChange={(e) => set('gstNumber', e.target.value.toUpperCase())}
                    aria-invalid={Boolean(errors['store.gstNumber'])}
                    maxLength={15}
                    className="uppercase"
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label="Address" error={errors['store.address']} className="sm:col-span-2">
                {(id) => (
                  <Textarea
                    id={id}
                    value={form.address}
                    onChange={(e) => set('address', e.target.value)}
                    aria-invalid={Boolean(errors['store.address'])}
                    maxLength={500}
                    rows={3}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card title="Shipping" description="What shoppers pay for delivery.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Shipping fee (₹)"
                error={errors['shipping.flatFee']}
                hint="One flat fee per order. 0 for free shipping on everything."
              >
                {(id) => (
                  <RupeeInput
                    id={id}
                    value={form.flatFee}
                    onChange={(v) => set('flatFee', v)}
                    invalid={Boolean(errors['shipping.flatFee'])}
                  />
                )}
              </Field>
              <div className="space-y-3">
                <Field
                  label="Free shipping from (₹)"
                  error={errors['shipping.freeFrom']}
                  hint={
                    form.neverFree
                      ? 'Every order pays the shipping fee.'
                      : 'Orders worth this much or more ship free.'
                  }
                >
                  {(id) => (
                    <RupeeInput
                      id={id}
                      value={form.neverFree ? '' : form.freeFrom}
                      onChange={(v) => set('freeFrom', v)}
                      invalid={Boolean(errors['shipping.freeFrom'])}
                      disabled={form.neverFree}
                    />
                  )}
                </Field>
                <SwitchRow
                  label="Never free"
                  checked={form.neverFree}
                  onChange={(v) => set('neverFree', v)}
                />
              </div>
            </div>
          </Card>

          <Card title="Cash on delivery" description="Let shoppers pay the courier in cash.">
            <div className="space-y-4">
              <SwitchRow
                label="Offer cash on delivery"
                checked={form.codEnabled}
                onChange={(v) => set('codEnabled', v)}
              />
              <Field
                label="COD charge (₹)"
                error={errors['cod.fee']}
                hint="Added to cash orders. 0 for no charge."
                className="sm:max-w-xs"
              >
                {(id) => (
                  <RupeeInput
                    id={id}
                    value={form.codFee}
                    onChange={(v) => set('codFee', v)}
                    invalid={Boolean(errors['cod.fee'])}
                    disabled={!form.codEnabled}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card
            title="Returns"
            description="How long shoppers have to ask for a return or exchange."
          >
            <Field
              label="Return window (days)"
              error={errors['returns.windowDays']}
              hint="Counted from delivery. 0 turns off online return requests."
              className="sm:max-w-xs"
            >
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={form.windowDays}
                  onChange={(e) => set('windowDays', e.target.value)}
                  aria-invalid={Boolean(errors['returns.windowDays'])}
                />
              )}
            </Field>
          </Card>

          <Card title="Fulfilment">
            <SwitchRow
              label="Book paid orders with Shiprocket automatically"
              hint="When off, you book each order yourself from its page."
              checked={form.autoShip}
              onChange={(v) => set('autoShip', v)}
            />
          </Card>

          <Card title="Inventory">
            <Field
              label="Low stock threshold"
              error={errors['inventory.lowStockThreshold']}
              hint="A size or colour with this many units or fewer counts as low stock."
              className="sm:max-w-xs"
            >
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={form.lowStockThreshold}
                  onChange={(e) => set('lowStockThreshold', e.target.value)}
                  aria-invalid={Boolean(errors['inventory.lowStockThreshold'])}
                />
              )}
            </Field>
          </Card>

          {data && (
            <Card
              title="Integrations"
              description={
                <>
                  Keys for these services are set in the server environment, not here. See the
                  README and <code className="text-xs">apps/api/.env.example</code>.
                </>
              }
            >
              <dl className="divide-y divide-line text-sm">
                <IntegrationRow
                  name="Payments"
                  info={integrationLabels.payments[data.integrations.payments]}
                />
                <IntegrationRow
                  name="Shipping"
                  info={integrationLabels.shipping[data.integrations.shipping]}
                />
                <IntegrationRow
                  name="Email"
                  info={integrationLabels.email[data.integrations.email]}
                />
              </dl>
            </Card>
          )}

          <div className="flex justify-end">{saveButton}</div>
        </form>
      )}
    </>
  );
}

function RupeeInput({
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">
        ₹
      </span>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        disabled={disabled}
        className="pl-7 disabled:opacity-50"
      />
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex">
        <Switch checked={checked} onChange={onChange} label={label} />
      </span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function IntegrationRow({
  name,
  info,
}: {
  name: string;
  info: { label: string; tone: 'green' | 'amber' | 'neutral'; note: string };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
      <dt className="font-medium">{name}</dt>
      <dd className="flex items-center gap-2 text-muted">
        <span className="text-xs">{info.note}</span>
        <Badge tone={info.tone}>{info.label}</Badge>
      </dd>
    </div>
  );
}
