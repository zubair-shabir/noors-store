'use client';

import type { AdminProductDto, ProductOptionsInput } from '@noors/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { adminFetch, rupeesToPaise } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { Badge, Button, Card, ConfirmDialog, Field, Input, cx } from '../ui';
import { ChipInput } from './ChipInput';
import { isColourOption, optionsKey, planVariants, type OptionDraft } from './variant-plan';

const MAX_OPTIONS = 3;
let nextKey = 1;

function draftsOf(product: AdminProductDto): OptionDraft[] {
  return product.options.map((o) => ({
    key: `opt-${nextKey++}`,
    name: o.name,
    values: o.values.map((v) => ({ value: v.value, swatch: v.swatch })),
  }));
}

function validate(drafts: OptionDraft[]): string | undefined {
  const names = drafts.map((o) => o.name.trim().toLowerCase());
  if (names.some((n) => !n)) return 'Give every option a name';
  if (new Set(names).size !== names.length) return 'Option names must be different';
  const empty = drafts.find((o) => !o.values.length);
  if (empty) return `Add at least one value to ${empty.name}`;
}

/** Options such as Size and Colour. Saving regenerates the variant grid. */
export function OptionsCard({
  product,
  readOnly,
  onSaved,
}: {
  product: AdminProductDto;
  readOnly: boolean;
  onSaved: (product: AdminProductDto) => void;
}) {
  const [drafts, setDrafts] = useState(() => draftsOf(product));
  const [defaultPrice, setDefaultPrice] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = optionsKey(drafts) !== optionsKey(product.options);
  const error = validate(drafts);
  const plan = planVariants(product, drafts);
  const pricePaise = rupeesToPaise(defaultPrice);

  const update = (i: number, patch: Partial<OptionDraft>) =>
    setDrafts((d) => d.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  async function save() {
    setConfirm(false);
    setBusy(true);
    const body: ProductOptionsInput = {
      options: drafts.map((o) => ({
        name: o.name.trim(),
        values: o.values.map((v) => ({ value: v.value, swatch: v.swatch })),
      })),
      ...(typeof pricePaise === 'number' ? { defaultPrice: pricePaise } : {}),
    };
    try {
      const saved = await adminFetch<AdminProductDto>(`/products/${product.id}/options`, {
        method: 'PUT',
        body,
      });
      toast.success(`Saved · ${saved.variants.length} variants`);
      onSaved(saved);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  }

  return (
    <Card
      title="Options"
      description="Up to three, such as Size and Colour. Each combination becomes a variant."
      actions={dirty && !readOnly && <Badge tone="amber">Unsaved changes</Badge>}
    >
      <div className="space-y-4">
        {drafts.length === 0 && (
          <p className="text-sm text-muted">
            This product has a single variant. Add options if it comes in sizes or colours.
          </p>
        )}

        {drafts.map((option, i) => {
          const swatches = isColourOption(option.name) || option.values.some((v) => v.swatch);
          return (
            <div
              key={option.key}
              className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[180px_1fr_auto] sm:items-start"
            >
              <Input
                aria-label={`Option ${i + 1} name`}
                value={option.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder={i === 0 ? 'Size' : i === 1 ? 'Colour' : 'Fit'}
                maxLength={40}
                disabled={readOnly}
                list="option-name-suggestions"
              />
              <div>
                <ChipInput
                  values={option.values.map((v) => v.value)}
                  onChange={(values) =>
                    update(i, {
                      values: values.map(
                        (value) =>
                          option.values.find((v) => v.value === value) ?? { value, swatch: null },
                      ),
                    })
                  }
                  normalize={(v) => v.trim().slice(0, 40)}
                  max={30}
                  placeholder={swatches ? 'Olive, Black…' : 'S, M, L…'}
                  disabled={readOnly}
                  invalid={!option.values.length}
                  renderChip={
                    swatches
                      ? (value, j) => (
                          <SwatchPicker
                            value={option.values[j]?.swatch ?? null}
                            label={`${value} swatch`}
                            disabled={readOnly}
                            onChange={(swatch) =>
                              update(i, {
                                values: option.values.map((v, k) =>
                                  k === j ? { ...v, swatch } : v,
                                ),
                              })
                            }
                          />
                        )
                      : undefined
                  }
                />
                {swatches && !readOnly && (
                  <p className="mt-1 text-xs text-muted">Click a dot to set its colour.</p>
                )}
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove option ${option.name || i + 1}`}
                  onClick={() => setDrafts((d) => d.filter((_, j) => j !== i))}
                  className="justify-self-end sm:mt-1"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          );
        })}
        <datalist id="option-name-suggestions">
          <option value="Size" />
          <option value="Colour" />
          <option value="Fit" />
          <option value="Material" />
        </datalist>

        {!readOnly && (
          <>
            {drafts.length < MAX_OPTIONS && (
              <Button
                size="sm"
                onClick={() =>
                  setDrafts((d) => [...d, { key: `opt-${nextKey++}`, name: '', values: [] }])
                }
              >
                <Plus className="size-3.5" aria-hidden /> Add option
              </Button>
            )}

            {dirty && (
              <div className="flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
                <Field
                  label="New variant price (₹)"
                  hint="Optional. Defaults to the lowest current price."
                  error={pricePaise === undefined ? 'Enter an amount like 2499' : undefined}
                  className="sm:w-64"
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={defaultPrice}
                      onChange={(e) => setDefaultPrice(e.target.value)}
                      inputMode="decimal"
                      placeholder="2499"
                      aria-invalid={pricePaise === undefined}
                    />
                  )}
                </Field>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <p
                    className={cx(
                      'text-sm',
                      error ? 'text-red-700 dark:text-red-400' : 'text-muted',
                    )}
                  >
                    {error ?? <PlanSummary {...plan} />}
                  </p>
                  <Button
                    variant="primary"
                    busy={busy}
                    disabled={Boolean(error) || pricePaise === undefined}
                    onClick={() => (plan.removed > 0 ? setConfirm(true) : save())}
                  >
                    Save options &amp; generate variants
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        title={`Remove ${plan.removed} ${plan.removed === 1 ? 'variant' : 'variants'}?`}
        body={
          <>
            <PlanSummary {...plan} /> Removed variants lose their stock, SKU and prices, and images
            linked to removed values are unlinked.
          </>
        }
        confirmLabel="Save and remove"
        busy={busy}
        onConfirm={save}
        onClose={() => setConfirm(false)}
      />
    </Card>
  );
}

function PlanSummary({ total, kept, created, removed }: ReturnType<typeof planVariants>) {
  const parts = [`${kept} kept`];
  if (created) parts.push(`${created} new`);
  if (removed) parts.push(`${removed} removed`);
  return (
    <span>
      {total} {total === 1 ? 'variant' : 'variants'}: {parts.join(', ')}.
    </span>
  );
}

/** A dot that opens the native colour picker. Empty dots show a dashed ring. */
function SwatchPicker({
  value,
  label,
  onChange,
  disabled,
}: {
  value: string | null;
  label: string;
  onChange: (hex: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx(
        'relative inline-block size-4 shrink-0 rounded-full',
        value ? 'ring-1 ring-black/15 dark:ring-white/20' : 'border border-dashed border-subtle',
        !disabled && 'cursor-pointer',
      )}
      style={value ? { backgroundColor: value } : undefined}
      title={value ?? 'Set colour'}
    >
      <input
        type="color"
        aria-label={label}
        value={value ?? '#000000'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  );
}
