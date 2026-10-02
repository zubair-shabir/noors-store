'use client';

import type { AdminFeaturedDto } from '@noors/shared';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useIsOwner } from '@/components/admin/AdminShell';
import { OrderList, ProductLine, ViewOnlyNote } from '@/components/admin/merch/parts';
import { ProductPicker } from '@/components/admin/ProductPicker';
import { Button, EmptyState, ErrorNote, PageHeader, Spinner } from '@/components/admin/ui';
import { adminFetch, useAdminData } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';

const MAX_FEATURED = 50;

export default function FeaturedPage() {
  const { data, error } = useAdminData<{ items: AdminFeaturedDto[] }>('/featured');

  if (!data) {
    return (
      <>
        <PageHeader title="Featured products" />
        {error ? <ErrorNote error={error} /> : <Spinner />}
      </>
    );
  }
  return <FeaturedEditor initial={data.items} />;
}

const idsOf = (items: AdminFeaturedDto[]) => items.map((p) => p.id).join(',');

function FeaturedEditor({ initial }: { initial: AdminFeaturedDto[] }) {
  const isOwner = useIsOwner();
  const [items, setItems] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = idsOf(items) !== idsOf(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    setBusy(true);
    try {
      const res = await adminFetch<{ items: AdminFeaturedDto[] }>('/featured', {
        method: 'PUT',
        body: { productIds: items.map((p) => p.id) },
      });
      setItems(res.items);
      setSaved(res.items);
      toast.success('Featured products saved');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <title>Featured | Noor&apos;s dashboard</title>
      <PageHeader
        title="Featured products"
        description="Shown on the home page, in this order."
        actions={
          isOwner && (
            <>
              {dirty && (
                <Button variant="ghost" onClick={() => setItems(saved)} disabled={busy}>
                  Discard
                </Button>
              )}
              <Button
                variant={dirty ? 'primary' : 'secondary'}
                onClick={save}
                busy={busy}
                disabled={!dirty}
              >
                {dirty ? 'Save changes' : 'Saved'}
              </Button>
            </>
          )
        }
      />
      {!isOwner && <ViewOnlyNote />}
      <div className="space-y-3">
        {items.length === 0 ? (
          <EmptyState title="Nothing featured">
            Add products to show them on the home page.
          </EmptyState>
        ) : (
          <OrderList
            items={items}
            getKey={(p) => p.id}
            locked={!isOwner}
            onReorder={setItems}
            renderItem={(p, i) => (
              <ProductLine
                product={p}
                index={i}
                onRemove={isOwner ? () => setItems(items.filter((x) => x.id !== p.id)) : undefined}
              />
            )}
          />
        )}
        {isOwner && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setPickerOpen(true)} disabled={items.length >= MAX_FEATURED}>
              <Plus className="size-4" /> Add products
            </Button>
            {dirty && <span className="text-sm text-muted">Unsaved changes</span>}
          </div>
        )}
      </div>
      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedIds={items.map((p) => p.id)}
        onPick={(p) =>
          setItems((list) =>
            list.length >= MAX_FEATURED
              ? list
              : [
                  ...list,
                  { id: p.id, name: p.name, slug: p.slug, status: p.status, imageUrl: p.imageUrl },
                ],
          )
        }
      />
    </>
  );
}
