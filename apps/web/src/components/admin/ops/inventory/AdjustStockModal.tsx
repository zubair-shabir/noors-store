'use client';

import type { AdminStockRowDto, StockAdjustInput, StockReason } from '@noors/shared';
import { useState, type FormEvent } from 'react';
import { adminFetch, type ApiError } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { Button, cx, ErrorNote, Field, Input, Modal, Select, Textarea } from '../../ui';

export const STOCK_REASONS: { value: StockReason; label: string }[] = [
  { value: 'restock', label: 'New stock arrived' },
  { value: 'damaged', label: 'Damaged or lost' },
  { value: 'correction', label: 'Stock count correction' },
  { value: 'return', label: 'Returned by customer' },
  { value: 'other', label: 'Other' },
];

/** Adds or removes units of one variant. Keyed by variant so the form resets each time. */
export function AdjustStockModal({
  row,
  onClose,
  onDone,
}: {
  row: AdminStockRowDto | null;
  onClose: () => void;
  onDone: (variantId: string, stock: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={Boolean(row)}
      onClose={onClose}
      title="Adjust stock"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="adjust-stock-form" variant="primary" busy={busy}>
            Save
          </Button>
        </>
      }
    >
      {row && (
        <AdjustForm key={row.variantId} row={row} busy={busy} setBusy={setBusy} onDone={onDone} />
      )}
    </Modal>
  );
}

function AdjustForm({
  row,
  busy,
  setBusy,
  onDone,
}: {
  row: AdminStockRowDto;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDone: (variantId: string, stock: number) => void;
}) {
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [units, setUnits] = useState('');
  const [reason, setReason] = useState<StockReason>('restock');
  const [note, setNote] = useState('');
  const [unitsError, setUnitsError] = useState<string>();
  const [error, setError] = useState<ApiError>();

  const available = row.stock - row.reserved;
  const count = Number(units);
  const valid = /^\d+$/.test(units.trim()) && count > 0;
  const change = valid ? (direction === 'add' ? count : -count) : 0;

  function choose(next: 'add' | 'remove') {
    setDirection(next);
    // Nudge the reason to match, unless the person already picked something specific.
    if (next === 'remove' && reason === 'restock') setReason('damaged');
    if (next === 'add' && reason === 'damaged') setReason('restock');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!valid) return setUnitsError('Enter how many units, like 5');
    if (count > 10_000) return setUnitsError('That is more than 10,000 units');
    setUnitsError(undefined);
    setError(undefined);
    setBusy(true);
    try {
      const body: StockAdjustInput = {
        variantId: row.variantId,
        change,
        reason,
        note: note.trim() || undefined,
      };
      const { stock } = await adminFetch<{ stock: number }>('/inventory/adjust', { body });
      toast.success(
        `${change > 0 ? 'Added' : 'Removed'} ${Math.abs(change)} ${Math.abs(change) === 1 ? 'unit' : 'units'}. ${stock} in stock now`,
      );
      onDone(row.variantId, stock);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="adjust-stock-form" onSubmit={submit} className="space-y-4">
      <div className="rounded-md bg-surface px-3 py-2 text-sm">
        <p className="font-medium">{row.productName}</p>
        <p className="text-muted">
          {row.title} · {row.sku}
        </p>
        <p className="mt-1 text-muted">
          {row.stock} in stock
          {row.reserved > 0 && `, ${row.reserved} held, ${available} available`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md border border-line p-1" role="radiogroup">
        {(['add', 'remove'] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={direction === d}
            onClick={() => choose(d)}
            className={cx(
              'h-8 rounded text-sm font-medium transition',
              direction === d ? 'bg-foreground text-background' : 'text-muted hover:bg-surface',
            )}
          >
            {d === 'add' ? 'Add units' : 'Remove units'}
          </button>
        ))}
      </div>

      <Field
        label="Units"
        error={unitsError ?? error?.fieldError('change')}
        hint={
          valid
            ? `${row.stock} becomes ${row.stock + change} in stock`
            : direction === 'remove'
              ? `Up to ${available} can be removed`
              : undefined
        }
      >
        {(id) => (
          <Input
            id={id}
            inputMode="numeric"
            value={units}
            autoFocus
            onChange={(e) => setUnits(e.target.value)}
            aria-invalid={Boolean(unitsError)}
            placeholder="0"
          />
        )}
      </Field>

      <Field label="Reason">
        {(id) => (
          <Select id={id} value={reason} onChange={(e) => setReason(e.target.value as StockReason)}>
            {STOCK_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Note" hint="Optional. Shows in the stock history.">
        {(id) => (
          <Textarea
            id={id}
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-16"
          />
        )}
      </Field>

      <ErrorNote error={error} />
    </form>
  );
}
