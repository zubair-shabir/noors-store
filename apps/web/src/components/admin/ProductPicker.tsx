'use client';

import type { AdminProductRowDto, Paginated } from '@noors/shared';
import { Check, Search } from 'lucide-react';
import { useState } from 'react';
import { useAdminData } from '@/lib/admin/api';
import { Thumb } from './Thumb';
import { Input, Modal, Spinner, StatusBadge } from './ui';

/** Search-and-pick dialog. Products already chosen are shown ticked and can't be picked twice. */
export function ProductPicker({
  open,
  onClose,
  onPick,
  selectedIds,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (product: AdminProductRowDto) => void;
  selectedIds: string[];
}) {
  const [q, setQ] = useState('');
  const { data, loading } = useAdminData<Paginated<AdminProductRowDto>>(
    open ? `/products?limit=30${q ? `&q=${encodeURIComponent(q)}` : ''}` : null,
  );

  return (
    <Modal open={open} onClose={onClose} title="Add products" wide>
      <div className="relative mb-4">
        <Search
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or SKU"
          className="pl-9"
          aria-label="Search products"
        />
      </div>
      {loading && !data ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-line">
          {data?.items.map((p) => {
            const picked = selectedIds.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={picked}
                  onClick={() => onPick(p)}
                  className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-surface disabled:opacity-60"
                >
                  <Thumb src={p.imageUrl} />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <StatusBadge status={p.status} />
                  {picked && <Check className="size-4" aria-label="Added" />}
                </button>
              </li>
            );
          })}
          {data?.items.length === 0 && (
            <li className="py-6 text-center text-sm text-muted">No products found</li>
          )}
        </ul>
      )}
    </Modal>
  );
}
