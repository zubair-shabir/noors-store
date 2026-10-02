'use client';

import type {
  AdminCategoryDto,
  AdminProductDto,
  ProductStatus,
  ProductUpdateInput,
  SizeChartRow,
} from '@noors/shared';
import { useState } from 'react';
import { adminFetch, type ApiError } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '../ui';
import { ChipInput } from './ChipInput';
import { RichTextEditor } from './RichTextEditor';
import {
  parseSizeChart,
  SizeChartEditor,
  toSizeChartDrafts,
  type SizeChartDraft,
} from './SizeChartEditor';

interface Form {
  name: string;
  slug: string;
  status: ProductStatus;
  categoryId: string;
  description: string;
  tags: string[];
  fabric: string;
  care: string;
  hsnCode: string;
  seoTitle: string;
  seoDescription: string;
  sizeChart: SizeChartDraft[];
}

const TEXT_FIELDS = ['fabric', 'care', 'hsnCode', 'seoTitle', 'seoDescription'] as const;

function formOf(p: AdminProductDto): Form {
  return {
    name: p.name,
    slug: p.slug,
    status: p.status,
    categoryId: p.categoryId,
    description: p.description,
    tags: p.tags,
    fabric: p.fabric ?? '',
    care: p.care ?? '',
    hsnCode: p.hsnCode ?? '',
    seoTitle: p.seoTitle ?? '',
    seoDescription: p.seoDescription ?? '',
    sizeChart: toSizeChartDrafts(p.sizeChart),
  };
}

/** Size chart rows with every measurement present (null when blank), for comparison. */
const chartKey = (rows: SizeChartRow[] | null) =>
  JSON.stringify(
    rows?.length
      ? rows.map((r) => [
          r.size,
          r.chestCm ?? null,
          r.lengthCm ?? null,
          r.shoulderCm ?? null,
          r.sleeveCm ?? null,
        ])
      : null,
  );

/** The fields that differ from the saved product, ready to PATCH. */
function changesOf(
  form: Form,
  product: AdminProductDto,
  baselineDescription: string,
): { patch: ProductUpdateInput; error?: string } {
  const patch: ProductUpdateInput = {};
  if (form.name.trim() !== product.name) patch.name = form.name.trim();
  if (form.slug.trim() !== product.slug) patch.slug = form.slug.trim();
  if (form.status !== product.status) patch.status = form.status;
  if (form.categoryId !== product.categoryId) patch.categoryId = form.categoryId;
  if (form.description !== baselineDescription) patch.description = form.description;
  if (JSON.stringify(form.tags) !== JSON.stringify(product.tags)) patch.tags = form.tags;
  for (const key of TEXT_FIELDS) {
    if (form[key].trim() !== (product[key] ?? '')) patch[key] = form[key].trim() || null;
  }
  const chart = parseSizeChart(form.sizeChart);
  if ('error' in chart) return { patch, error: chart.error };
  if (chartKey(chart.value) !== chartKey(product.sizeChart)) patch.sizeChart = chart.value;
  return { patch };
}

/** Name, description, status, category and the other product-level fields. */
export function DetailsCard({
  product,
  categories,
  readOnly,
  onSaved,
}: {
  product: AdminProductDto;
  categories: AdminCategoryDto[];
  readOnly: boolean;
  onSaved: (product: AdminProductDto) => void;
}) {
  const [form, setForm] = useState(() => formOf(product));
  // The editor may normalise the saved HTML slightly; compare edits against its version.
  const [baselineDescription, setBaselineDescription] = useState(product.description);
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const { patch, error: chartError } = changesOf(form, product, baselineDescription);
  const dirty = Object.keys(patch).length > 0 || Boolean(chartError);
  const publishable = product.variants.some((v) => v.isActive && v.price > 0);

  async function save() {
    if (chartError) {
      toast.error(new Error(chartError));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const saved = await adminFetch<AdminProductDto>(`/products/${product.id}`, {
        method: 'PATCH',
        body: patch satisfies ProductUpdateInput,
      });
      toast.success(
        patch.status === 'ACTIVE' ? 'Published' : patch.status ? 'Saved' : 'Details saved',
      );
      onSaved(saved);
    } catch (err) {
      setError(err as ApiError);
      toast.error(err);
      setBusy(false);
    }
  }

  const fieldError = (key: string) => error?.fieldError(key);

  return (
    <Card
      title="Details"
      description="What shoppers see on the product page."
      actions={
        !readOnly && (
          <>
            {dirty && <Badge tone="amber">Unsaved changes</Badge>}
            <Button
              variant="primary"
              size="sm"
              busy={busy}
              disabled={!dirty || !form.name.trim()}
              onClick={save}
            >
              Save details
            </Button>
          </>
        )
      }
    >
      <fieldset disabled={readOnly} className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Name" error={fieldError('name')}>
          {(id) => (
            <Input
              id={id}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={160}
              aria-invalid={!form.name.trim()}
            />
          )}
        </Field>
        <Field label="URL slug" error={fieldError('slug')}>
          {(id) => (
            <Input
              id={id}
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              maxLength={120}
            />
          )}
        </Field>
        <Field
          label="Status"
          error={fieldError('status')}
          hint={
            form.status === 'ACTIVE' && !publishable
              ? 'Needs an active variant with a price before it can be published.'
              : form.status === 'ACTIVE'
                ? 'Visible in the store.'
                : form.status === 'DRAFT'
                  ? 'Hidden from the store while you work on it.'
                  : 'Hidden from the store and kept for records.'
          }
        >
          {(id) => (
            <Select
              id={id}
              value={form.status}
              onChange={(e) => set('status', e.target.value as ProductStatus)}
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          )}
        </Field>
        <Field label="Category" error={fieldError('categoryId')}>
          {(id) => (
            <Select
              id={id}
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              {!categories.some((c) => c.id === form.categoryId) && (
                <option value={form.categoryId}>…</option>
              )}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Description" className="md:col-span-2" error={fieldError('description')}>
          {(id) => (
            <RichTextEditor
              id={id}
              initialHtml={product.description}
              disabled={readOnly}
              onReady={(html) => {
                setBaselineDescription(html);
                set('description', html);
              }}
              onChange={(html) => set('description', html)}
            />
          )}
        </Field>

        <Field
          label="Tags"
          className="md:col-span-2"
          hint="Press Enter or comma to add. Used for search and collections."
          error={fieldError('tags')}
        >
          {(id) => (
            <ChipInput
              id={id}
              values={form.tags}
              onChange={(tags) => set('tags', tags)}
              normalize={(v) => v.trim().toLowerCase().slice(0, 40)}
              max={30}
              placeholder="winter, kashmiri, wool"
              disabled={readOnly}
            />
          )}
        </Field>

        <Field label="Fabric" error={fieldError('fabric')}>
          {(id) => (
            <Input
              id={id}
              value={form.fabric}
              onChange={(e) => set('fabric', e.target.value)}
              maxLength={300}
              placeholder="100% cotton fleece, 320 GSM"
            />
          )}
        </Field>
        <Field label="HSN code" hint="For GST invoices." error={fieldError('hsnCode')}>
          {(id) => (
            <Input
              id={id}
              value={form.hsnCode}
              onChange={(e) => set('hsnCode', e.target.value)}
              maxLength={20}
              placeholder="6110"
            />
          )}
        </Field>
        <Field label="Care" className="md:col-span-2" error={fieldError('care')}>
          {(id) => (
            <Textarea
              id={id}
              value={form.care}
              onChange={(e) => set('care', e.target.value)}
              maxLength={1000}
              rows={3}
              className="min-h-20"
              placeholder="Machine wash cold, inside out. Do not tumble dry."
            />
          )}
        </Field>

        <Field
          label="SEO title"
          hint={`${form.seoTitle.length}/160 · Defaults to the product name.`}
          error={fieldError('seoTitle')}
        >
          {(id) => (
            <Input
              id={id}
              value={form.seoTitle}
              onChange={(e) => set('seoTitle', e.target.value)}
              maxLength={160}
            />
          )}
        </Field>
        <Field
          label="SEO description"
          hint={`${form.seoDescription.length}/320`}
          error={fieldError('seoDescription')}
        >
          {(id) => (
            <Textarea
              id={id}
              value={form.seoDescription}
              onChange={(e) => set('seoDescription', e.target.value)}
              maxLength={320}
              rows={2}
              className="min-h-10"
            />
          )}
        </Field>

        <div className="space-y-1.5 md:col-span-2">
          <span className="block text-sm font-medium">Size chart</span>
          <SizeChartEditor
            rows={form.sizeChart}
            onChange={(rows) => set('sizeChart', rows)}
            disabled={readOnly}
          />
          {(chartError || fieldError('sizeChart')) && (
            <p className="text-xs text-red-700 dark:text-red-400">
              {chartError ?? fieldError('sizeChart')}
            </p>
          )}
        </div>
      </fieldset>
    </Card>
  );
}
