'use client';

import { GripVertical } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import type { ReactNode } from 'react';

/** Vertical drag-to-reorder list. Items are dragged by their grip handle only. */
export function SortableList<T>({
  items,
  getKey,
  onReorder,
  renderItem,
}: {
  items: T[];
  getKey: (item: T) => string;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  return (
    <Reorder.Group axis="y" values={items} onReorder={onReorder} className="space-y-2">
      {items.map((item, i) => (
        <SortableRow key={getKey(item)} value={item}>
          {renderItem(item, i)}
        </SortableRow>
      ))}
    </Reorder.Group>
  );
}

function SortableRow<T>({ value, children }: { value: T; children: ReactNode }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={value}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 rounded-lg border border-line bg-background p-2 pr-3"
      whileDrag={{ scale: 1.01, boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)' }}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none rounded p-1 text-subtle hover:bg-surface hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </Reorder.Item>
  );
}
