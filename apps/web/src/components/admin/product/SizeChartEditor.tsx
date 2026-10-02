'use client';

import type { SizeChartRow } from '@noors/shared';
import { Plus, X } from 'lucide-react';
import { Button, Input } from '../ui';

const COLUMNS = [
  { key: 'chestCm', label: 'Chest' },
  { key: 'lengthCm', label: 'Length' },
  { key: 'shoulderCm', label: 'Shoulder' },
  { key: 'sleeveCm', label: 'Sleeve' },
] as const;

type MeasureKey = (typeof COLUMNS)[number]['key'];

/** One editable row; every cell is the raw text the admin typed. */
export type SizeChartDraft = { key: string; size: string } & Record<MeasureKey, string>;

let nextKey = 1;
const newKey = () => `row-${nextKey++}`;

export function toSizeChartDrafts(rows: SizeChartRow[] | null): SizeChartDraft[] {
  return (rows ?? []).map((r) => ({
    key: newKey(),
    size: r.size,
    chestCm: r.chestCm?.toString() ?? '',
    lengthCm: r.lengthCm?.toString() ?? '',
    shoulderCm: r.shoulderCm?.toString() ?? '',
    sleeveCm: r.sleeveCm?.toString() ?? '',
  }));
}

const isMeasure = (text: string) => text.trim() === '' || /^\d+(\.\d+)?$/.test(text.trim());

/** Parsed rows, or an error message. No rows means "no size chart" (null). */
export function parseSizeChart(
  drafts: SizeChartDraft[],
): { value: SizeChartRow[] | null } | { error: string } {
  if (!drafts.length) return { value: null };
  for (const d of drafts) {
    if (!d.size.trim()) return { error: 'Every size chart row needs a size' };
    if (COLUMNS.some((c) => !isMeasure(d[c.key])))
      return { error: `Size ${d.size}: measurements must be numbers in cm` };
  }
  return {
    value: drafts.map((d) => {
      const row: SizeChartRow = { size: d.size.trim() };
      for (const c of COLUMNS) row[c.key] = d[c.key].trim() ? Number(d[c.key]) : null;
      return row;
    }),
  };
}

/** Grid editor for the size chart: size + chest/length/shoulder/sleeve in cm. */
export function SizeChartEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: SizeChartDraft[];
  onChange: (rows: SizeChartDraft[]) => void;
  disabled?: boolean;
}) {
  const set = (i: number, patch: Partial<SizeChartDraft>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pr-2 pb-1.5 font-medium">Size</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="pr-2 pb-1.5 font-medium">
                    {c.label} <span className="text-subtle">cm</span>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.key}>
                  <td className="py-1 pr-2">
                    <Input
                      aria-label={`Row ${i + 1} size`}
                      value={row.size}
                      onChange={(e) => set(i, { size: e.target.value })}
                      maxLength={20}
                      placeholder="M"
                      disabled={disabled}
                      aria-invalid={!row.size.trim()}
                      className="h-9!"
                    />
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="py-1 pr-2">
                      <Input
                        aria-label={`Row ${i + 1} ${c.label.toLowerCase()} (cm)`}
                        value={row[c.key]}
                        onChange={(e) => set(i, { [c.key]: e.target.value })}
                        inputMode="decimal"
                        disabled={disabled}
                        aria-invalid={!isMeasure(row[c.key])}
                        className="h-9!"
                      />
                    </td>
                  ))}
                  <td className="py-1">
                    {!disabled && (
                      <button
                        type="button"
                        aria-label={`Remove row ${i + 1}`}
                        onClick={() => onChange(rows.filter((_, j) => j !== i))}
                        className="rounded p-1.5 text-subtle hover:bg-surface hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!disabled && rows.length < 20 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange([
              ...rows,
              { key: newKey(), size: '', chestCm: '', lengthCm: '', shoulderCm: '', sleeveCm: '' },
            ])
          }
        >
          <Plus className="size-3.5" aria-hidden /> Add size row
        </Button>
      )}
      {!rows.length && disabled && <p className="text-sm text-muted">No size chart.</p>}
    </div>
  );
}
