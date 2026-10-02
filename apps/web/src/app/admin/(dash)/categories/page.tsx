'use client';

import type { AdminCategoryDto, CategoryInput } from '@noors/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useIsOwner } from '@/components/admin/AdminShell';
import { ImageField } from '@/components/admin/ImageField';
import {
  fieldError,
  formLevelError,
  useNameSlug,
  useOrderSaver,
} from '@/components/admin/merch/hooks';
import { IconButton, OrderList, ViewOnlyNote } from '@/components/admin/merch/parts';
import { Thumb } from '@/components/admin/Thumb';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Textarea,
} from '@/components/admin/ui';
import { adminFetch, useAdminData } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';

type Categories = { items: AdminCategoryDto[] };

export default function CategoriesPage() {
  const isOwner = useIsOwner();
  const { data, error, setData, reload } = useAdminData<Categories>('/categories');
  // `n` remounts the dialog on every open so its form starts from the chosen category.
  const [dialog, setDialog] = useState<{
    open: boolean;
    category: AdminCategoryDto | null;
    n: number;
  }>({
    open: false,
    category: null,
    n: 0,
  });
  const [deleting, setDeleting] = useState<AdminCategoryDto | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const reorder = useOrderSaver<AdminCategoryDto>(
    (items) => setData({ items }),
    (items) =>
      adminFetch('/categories/order', { method: 'PUT', body: { ids: items.map((c) => c.id) } }),
  );

  const openDialog = (category: AdminCategoryDto | null) =>
    setDialog((d) => ({ open: true, category, n: d.n + 1 }));

  async function confirmDelete() {
    if (!deleting || !data) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await adminFetch(`/categories/${deleting.id}`, { method: 'DELETE' });
      setData({ items: data.items.filter((c) => c.id !== deleting.id) });
      toast.success(`Deleted ${deleting.name}`);
      setDeleting(null);
    } catch (err) {
      setDeleteError(err as Error);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <title>Categories | Noor&apos;s dashboard</title>
      <PageHeader
        title="Categories"
        description={
          isOwner ? 'Drag to change the order shown on the store.' : 'The order shown on the store.'
        }
        actions={
          isOwner && (
            <Button variant="primary" onClick={() => openDialog(null)}>
              <Plus className="size-4" /> New category
            </Button>
          )
        }
      />
      {!isOwner && <ViewOnlyNote />}
      {error && !data ? (
        <ErrorNote error={error} />
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="No categories yet">
          Every product belongs to a category. Create the first one.
        </EmptyState>
      ) : (
        <OrderList
          items={data.items}
          getKey={(c) => c.id}
          locked={!isOwner}
          onReorder={(next) => reorder(data.items, next)}
          renderItem={(c) => (
            <div className="flex items-center gap-3">
              <Thumb src={c.imageUrl} alt="" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted">
                  /{c.slug} · {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
                </p>
              </div>
              {isOwner && (
                <>
                  <IconButton label={`Edit ${c.name}`} onClick={() => openDialog(c)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${c.name}`}
                    danger
                    onClick={() => {
                      setDeleteError(null);
                      setDeleting(c);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </>
              )}
            </div>
          )}
        />
      )}

      <CategoryDialog
        key={dialog.n}
        open={dialog.open}
        category={dialog.category}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
        onSaved={reload}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete category?"
        busy={deleteBusy}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        body={
          <div className="space-y-3">
            <p>
              <strong className="text-foreground">{deleting?.name}</strong> will be removed from the
              store. A category that still has products can&apos;t be deleted.
            </p>
            <ErrorNote error={deleteError ?? undefined} />
          </div>
        }
      />
    </>
  );
}

function CategoryDialog({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: AdminCategoryDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const { name, slug, setName, setSlug } = useNameSlug({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
  });
  const [description, setDescription] = useState(category?.description ?? '');
  const [imageUrl, setImageUrl] = useState(category?.imageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: CategoryInput = { name, slug, description: description || null, imageUrl };
    try {
      if (category) await adminFetch(`/categories/${category.id}`, { method: 'PATCH', body });
      else await adminFetch('/categories', { body });
      toast.success(category ? 'Category saved' : `Created ${name.trim()}`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? 'Edit category' : 'New category'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} busy={busy}>
            {category ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <ErrorNote error={formLevelError(error, ['name', 'slug', 'description', 'imageUrl'])} />
        <Field label="Name" error={fieldError(error, 'name')}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          )}
        </Field>
        <Field
          label="Slug"
          hint={`Store address: /shop/${slug || '…'}`}
          error={fieldError(error, 'slug')}
        >
          {(id) => (
            <Input id={id} value={slug} onChange={(e) => setSlug(e.target.value)} required />
          )}
        </Field>
        <Field label="Description" hint="Optional." error={fieldError(error, 'description')}>
          {(id) => (
            <Textarea
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <ImageField value={imageUrl} onChange={setImageUrl} />
      </form>
    </Modal>
  );
}
