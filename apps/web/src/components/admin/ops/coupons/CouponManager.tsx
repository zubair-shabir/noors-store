'use client';

import type { AdminCouponDto, CouponInput } from '@noors/shared';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { adminFetch, ApiError, paiseToRupees, rupeesToPaise, useAdminData } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Switch,
} from '../../ui';
import { formatDate } from '../format';

/** "2026-10-03" in India for an ISO time; the coupon form works in whole days. */
const istDay = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '';

function couponState(c: AdminCouponDto): { label: string; tone: 'green' | 'amber' | 'neutral' } {
  const now = Date.now();
  if (!c.isActive) return { label: 'Off', tone: 'neutral' };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now)
    return { label: 'Expired', tone: 'neutral' };
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit)
    return { label: 'Used up', tone: 'neutral' };
  if (c.startsAt && new Date(c.startsAt).getTime() > now)
    return { label: 'Scheduled', tone: 'amber' };
  return { label: 'Live', tone: 'green' };
}

/** Discount codes: list, create, edit, switch off and delete. Owners only. */
export function CouponManager() {
  const { data, error, loading, reload } = useAdminData<{ items: AdminCouponDto[] }>('/coupons');
  const [editing, setEditing] = useState<AdminCouponDto | 'new' | null>(null);
  const [removing, setRemoving] = useState<AdminCouponDto | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      const { deleted } = await adminFetch<{ deleted: boolean }>(`/coupons/${removing.id}`, {
        method: 'DELETE',
      });
      toast.success(
        deleted
          ? `Deleted ${removing.code}`
          : `${removing.code} has been used, so it was switched off`,
      );
      setRemoving(null);
      reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Coupons"
        description="Codes shoppers can enter at checkout."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            New coupon
          </Button>
        }
      />
      <ErrorNote error={error} />
      {loading && !data ? (
        <Spinner />
      ) : data && !data.items.length ? (
        <EmptyState title="No coupons yet">Create one to offer a discount at checkout.</EmptyState>
      ) : data ? (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line bg-surface text-xs text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Discount</th>
                <th className="px-4 py-3 font-medium">Used</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((c) => {
                const state = couponState(c);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono font-medium">{c.code}</td>
                    <td className="px-4 py-3">
                      {c.description}
                      {c.firstOrderOnly && (
                        <span className="block text-xs text-muted">First order only</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {c.usedCount}
                      {c.usageLimit !== null && ` / ${c.usageLimit}`}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {c.startsAt || c.expiresAt
                        ? `${c.startsAt ? formatDate(c.startsAt) : 'Now'} to ${c.expiresAt ? formatDate(c.expiresAt) : 'no end'}`
                        : 'Always'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(c)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {editing && (
        <CouponForm
          coupon={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        title={`Delete ${removing?.code ?? ''}?`}
        body="A coupon that has been used on an order is switched off instead, so past orders keep their record."
        busy={busy}
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

function CouponForm({
  coupon,
  onClose,
  onSaved,
}: {
  coupon: AdminCouponDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(coupon?.code ?? '');
  const [type, setType] = useState<'PERCENT' | 'FLAT'>(coupon?.type ?? 'PERCENT');
  const [value, setValue] = useState(
    coupon ? (coupon.type === 'FLAT' ? paiseToRupees(coupon.value) : String(coupon.value)) : '',
  );
  const [minOrder, setMinOrder] = useState(paiseToRupees(coupon?.minOrderValue));
  const [maxDiscount, setMaxDiscount] = useState(paiseToRupees(coupon?.maxDiscount));
  const [usageLimit, setUsageLimit] = useState(coupon?.usageLimit?.toString() ?? '');
  const [firstOrderOnly, setFirstOrderOnly] = useState(coupon?.firstOrderOnly ?? false);
  const [startsOn, setStartsOn] = useState(istDay(coupon?.startsAt ?? null));
  const [endsOn, setEndsOn] = useState(istDay(coupon?.expiresAt ?? null));
  const [isActive, setIsActive] = useState(coupon?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();

  async function save(e: FormEvent) {
    e.preventDefault();
    const money = (text: string, field: string) => {
      const paise = rupeesToPaise(text);
      if (paise === undefined)
        throw new ApiError(400, 'validation_error', 'Enter an amount in rupees', [
          { path: [field], message: 'Enter an amount in rupees' },
        ]);
      return paise;
    };
    setBusy(true);
    setError(undefined);
    try {
      const body: CouponInput = {
        code,
        type,
        value: type === 'FLAT' ? (money(value, 'value') ?? 0) : Number(value),
        minOrderValue: money(minOrder, 'minOrderValue'),
        maxDiscount: type === 'PERCENT' ? money(maxDiscount, 'maxDiscount') : null,
        usageLimit: usageLimit ? Number(usageLimit) : null,
        firstOrderOnly,
        // Whole days in India: from the start of the first day to the end of the last.
        startsAt: startsOn ? `${startsOn}T00:00:00+05:30` : null,
        expiresAt: endsOn ? `${endsOn}T23:59:59+05:30` : null,
        isActive,
      };
      await adminFetch(coupon ? `/coupons/${coupon.id}` : '/coupons', {
        method: coupon ? 'PUT' : 'POST',
        body,
      });
      toast.success(coupon ? 'Coupon saved' : `Created ${code.trim().toUpperCase()}`);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      else toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={coupon ? `Edit ${coupon.code}` : 'New coupon'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="coupon-form" busy={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="coupon-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {error && !error.issues.length && (
          <div className="sm:col-span-2">
            <ErrorNote error={error} />
          </div>
        )}
        <Field label="Code" hint="Shoppers type this at checkout" error={error?.fieldError('code')}>
          {(id) => (
            <Input
              id={id}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EID20"
              className="font-mono uppercase"
            />
          )}
        </Field>
        <Field label="Discount type">
          {(id) => (
            <Select
              id={id}
              value={type}
              onChange={(e) => setType(e.target.value as 'PERCENT' | 'FLAT')}
            >
              <option value="PERCENT">Percent off</option>
              <option value="FLAT">Rupees off</option>
            </Select>
          )}
        </Field>
        <Field
          label={type === 'PERCENT' ? 'Percent off' : 'Rupees off'}
          error={error?.fieldError('value')}
        >
          {(id) => (
            <Input
              id={id}
              required
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'PERCENT' ? '20' : '500'}
            />
          )}
        </Field>
        {type === 'PERCENT' ? (
          <Field
            label="Most it can take off (₹)"
            hint="Leave empty for no cap"
            error={error?.fieldError('maxDiscount')}
          >
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value)}
              />
            )}
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field
          label="Minimum order (₹)"
          hint="Leave empty for any order"
          error={error?.fieldError('minOrderValue')}
        >
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={minOrder}
              onChange={(e) => setMinOrder(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Total uses allowed"
          hint="Leave empty for no limit"
          error={error?.fieldError('usageLimit')}
        >
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Starts on"
          hint="Leave empty to start now"
          error={error?.fieldError('startsAt')}
        >
          {(id) => (
            <Input
              id={id}
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Last day"
          hint="Leave empty for no end"
          error={error?.fieldError('expiresAt')}
        >
          {(id) => (
            <Input id={id} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          )}
        </Field>
        <label className="flex items-center justify-between gap-4 rounded-md border border-line px-3 py-2.5 text-sm sm:col-span-2">
          <span>
            First order only
            <span className="block text-xs text-muted">For shoppers who have never ordered</span>
          </span>
          <Switch checked={firstOrderOnly} onChange={setFirstOrderOnly} label="First order only" />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-md border border-line px-3 py-2.5 text-sm sm:col-span-2">
          <span>
            On
            <span className="block text-xs text-muted">Switch off to stop the code working</span>
          </span>
          <Switch checked={isActive} onChange={setIsActive} label="Coupon on" />
        </label>
      </form>
    </Modal>
  );
}
