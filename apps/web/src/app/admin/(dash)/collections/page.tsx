'use client';

import type { AdminCollectionDto } from '@noors/shared';
import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useIsOwner } from '@/components/admin/AdminShell';
import { ViewOnlyNote } from '@/components/admin/merch/parts';
import { Thumb } from '@/components/admin/Thumb';
import {
  Badge,
  ButtonLinkAdmin,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  cx,
} from '@/components/admin/ui';
import { useAdminData } from '@/lib/admin/api';

export default function CollectionsPage() {
  const isOwner = useIsOwner();
  const { data, error } = useAdminData<{ items: AdminCollectionDto[] }>('/collections');

  return (
    <>
      <title>Collections | Noor&apos;s dashboard</title>
      <PageHeader
        title="Collections"
        description="Hand-picked product lists, or lists that fill themselves from rules."
        actions={
          isOwner && (
            <ButtonLinkAdmin href="/admin/collections/new" variant="primary">
              <Plus className="size-4" /> New collection
            </ButtonLinkAdmin>
          )
        }
      />
      {!isOwner && <ViewOnlyNote />}
      {error && !data ? (
        <ErrorNote error={error} />
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="No collections yet">
          Group products for a drop, a season or a price range.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-background">
          {data.items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/collections/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface"
              >
                <Thumb src={c.imageUrl} alt="" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted">
                    /{c.slug} · {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
                  </p>
                  <Badges collection={c} className="mt-1.5 flex sm:hidden" />
                </div>
                <Badges collection={c} className="hidden shrink-0 sm:flex" />
                <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Badges({ collection, className }: { collection: AdminCollectionDto; className: string }) {
  return (
    <div className={cx('gap-1.5', className)}>
      <Badge>{collection.type === 'MANUAL' ? 'Manual' : 'Rule'}</Badge>
      {collection.isActive ? (
        <Badge tone="green">Active</Badge>
      ) : (
        <Badge tone="amber">Hidden</Badge>
      )}
    </div>
  );
}
