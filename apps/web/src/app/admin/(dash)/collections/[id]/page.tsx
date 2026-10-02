'use client';

import type {
  AdminCategoryDto,
  AdminCollectionDto,
  CollectionInput,
  CollectionRules,
} from '@noors/shared';
import { formatINR } from '@noors/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { useIsOwner } from '@/components/admin/AdminShell';
import { ImageField } from '@/components/admin/ImageField';
import { fieldError, formLevelError, useNameSlug } from '@/components/admin/merch/hooks';
import {
  OrderList,
  ProductLine,
  Segmented,
  ViewOnlyNote,
  type ProductLite,
} from '@/components/admin/merch/parts';
import { ProductPicker } from '@/components/admin/ProductPicker';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Switch,
  Textarea,
} from '@/components/admin/ui';
import { adminFetch, paiseToRupees, rupeesToPaise, useAdminData } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';

type CollectionType = AdminCollectionDto['type'];

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { data, error } = useAdminData<AdminCollectionDto>(isNew ? null : `/collections/${id}`);
  const categories = useAdminData<{ items: AdminCategoryDto[] }>('/categories');

  if (!isNew && !data) {
    return (
      <>
        <PageHeader
          title="Collection"
          back={{ href: '/admin/collections', label: 'Collections' }}
        />
        {error ? <ErrorNote error={error} /> : <Spinner />}
      </>
    );
  }
  return (
    <CollectionForm
      key={data?.id ?? 'new'}
      initial={data ?? null}
      categories={categories.data?.items ?? []}
    />
  );
}

function CollectionForm({
  initial,
  categories,
}: {
  initial: AdminCollectionDto | null;
  categories: AdminCategoryDto[];
}) {
  const router = useRouter();
  const isOwner = useIsOwner();
  const formId = useId();
  const rules = initial?.rules ?? {};

  const { name, slug, setName, setSlug } = useNameSlug({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
  });
  const [description, setDescription] = useState(initial?.description ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? null);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [type, setType] = useState<CollectionType>(initial?.type ?? 'MANUAL');
  const [products, setProducts] = useState<ProductLite[]>(
    initial?.type === 'MANUAL' ? initial.products : [],
  );
  const [categorySlug, setCategorySlug] = useState(rules.categorySlug ?? '');
  const [tag, setTag] = useState(rules.tag ?? '');
  const [minPrice, setMinPrice] = useState(paiseToRupees(rules.minPrice));
  const [maxPrice, setMaxPrice] = useState(paiseToRupees(rules.maxPrice));

  // The last saved version: its `products` is the rule preview.
  const [saved, setSaved] = useState(initial);
  const [rulesChanged, setRulesChanged] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const editRule =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setRulesChanged(true);
    };

  function buildRules(): CollectionRules | null {
    const errors: Record<string, string> = {};
    const min = rupeesToPaise(minPrice);
    const max = rupeesToPaise(maxPrice);
    if (min === undefined) errors.minPrice = 'Enter an amount like 1500';
    if (max === undefined) errors.maxPrice = 'Enter an amount like 3000';
    if (typeof min === 'number' && typeof max === 'number' && min > max)
      errors.maxPrice = 'Must be at least the minimum price';
    const out: CollectionRules = {};
    if (categorySlug) out.categorySlug = categorySlug;
    if (tag.trim()) out.tag = tag.trim().toLowerCase();
    if (typeof min === 'number') out.minPrice = min;
    if (typeof max === 'number') out.maxPrice = max;
    if (Object.keys(errors).length === 0 && Object.keys(out).length === 0)
      errors.rules = 'Set at least one rule';
    setLocalErrors(errors);
    return Object.keys(errors).length ? null : out;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let rulesBody: CollectionRules | null = null;
    if (type === 'RULE') {
      rulesBody = buildRules();
      if (!rulesBody) return;
    } else {
      setLocalErrors({});
    }
    const body: CollectionInput = {
      name,
      slug,
      description: description || null,
      imageUrl,
      type,
      rules: rulesBody,
      isActive,
      productIds: type === 'MANUAL' ? products.map((p) => p.id) : undefined,
    };
    setBusy(true);
    try {
      if (!initial) {
        const created = await adminFetch<AdminCollectionDto>('/collections', { body });
        toast.success(`Created ${created.name}`);
        router.replace(`/admin/collections/${created.id}`);
        return;
      }
      const updated = await adminFetch<AdminCollectionDto>(`/collections/${initial.id}`, {
        method: 'PUT',
        body,
      });
      setSaved(updated);
      setRulesChanged(false);
      toast.success('Collection saved');
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial) return;
    setDeleting(true);
    try {
      await adminFetch(`/collections/${initial.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${initial.name}`);
      router.push('/admin/collections');
    } catch (err) {
      toast.error(err);
      setDeleting(false);
    }
  }

  const rulesError = localErrors.rules ?? fieldError(error, 'rules');
  const showPreview = type === 'RULE' && saved?.type === 'RULE';

  return (
    <>
      <title>{`${initial ? initial.name : 'New collection'} | Noor's dashboard`}</title>
      <PageHeader
        title={initial ? initial.name : 'New collection'}
        back={{ href: '/admin/collections', label: 'Collections' }}
        actions={
          isOwner && (
            <>
              {initial && (
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> Delete
                </Button>
              )}
              <Button variant="primary" type="submit" form={formId} busy={busy}>
                {initial ? 'Save' : 'Create collection'}
              </Button>
            </>
          )
        }
      />
      {!isOwner && <ViewOnlyNote />}
      <form id={formId} onSubmit={submit} noValidate>
        <fieldset disabled={!isOwner} className="grid min-w-0 gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-6">
            <ErrorNote
              error={formLevelError(error, [
                'name',
                'slug',
                'description',
                'imageUrl',
                'rules',
                'productIds',
              ])}
            />
            <Card title="Details">
              <div className="space-y-4">
                <Field label="Name" error={fieldError(error, 'name')}>
                  {(id) => (
                    <Input
                      id={id}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  )}
                </Field>
                <Field
                  label="Slug"
                  hint="Used in the collection's web address."
                  error={fieldError(error, 'slug')}
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      required
                    />
                  )}
                </Field>
                <Field
                  label="Description"
                  hint="Optional."
                  error={fieldError(error, 'description')}
                >
                  {(id) => (
                    <Textarea
                      id={id}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  )}
                </Field>
              </div>
            </Card>

            <Card
              title="Products"
              description={
                type === 'MANUAL'
                  ? 'Pick products and drag them into order.'
                  : 'Products that match all of the rules below fill this collection.'
              }
              actions={
                <Segmented
                  label="Collection type"
                  value={type}
                  onChange={setType}
                  disabled={!isOwner}
                  options={[
                    { value: 'MANUAL', label: 'Manual' },
                    { value: 'RULE', label: 'Rule' },
                  ]}
                />
              }
            >
              {type === 'MANUAL' ? (
                <div className="space-y-3">
                  {products.length === 0 ? (
                    <EmptyState title="No products yet">
                      Add products to fill this collection.
                    </EmptyState>
                  ) : (
                    <OrderList
                      items={products}
                      getKey={(p) => p.id}
                      locked={!isOwner}
                      onReorder={setProducts}
                      renderItem={(p, i) => (
                        <ProductLine
                          product={p}
                          index={i}
                          onRemove={
                            isOwner
                              ? () => setProducts(products.filter((x) => x.id !== p.id))
                              : undefined
                          }
                        />
                      )}
                    />
                  )}
                  {isOwner && (
                    <Button onClick={() => setPickerOpen(true)}>
                      <Plus className="size-4" /> Add products
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {rulesError && (
                    <p className="text-sm text-red-700 dark:text-red-400">{rulesError}</p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Category">
                      {(id) => (
                        <Select
                          id={id}
                          value={categorySlug}
                          onChange={(e) => editRule(setCategorySlug)(e.target.value)}
                        >
                          <option value="">Any category</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.slug}>
                              {c.name}
                            </option>
                          ))}
                          {categorySlug && !categories.some((c) => c.slug === categorySlug) && (
                            <option value={categorySlug}>{categorySlug} (missing)</option>
                          )}
                        </Select>
                      )}
                    </Field>
                    <Field label="Tag" hint="Products carrying this tag, e.g. winter.">
                      {(id) => (
                        <Input
                          id={id}
                          value={tag}
                          onChange={(e) => editRule(setTag)(e.target.value)}
                          placeholder="Any tag"
                        />
                      )}
                    </Field>
                    <Field label="Minimum price (₹)" error={localErrors.minPrice}>
                      {(id) => (
                        <Input
                          id={id}
                          inputMode="decimal"
                          value={minPrice}
                          onChange={(e) => editRule(setMinPrice)(e.target.value)}
                          placeholder="No minimum"
                          aria-invalid={Boolean(localErrors.minPrice)}
                        />
                      )}
                    </Field>
                    <Field label="Maximum price (₹)" error={localErrors.maxPrice}>
                      {(id) => (
                        <Input
                          id={id}
                          inputMode="decimal"
                          value={maxPrice}
                          onChange={(e) => editRule(setMaxPrice)(e.target.value)}
                          placeholder="No maximum"
                          aria-invalid={Boolean(localErrors.maxPrice)}
                        />
                      )}
                    </Field>
                  </div>
                  <RulePreview collection={showPreview ? saved : null} stale={rulesChanged} />
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card title="Visibility">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="block font-medium">Active</span>
                  <span className="text-muted">Shown on the store</span>
                </span>
                <Switch
                  checked={isActive}
                  onChange={setIsActive}
                  label="Active"
                  disabled={!isOwner}
                />
              </label>
            </Card>
            <Card title="Image">
              <ImageField value={imageUrl} onChange={setImageUrl} label="Cover image" />
            </Card>
          </div>
        </fieldset>
      </form>

      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedIds={products.map((p) => p.id)}
        onPick={(p) =>
          setProducts((list) => [
            ...list,
            { id: p.id, name: p.name, imageUrl: p.imageUrl, status: p.status },
          ])
        }
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete collection?"
        body={`${initial?.name ?? 'This collection'} will be removed. Its products are not affected.`}
        busy={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}

/** The products the saved rules matched, as returned by the last save or load. */
function RulePreview({
  collection,
  stale,
}: {
  collection: AdminCollectionDto | null;
  stale: boolean;
}) {
  if (!collection) {
    return (
      <p className="rounded-md bg-surface px-3 py-2 text-sm text-muted">
        Save to see which products match.
      </p>
    );
  }
  const { rules, productCount, products } = collection;
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          {productCount} matching {productCount === 1 ? 'product' : 'products'}
        </h3>
        <p className="text-xs text-muted">{describeRules(rules)}</p>
      </div>
      {stale && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Rules changed. Save to refresh the preview.
        </p>
      )}
      {products.length === 0 ? (
        <p className="text-sm text-muted">No products match these rules yet.</p>
      ) : (
        <ul className="space-y-2">
          {products.map((p) => (
            <li key={p.id} className="rounded-lg border border-line p-2 pr-3">
              <ProductLine product={p} />
            </li>
          ))}
        </ul>
      )}
      {products.length < productCount && (
        <p className="text-xs text-muted">Showing the first {products.length}.</p>
      )}
    </div>
  );
}

function describeRules(rules: CollectionRules | null): string {
  if (!rules) return '';
  const parts: string[] = [];
  if (rules.categorySlug) parts.push(`in ${rules.categorySlug}`);
  if (rules.tag) parts.push(`tagged ${rules.tag}`);
  if (rules.minPrice !== undefined) parts.push(`from ${formatINR(rules.minPrice)}`);
  if (rules.maxPrice !== undefined) parts.push(`up to ${formatINR(rules.maxPrice)}`);
  return parts.join(', ');
}
