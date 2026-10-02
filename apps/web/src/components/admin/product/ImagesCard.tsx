'use client';

import type { AdminProductDto, ProductImagesInput } from '@noors/shared';
import { ImagePlus, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { adminFetch, uploadImage } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { SortableList } from '../SortableList';
import { Thumb } from '../Thumb';
import { Badge, Button, Card, Input, Select, cx } from '../ui';
import { isColourOption } from './variant-plan';

const MAX_IMAGES = 30;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/gif';

interface ImageDraft {
  key: string;
  url: string;
  alt: string;
  optionValueId: string | null;
}

let nextKey = 1;
const draft = (url: string, alt = '', optionValueId: string | null = null): ImageDraft => ({
  key: `img-${nextKey++}`,
  url,
  alt,
  optionValueId,
});

const galleryKey = (images: { url: string; alt: string | null; optionValueId: string | null }[]) =>
  JSON.stringify(images.map((i) => [i.url, i.alt?.trim() || null, i.optionValueId]));

/** Ordered gallery. The first image is the product's main image. */
export function ImagesCard({
  product,
  readOnly,
  onSaved,
}: {
  product: AdminProductDto;
  readOnly: boolean;
  onSaved: (product: AdminProductDto) => void;
}) {
  const [images, setImages] = useState(() =>
    product.images.map((i) => draft(i.url, i.alt ?? '', i.optionValueId)),
  );
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // Images can be tied to a colour so the store shows them when that colour is picked.
  const colourOption =
    product.options.find((o) => isColourOption(o.name)) ??
    product.options.find((o) => o.values.some((v) => v.swatch));

  const dirty = galleryKey(images) !== galleryKey(product.images);
  const room = MAX_IMAGES - images.length;

  async function upload(files: File[]) {
    const accepted = files.filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (files.length > accepted.length) {
      toast.error(new Error(`Only images, up to ${MAX_IMAGES} per product`));
    }
    if (!accepted.length) return;
    setProgress({ done: 0, total: accepted.length });
    for (const [i, file] of accepted.entries()) {
      try {
        const { url } = await uploadImage(file);
        setImages((list) => [...list, draft(url)]);
      } catch (err) {
        toast.error(err);
      }
      setProgress({ done: i + 1, total: accepted.length });
    }
    setProgress(null);
    if (picker.current) picker.current.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!readOnly && !progress) void upload(Array.from(e.dataTransfer.files));
  }

  async function save() {
    setBusy(true);
    try {
      const body: ProductImagesInput = {
        images: images.map((i) => ({
          url: i.url,
          alt: i.alt.trim() || null,
          optionValueId: i.optionValueId,
        })),
      };
      const saved = await adminFetch<AdminProductDto>(`/products/${product.id}/images`, {
        method: 'PUT',
        body,
      });
      toast.success('Gallery saved');
      onSaved(saved);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  }

  const update = (key: string, patch: Partial<ImageDraft>) =>
    setImages((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const renderImage = (image: ImageDraft, index: number) => (
    <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
      <div className="relative">
        <Thumb src={image.url} alt={image.alt} size={64} />
        {index === 0 && (
          <span className="absolute -top-1.5 -left-1.5 rounded-full bg-foreground px-1.5 text-[10px] leading-4 font-medium text-background">
            Main
          </span>
        )}
      </div>
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_180px]">
        <Input
          aria-label={`Image ${index + 1} alt text`}
          placeholder="Alt text, e.g. Olive hoodie, front"
          value={image.alt}
          onChange={(e) => update(image.key, { alt: e.target.value })}
          maxLength={200}
          disabled={readOnly}
          className="h-9!"
        />
        {colourOption && (
          <Select
            aria-label={`Image ${index + 1} ${colourOption.name.toLowerCase()}`}
            value={image.optionValueId ?? ''}
            onChange={(e) => update(image.key, { optionValueId: e.target.value || null })}
            disabled={readOnly}
            className="h-9!"
          >
            <option value="">All {colourOption.name.toLowerCase().replace(/s?$/, 's')}</option>
            {colourOption.values.map((v) => (
              <option key={v.id} value={v.id}>
                {v.value}
              </option>
            ))}
          </Select>
        )}
      </div>
      {!readOnly && (
        <button
          type="button"
          aria-label={`Remove image ${index + 1}`}
          onClick={() => setImages((list) => list.filter((i) => i.key !== image.key))}
          className="rounded p-1.5 text-subtle hover:bg-surface hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );

  return (
    <Card
      title="Images"
      description="Drag to reorder. The first image is shown in listings."
      actions={
        !readOnly && (
          <>
            {dirty && <Badge tone="amber">Unsaved changes</Badge>}
            <Button
              variant="primary"
              size="sm"
              busy={busy}
              disabled={!dirty || Boolean(progress)}
              onClick={save}
            >
              Save gallery
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {images.length > 0 &&
          (readOnly ? (
            <ul className="space-y-2">
              {images.map((image, i) => (
                <li key={image.key} className="rounded-lg border border-line p-2">
                  {renderImage(image, i)}
                </li>
              ))}
            </ul>
          ) : (
            <SortableList
              items={images}
              getKey={(i) => i.key}
              onReorder={setImages}
              renderItem={renderImage}
            />
          ))}

        {readOnly
          ? !images.length && <p className="text-sm text-muted">No images yet.</p>
          : room > 0 && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cx(
                  'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm transition',
                  dragging ? 'border-foreground bg-surface' : 'border-line',
                )}
              >
                <ImagePlus className="size-6 text-subtle" aria-hidden />
                {progress ? (
                  <div className="w-full max-w-xs space-y-2">
                    <p className="text-muted">
                      Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}…
                    </p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-foreground transition-all"
                        style={{ width: `${(progress.done / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-muted">
                      Drop images here or{' '}
                      <button
                        type="button"
                        onClick={() => picker.current?.click()}
                        className="font-medium text-foreground underline"
                      >
                        choose files
                      </button>
                    </p>
                    <p className="text-xs text-subtle">JPEG, PNG, WebP, AVIF or GIF</p>
                  </>
                )}
                <input
                  ref={picker}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  className="hidden"
                  aria-label="Upload images"
                  onChange={(e) => void upload(Array.from(e.target.files ?? []))}
                />
              </div>
            )}
      </div>
    </Card>
  );
}
