'use client';

import type { BannerDto, BannerInput, BannerPlacement } from '@noors/shared';
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useIsOwner } from '@/components/admin/AdminShell';
import { ImageField } from '@/components/admin/ImageField';
import { fieldError, formLevelError, useOrderSaver } from '@/components/admin/merch/hooks';
import { IconButton, OrderList, ViewOnlyNote } from '@/components/admin/merch/parts';
import { Thumb } from '@/components/admin/Thumb';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Switch,
} from '@/components/admin/ui';
import { adminFetch, useAdminData } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';

const placements: Record<BannerPlacement, { title: string; noun: string; help: string }> = {
  ANNOUNCEMENT: {
    title: 'Announcement bar',
    noun: 'announcement',
    help: 'The message in the bar at the very top of the store, with an optional link.',
  },
  HERO: {
    title: 'Hero',
    noun: 'hero photo',
    help: 'The photos in the home page hero strip, in this order. The first active one also supplies the two headline lines: its title and subtitle.',
  },
  CATEGORY_TILE: {
    title: 'Category tiles',
    noun: 'tile',
    help: 'The tiles in the home page category grid. Each has a photo, a title and a link such as /shop/hoodies.',
  },
};

export default function BannersPage() {
  const isOwner = useIsOwner();
  return (
    <>
      <title>Home banners | Noor&apos;s dashboard</title>
      <PageHeader
        title="Home banners"
        description="What shoppers see first. Changes go live straight away."
      />
      {!isOwner && <ViewOnlyNote />}
      <div className="space-y-6">
        <BannerSection placement="ANNOUNCEMENT" />
        <BannerSection placement="HERO" />
        <BannerSection placement="CATEGORY_TILE" />
      </div>
    </>
  );
}

function BannerSection({ placement }: { placement: BannerPlacement }) {
  const isOwner = useIsOwner();
  const meta = placements[placement];
  const { data, error, setData, reload } = useAdminData<{ items: BannerDto[] }>(
    `/banners?placement=${placement}`,
  );
  const [dialog, setDialog] = useState<{ open: boolean; banner: BannerDto | null; n: number }>({
    open: false,
    banner: null,
    n: 0,
  });
  const [deleting, setDeleting] = useState<BannerDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const reorder = useOrderSaver<BannerDto>(
    (items) => setData({ items }),
    (items) =>
      adminFetch('/banners/order', {
        method: 'PUT',
        body: { placement, ids: items.map((b) => b.id) },
      }),
  );

  const openDialog = (banner: BannerDto | null) =>
    setDialog((d) => ({ open: true, banner, n: d.n + 1 }));

  async function toggle(banner: BannerDto, isActive: boolean) {
    if (!data) return;
    const before = data.items;
    setData({ items: before.map((b) => (b.id === banner.id ? { ...b, isActive } : b)) });
    try {
      await adminFetch(`/banners/${banner.id}`, { method: 'PATCH', body: { isActive } });
    } catch (err) {
      setData({ items: before });
      toast.error(err);
    }
  }

  async function confirmDelete() {
    if (!deleting || !data) return;
    setDeleteBusy(true);
    try {
      await adminFetch(`/banners/${deleting.id}`, { method: 'DELETE' });
      setData({ items: data.items.filter((b) => b.id !== deleting.id) });
      toast.success('Banner deleted');
      setDeleting(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setDeleteBusy(false);
    }
  }

  const headlineId = placement === 'HERO' ? data?.items.find((b) => b.isActive)?.id : undefined;

  return (
    <Card title={meta.title} description={meta.help}>
      {error && !data ? (
        <ErrorNote error={error} />
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line py-6 text-center text-sm text-muted">
          Nothing here yet.
        </p>
      ) : (
        <OrderList
          items={data.items}
          getKey={(b) => b.id}
          locked={!isOwner}
          onReorder={(next) => reorder(data.items, next)}
          renderItem={(b) => (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {placement === 'ANNOUNCEMENT' ? (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface text-subtle">
                  <Megaphone className="size-4" aria-hidden />
                </span>
              ) : (
                <Thumb src={b.imageUrl} alt="" size={placement === 'HERO' ? 48 : 40} />
              )}
              <div className="min-w-0 grow basis-40">
                <p
                  className={
                    b.title ? 'truncate text-sm font-medium' : 'truncate text-sm text-subtle'
                  }
                >
                  {b.title ?? 'No title'}
                </p>
                {(b.subtitle || b.linkUrl) && (
                  <p className="truncate text-xs text-muted">
                    {[b.subtitle, b.linkUrl].filter(Boolean).join(' · ')}
                  </p>
                )}
                {(b.id === headlineId || !b.isActive) && (
                  <div className="mt-1 flex gap-1.5">
                    {b.id === headlineId && <Badge tone="green">Headline</Badge>}
                    {!b.isActive && <Badge>Hidden</Badge>}
                  </div>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <span className="mr-1 flex">
                  <Switch
                    checked={b.isActive}
                    onChange={(on) => toggle(b, on)}
                    label={`Show ${b.title ?? meta.noun}`}
                    disabled={!isOwner}
                  />
                </span>
                {isOwner && (
                  <>
                    <IconButton label="Edit" onClick={() => openDialog(b)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="Delete" danger onClick={() => setDeleting(b)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </>
                )}
              </div>
            </div>
          )}
        />
      )}
      {isOwner && (
        <Button size="sm" className="mt-3" onClick={() => openDialog(null)}>
          <Plus className="size-3.5" /> Add {meta.noun}
        </Button>
      )}

      <BannerDialog
        key={dialog.n}
        open={dialog.open}
        placement={placement}
        banner={dialog.banner}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
        onSaved={reload}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${meta.noun}?`}
        body={`${deleting?.title ? `“${deleting.title}”` : 'This banner'} will be removed from the store.`}
        busy={deleteBusy}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}

function BannerDialog({
  open,
  placement,
  banner,
  onClose,
  onSaved,
}: {
  open: boolean;
  placement: BannerPlacement;
  banner: BannerDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const meta = placements[placement];
  const [title, setTitle] = useState(banner?.title ?? '');
  const [subtitle, setSubtitle] = useState(banner?.subtitle ?? '');
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? null);
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? '');
  const [isActive, setIsActive] = useState(banner?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [missing, setMissing] = useState<Record<string, string>>({});

  /** Only the fields this placement uses; the others are left as they are. */
  function fields(): Partial<BannerInput> {
    const link = linkUrl.trim() || null;
    if (placement === 'ANNOUNCEMENT') return { title, linkUrl: link, isActive };
    if (placement === 'HERO') return { title, subtitle, imageUrl, isActive };
    return { title, imageUrl, linkUrl: link, isActive };
  }

  function check(): boolean {
    const m: Record<string, string> = {};
    if (placement === 'ANNOUNCEMENT' && !title.trim()) m.title = 'Write the message';
    if (placement !== 'ANNOUNCEMENT' && !imageUrl) m.imageUrl = 'Upload an image';
    if (placement === 'CATEGORY_TILE') {
      if (!title.trim()) m.title = 'Give the tile a title';
      if (!linkUrl.trim()) m.linkUrl = 'Where the tile leads, e.g. /shop/hoodies';
    }
    setMissing(m);
    return Object.keys(m).length === 0;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!check()) return;
    setBusy(true);
    try {
      if (banner) await adminFetch(`/banners/${banner.id}`, { method: 'PATCH', body: fields() });
      else await adminFetch('/banners', { body: { placement, ...fields() } });
      toast.success(banner ? 'Banner saved' : 'Banner added');
      onSaved();
      onClose();
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  const err = (field: string) => missing[field] ?? fieldError(error, field);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${banner ? 'Edit' : 'New'} ${meta.noun}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} busy={busy}>
            {banner ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <ErrorNote error={formLevelError(error, ['title', 'subtitle', 'imageUrl', 'linkUrl'])} />
        {placement !== 'ANNOUNCEMENT' && (
          <div className="space-y-1.5">
            <ImageField
              value={imageUrl}
              onChange={setImageUrl}
              label={placement === 'HERO' ? 'Photo' : 'Image'}
            />
            {err('imageUrl') && (
              <p className="text-xs text-red-700 dark:text-red-400">{err('imageUrl')}</p>
            )}
          </div>
        )}
        <Field
          label={
            placement === 'ANNOUNCEMENT'
              ? 'Message'
              : placement === 'HERO'
                ? 'Headline, first line'
                : 'Title'
          }
          hint={
            placement === 'HERO'
              ? 'Only used when this is the first active hero photo. Optional.'
              : undefined
          }
          error={err('title')}
        >
          {(id) => (
            <Input
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                placement === 'ANNOUNCEMENT' ? 'Free shipping on orders over ₹2,999' : undefined
              }
              aria-invalid={Boolean(err('title'))}
            />
          )}
        </Field>
        {placement === 'HERO' && (
          <Field label="Headline, second line" hint="Optional." error={err('subtitle')}>
            {(id) => (
              <Input id={id} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            )}
          </Field>
        )}
        {placement !== 'HERO' && (
          <Field
            label={placement === 'ANNOUNCEMENT' ? 'Link (optional)' : 'Link'}
            hint="A store path such as /shop/hoodies, or a full URL."
            error={err('linkUrl')}
          >
            {(id) => (
              <Input
                id={id}
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="/shop/hoodies"
                aria-invalid={Boolean(err('linkUrl'))}
              />
            )}
          </Field>
        )}
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">Show on the store</span>
          <Switch checked={isActive} onChange={setIsActive} label="Show on the store" />
        </label>
      </form>
    </Modal>
  );
}
