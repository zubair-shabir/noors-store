'use client';

import { slugify, type AdminCategoryDto, type AdminProductDto } from '@noors/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { adminFetch, rupeesToPaise, useAdminData, type ApiError } from '@/lib/admin/api';
import { useIsOwner } from '../AdminShell';
import {
  Button,
  ButtonLinkAdmin,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
} from '../ui';

/** Creates a draft product with one "Default" variant, then opens the editor. */
export function NewProductForm() {
  const router = useRouter();
  const isOwner = useIsOwner();
  const { data: categories } = useAdminData<{ items: AdminCategoryDto[] }>('/categories');

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [priceError, setPriceError] = useState<string>();
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const paise = rupeesToPaise(price);
    if (paise === undefined) {
      setPriceError('Enter an amount like 2499 or 2499.50');
      return;
    }
    setPriceError(undefined);
    setError(undefined);
    setBusy(true);
    try {
      const product = await adminFetch<AdminProductDto>('/products', {
        body: { name, slug: effectiveSlug, categoryId, price: paise ?? 0 },
      });
      router.push(`/admin/products/${product.id}`);
    } catch (err) {
      setError(err as ApiError);
      setBusy(false);
    }
  }

  if (!isOwner) {
    return (
      <>
        <PageHeader title="New product" back={{ href: '/admin/products', label: 'Products' }} />
        <EmptyState title="Only owners can create products" />
      </>
    );
  }

  const noCategories = categories && categories.items.length === 0;

  return (
    <>
      <PageHeader
        title="New product"
        description="It starts as a draft. Add options, images and stock next."
        back={{ href: '/admin/products', label: 'Products' }}
      />
      <form onSubmit={onSubmit} className="max-w-2xl">
        <Card>
          <div className="space-y-5">
            {error && !error.issues.length && <ErrorNote error={error} />}
            {noCategories && (
              <EmptyState title="Create a category first">
                Every product belongs to a category.{' '}
                <ButtonLinkAdmin href="/admin/categories">Go to categories</ButtonLinkAdmin>
              </EmptyState>
            )}
            <Field label="Name" error={error?.fieldError('name')}>
              {(id) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Kashmir Heritage Hoodie"
                  maxLength={160}
                  required
                  autoFocus
                />
              )}
            </Field>
            <Field
              label="URL slug"
              hint={`/products/${effectiveSlug || '…'}`}
              error={error?.fieldError('slug')}
            >
              {(id) => (
                <Input
                  id={id}
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setSlug(e.target.value);
                  }}
                  maxLength={120}
                  required
                />
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Category" error={error?.fieldError('categoryId')}>
                {(id) => (
                  <Select
                    id={id}
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Choose a category
                    </option>
                    {categories?.items.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                label="Price (₹)"
                hint="You can set prices per variant later."
                error={priceError ?? error?.fieldError('price')}
              >
                {(id) => (
                  <Input
                    id={id}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="decimal"
                    placeholder="2499"
                    aria-invalid={Boolean(priceError)}
                  />
                )}
              </Field>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
            <ButtonLinkAdmin href="/admin/products" variant="ghost">
              Cancel
            </ButtonLinkAdmin>
            <Button type="submit" variant="primary" busy={busy} disabled={!name || !categoryId}>
              Create product
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}
