'use client';

import type { AdminCategoryDto, AdminProductDto } from '@noors/shared';
import { Copy, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { adminFetch, useAdminData } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { useIsOwner } from '../AdminShell';
import { Button, ConfirmDialog, ErrorNote, PageHeader, Spinner, StatusBadge } from '../ui';
import { DetailsCard } from './DetailsCard';
import { ImagesCard } from './ImagesCard';
import { OptionsCard } from './OptionsCard';
import { VariantsCard } from './VariantsCard';

type Section = 'details' | 'options' | 'variants' | 'images';

/** Saving options regenerates variants and can unlink images, so those cards reset too. */
const AFFECTS: Record<Section, Section[]> = {
  details: ['details'],
  options: ['options', 'variants', 'images'],
  variants: ['variants'],
  images: ['images'],
};

export function ProductEditor({ id }: { id: string }) {
  const router = useRouter();
  const isOwner = useIsOwner();
  const { data: product, error, setData } = useAdminData<AdminProductDto>(`/products/${id}`);
  const { data: categories } = useAdminData<{ items: AdminCategoryDto[] }>('/categories');

  // Each card keeps its own form state; bumping its revision re-mounts it from the saved product.
  const [revisions, setRevisions] = useState<Record<Section, number>>({
    details: 0,
    options: 0,
    variants: 0,
    images: 0,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<'duplicate' | 'delete' | null>(null);

  function onSaved(section: Section, next: AdminProductDto) {
    setData(next);
    setRevisions((r) => {
      const copy = { ...r };
      for (const s of AFFECTS[section]) copy[s] += 1;
      return copy;
    });
  }

  async function duplicate() {
    setBusy('duplicate');
    try {
      const copy = await adminFetch<AdminProductDto>(`/products/${id}/duplicate`, {
        method: 'POST',
      });
      toast.success('Duplicated as a draft');
      router.push(`/admin/products/${copy.id}`);
    } catch (err) {
      toast.error(err);
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    try {
      await adminFetch(`/products/${id}`, { method: 'DELETE' });
      toast.success('Product deleted');
      router.push('/admin/products');
    } catch (err) {
      toast.error(err);
      setBusy(null);
      setConfirmDelete(false);
    }
  }

  if (!product) {
    return error ? (
      <>
        <PageHeader title="Product" back={{ href: '/admin/products', label: 'Products' }} />
        <ErrorNote error={error} />
      </>
    ) : (
      <Spinner />
    );
  }

  return (
    <>
      <PageHeader
        title={product.name}
        back={{ href: '/admin/products', label: 'Products' }}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={product.status} />
            <span>
              {product.variants.length} {product.variants.length === 1 ? 'variant' : 'variants'}
            </span>
          </span>
        }
        actions={
          isOwner && (
            <>
              <Button busy={busy === 'duplicate'} disabled={busy !== null} onClick={duplicate}>
                <Copy className="size-4" aria-hidden /> Duplicate
              </Button>
              <Button
                variant="danger"
                disabled={busy !== null}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" aria-hidden /> Delete
              </Button>
            </>
          )
        }
      />

      <div className="space-y-6">
        <DetailsCard
          key={`details-${revisions.details}`}
          product={product}
          categories={categories?.items ?? []}
          readOnly={!isOwner}
          onSaved={(p) => onSaved('details', p)}
        />
        <OptionsCard
          key={`options-${revisions.options}`}
          product={product}
          readOnly={!isOwner}
          onSaved={(p) => onSaved('options', p)}
        />
        <VariantsCard
          key={`variants-${revisions.variants}`}
          product={product}
          stockOnly={!isOwner}
          onSaved={(p) => onSaved('variants', p)}
        />
        <ImagesCard
          key={`images-${revisions.images}`}
          product={product}
          readOnly={!isOwner}
          onSaved={(p) => onSaved('images', p)}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this product?"
        body={
          <>
            <strong className="text-foreground">{product.name}</strong> and its variants and images
            will be removed. This can&apos;t be undone. To hide it from the store instead, set its
            status to Archived.
          </>
        }
        busy={busy === 'delete'}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
