'use client';

import type { ProductStatus } from '@noors/shared';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { SortableList } from '../SortableList';
import { Thumb } from '../Thumb';
import { Badge, StatusBadge, cx } from '../ui';

/** Square icon-only button for row actions. */
export function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md transition hover:bg-surface',
        danger ? 'text-red-700 dark:text-red-400' : 'text-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function ViewOnlyNote() {
  return (
    <p className="mb-4 rounded-md border border-line bg-background px-3 py-2 text-sm text-muted">
      You have view-only access here. Ask an owner to make changes.
    </p>
  );
}

/** A SortableList for owners; the same rows without drag handles when `locked`. */
export function OrderList<T>({
  items,
  getKey,
  onReorder,
  renderItem,
  locked,
}: {
  items: T[];
  getKey: (item: T) => string;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  locked?: boolean;
}) {
  if (!locked)
    return (
      <SortableList items={items} getKey={getKey} onReorder={onReorder} renderItem={renderItem} />
    );
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li
          key={getKey(item)}
          className="flex items-center rounded-lg border border-line bg-background p-2 pr-3 pl-3"
        >
          <div className="min-w-0 flex-1">{renderItem(item, i)}</div>
        </li>
      ))}
    </ul>
  );
}

export interface ProductLite {
  id: string;
  name: string;
  imageUrl: string | null;
  status: ProductStatus;
}

/** One product in a merchandised list: thumb, name, status, a store-visibility warning and remove. */
export function ProductLine({
  product,
  index,
  onRemove,
}: {
  product: ProductLite;
  index?: number;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {index !== undefined && (
        <span className="w-5 text-right text-xs text-subtle tabular-nums">{index + 1}</span>
      )}
      <Thumb src={product.imageUrl} alt="" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={product.status} />
          {product.status !== 'ACTIVE' && <Badge tone="amber">Not shown on the store</Badge>}
        </div>
      </div>
      {onRemove && (
        <IconButton label={`Remove ${product.name}`} onClick={onRemove}>
          <X className="size-4" />
        </IconButton>
      )}
    </div>
  );
}

/** Two or more mutually exclusive options shown as a segmented control. */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: V;
  onChange: (value: V) => void;
  options: { value: V; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-line bg-surface p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-8 rounded px-3 text-sm font-medium transition disabled:cursor-not-allowed',
            value === o.value ? 'bg-background shadow-sm' : 'text-muted hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
