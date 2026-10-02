'use client';

import type { AdminProductDto, AdminVariantDto, VariantsUpdateInput } from '@noors/shared';
import { useState } from 'react';
import { adminFetch, paiseToRupees, rupeesToPaise } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { Badge, Button, Card, Input, Switch, cx } from '../ui';

type VariantChange = VariantsUpdateInput['variants'][number];

interface Row {
  sku: string;
  price: string;
  compareAt: string;
  stock: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  isActive: boolean;
}

type RowErrors = Partial<Record<keyof Row, string>>;

const rowOf = (v: AdminVariantDto): Row => ({
  sku: v.sku,
  price: paiseToRupees(v.price),
  compareAt: paiseToRupees(v.compareAtPrice),
  stock: String(v.stock),
  weight: String(v.weightGrams),
  length: String(v.lengthCm),
  width: String(v.widthCm),
  height: String(v.heightCm),
  isActive: v.isActive,
});

const int = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : undefined);

/** Validates a row and returns the fields that changed, or the errors. */
function diffRow(v: AdminVariantDto, row: Row): { change: VariantChange; errors: RowErrors } {
  const errors: RowErrors = {};
  const change: VariantChange = { id: v.id };

  const sku = row.sku.trim();
  if (!sku) errors.sku = 'required';
  else if (sku !== v.sku) change.sku = sku;

  const price = rupeesToPaise(row.price);
  if (price === null || price === undefined) errors.price = 'enter an amount like 2499';
  else if (price !== v.price) change.price = price;

  const compareAt = rupeesToPaise(row.compareAt);
  if (compareAt === undefined) errors.compareAt = 'enter an amount like 2999';
  else if (compareAt !== null && typeof price === 'number' && compareAt <= price)
    errors.compareAt = 'must be higher than the price';
  else if (compareAt !== v.compareAtPrice) change.compareAtPrice = compareAt;

  const stock = int(row.stock);
  if (stock === undefined) errors.stock = 'enter a whole number';
  else if (stock < v.reserved) errors.stock = `can't go below the ${v.reserved} held`;
  else if (stock !== v.stock) change.stock = stock;

  const dims = [
    ['weight', 'weightGrams', 50000],
    ['length', 'lengthCm', 300],
    ['width', 'widthCm', 300],
    ['height', 'heightCm', 300],
  ] as const;
  for (const [field, key, max] of dims) {
    const n = int(row[field]);
    if (n === undefined || n < 1 || n > max) errors[field] = `enter 1–${max}`;
    else if (n !== v[key]) change[key] = n;
  }

  if (row.isActive !== v.isActive) change.isActive = row.isActive;
  return { change, errors };
}

/** Price, stock and shipping size per variant, with a "set all" row for bulk edits. */
export function VariantsCard({
  product,
  stockOnly,
  onSaved,
}: {
  product: AdminProductDto;
  stockOnly: boolean;
  onSaved: (product: AdminProductDto) => void;
}) {
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(product.variants.map((v) => [v.id, rowOf(v)])),
  );
  const [bulk, setBulk] = useState({ price: '', compareAt: '', stock: '' });
  const [busy, setBusy] = useState(false);

  const results = product.variants.map((v) => ({ v, ...diffRow(v, rows[v.id]!) }));
  const changes = results.map((r) => r.change).filter((c) => Object.keys(c).length > 1);
  const invalid = results.filter((r) => Object.keys(r.errors).length > 0);

  const set = (id: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));

  function applyBulk() {
    const patch: Partial<Row> = {};
    if (bulk.price.trim()) patch.price = bulk.price.trim();
    if (bulk.compareAt.trim()) patch.compareAt = bulk.compareAt.trim();
    if (bulk.stock.trim()) patch.stock = bulk.stock.trim();
    setRows((r) =>
      Object.fromEntries(Object.entries(r).map(([id, row]) => [id, { ...row, ...patch }])),
    );
    setBulk({ price: '', compareAt: '', stock: '' });
  }

  async function save() {
    setBusy(true);
    try {
      const saved = await adminFetch<AdminProductDto>(`/products/${product.id}/variants`, {
        method: 'PATCH',
        body: { variants: changes } satisfies VariantsUpdateInput,
      });
      toast.success(changes.length === 1 ? 'Variant saved' : `${changes.length} variants saved`);
      onSaved(saved);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  }

  const bulkEmpty = !bulk.price.trim() && !bulk.compareAt.trim() && !bulk.stock.trim();
  const cell = 'px-1.5 py-1.5';
  const num = 'h-9! px-2 tabular-nums';

  return (
    <Card
      title="Variants"
      description={
        stockOnly
          ? 'You can update stock. Prices and other fields are managed by the owner.'
          : 'Prices are in rupees. Inactive variants are hidden from shoppers.'
      }
      actions={
        <>
          {changes.length > 0 && (
            <Badge tone="amber">
              {changes.length} unsaved {changes.length === 1 ? 'row' : 'rows'}
            </Badge>
          )}
          <Button
            variant="primary"
            size="sm"
            busy={busy}
            disabled={!changes.length || invalid.length > 0}
            onClick={save}
          >
            Save variants
          </Button>
        </>
      }
    >
      <div className="-mx-5 -mt-5 overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-background px-5 py-2.5 font-medium">Variant</th>
              <th className={cx(cell, 'font-medium')}>SKU</th>
              <th className={cx(cell, 'font-medium')}>Price ₹</th>
              <th className={cx(cell, 'font-medium')}>Compare-at ₹</th>
              <th className={cx(cell, 'font-medium')}>Stock</th>
              <th className={cx(cell, 'font-medium')}>Weight g</th>
              <th className={cx(cell, 'font-medium')}>L × W × H cm</th>
              <th className="py-2.5 pr-5 pl-1.5 font-medium">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr className="bg-surface">
              <td className="sticky left-0 z-10 bg-surface px-5 py-1.5 text-xs font-medium text-muted">
                Set all
              </td>
              <td className={cell} />
              <td className={cell}>
                <Input
                  aria-label="Price for all variants"
                  value={bulk.price}
                  onChange={(e) => setBulk({ ...bulk, price: e.target.value })}
                  disabled={stockOnly}
                  inputMode="decimal"
                  className={cx(num, 'w-24!')}
                />
              </td>
              <td className={cell}>
                <Input
                  aria-label="Compare-at price for all variants"
                  value={bulk.compareAt}
                  onChange={(e) => setBulk({ ...bulk, compareAt: e.target.value })}
                  disabled={stockOnly}
                  inputMode="decimal"
                  className={cx(num, 'w-24!')}
                />
              </td>
              <td className={cell}>
                <Input
                  aria-label="Stock for all variants"
                  value={bulk.stock}
                  onChange={(e) => setBulk({ ...bulk, stock: e.target.value })}
                  inputMode="numeric"
                  className={cx(num, 'w-20!')}
                />
              </td>
              <td className={cell} colSpan={3}>
                <Button size="sm" disabled={bulkEmpty} onClick={applyBulk}>
                  Apply to all
                </Button>
              </td>
            </tr>
            {results.map(({ v, errors }) => {
              const row = rows[v.id]!;
              const input = (
                field: keyof Row,
                label: string,
                width: string,
                mode: 'decimal' | 'numeric' | 'text',
              ) => (
                <Input
                  aria-label={`${v.title} ${label}`}
                  value={row[field] as string}
                  onChange={(e) => set(v.id, { [field]: e.target.value })}
                  disabled={stockOnly && field !== 'stock'}
                  inputMode={mode}
                  aria-invalid={Boolean(errors[field])}
                  title={errors[field]}
                  className={cx(mode === 'text' ? 'h-9! px-2' : num, width)}
                />
              );
              return (
                <tr key={v.id} className={cx(!row.isActive && 'text-muted')}>
                  <td className="sticky left-0 z-10 bg-background px-5 py-1.5 font-medium whitespace-nowrap">
                    {v.title}
                  </td>
                  <td className={cell}>{input('sku', 'SKU', 'w-44!', 'text')}</td>
                  <td className={cell}>{input('price', 'price', 'w-24!', 'decimal')}</td>
                  <td className={cell}>
                    {input('compareAt', 'compare-at price', 'w-24!', 'decimal')}
                  </td>
                  <td className={cell}>
                    <div className="flex items-center gap-2">
                      {input('stock', 'stock', 'w-20!', 'numeric')}
                      {v.reserved > 0 && (
                        <span className="text-xs whitespace-nowrap text-muted">
                          {v.reserved} held
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={cell}>{input('weight', 'weight (g)', 'w-20!', 'numeric')}</td>
                  <td className={cell}>
                    <div className="flex items-center gap-1 text-subtle">
                      {input('length', 'length (cm)', 'w-14!', 'numeric')}×
                      {input('width', 'width (cm)', 'w-14!', 'numeric')}×
                      {input('height', 'height (cm)', 'w-14!', 'numeric')}
                    </div>
                  </td>
                  <td className="py-1.5 pr-5 pl-1.5">
                    <Switch
                      label={`${v.title} active`}
                      checked={row.isActive}
                      disabled={stockOnly}
                      onChange={(isActive) => set(v.id, { isActive })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {invalid.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-red-700 dark:text-red-400">
          {invalid.slice(0, 5).map(({ v, errors }) => (
            <li key={v.id}>
              {v.title}:{' '}
              {Object.entries(errors)
                .map(([field, message]) => `${LABELS[field as keyof Row]}: ${message}`)
                .join(' · ')}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const LABELS: Record<keyof Row, string> = {
  sku: 'SKU',
  price: 'Price',
  compareAt: 'Compare-at',
  stock: 'Stock',
  weight: 'Weight (g)',
  length: 'Length (cm)',
  width: 'Width (cm)',
  height: 'Height (cm)',
  isActive: 'Active',
};
