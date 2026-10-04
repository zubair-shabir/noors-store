'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { formatINR, type ProductSummaryDto } from '@noors/shared';
import { useShop } from '@/lib/cart-store';
import { errorMessage } from '@/lib/shop-api';
import { productHref } from '@/lib/site';
import { useUi } from '@/lib/ui-store';
import { WishlistButton } from './WishlistButton';

interface ProductCardProps {
  product: ProductSummaryDto;
  priority?: boolean;
}

const action =
  'text-[11px] font-medium tracking-[0.14em] uppercase underline underline-offset-[5px] decoration-1 transition-opacity hover:opacity-60 disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Product tile from the reference site: the image cross-fades to the second photo on hover
 * (with the "View" cursor), then name, price with struck compare-at price, a size picker,
 * Add to cart and Buy now. A heart in the photo's top right corner saves it to the wishlist. A rule under the card draws in from the left on hover.
 */
export function ProductCard({ product, priority = false }: ProductCardProps) {
  const options = product.quickAdd;
  const firstAvailable = options.find((o) => o.available) ?? options[0];
  const [variantId, setVariantId] = useState(firstAvailable?.variantId ?? '');
  const add = useShop((s) => s.add);
  const openPanel = useUi((s) => s.open);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sizeId = useId();
  const [front, back] = product.images;
  const href = productHref(product.slug);
  const chosen = options.find((o) => o.variantId === variantId);
  const canBuy = Boolean(chosen?.available);

  const addToCart = async (then: 'cart' | 'checkout') => {
    if (!chosen || !chosen.available || busy) return;
    setBusy(true);
    setError(null);
    try {
      await add(chosen.variantId);
      if (then === 'checkout') router.push('/checkout');
      else openPanel('cart');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="group relative pb-4">
      <Link
        href={href}
        data-cursor-label="View"
        className="relative block aspect-[467/529] overflow-hidden bg-surface"
      >
        {front && (
          <Image
            src={front.url}
            alt={front.alt ?? product.name}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition-transform duration-[1.2s] ease-out-expo group-hover:scale-[1.03]"
          />
        )}
        {back && (
          <Image
            src={back.url}
            alt=""
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
            className="object-cover opacity-0 transition-opacity duration-700 ease-out-expo group-hover:opacity-100"
          />
        )}
        {!product.inStock && (
          <span className="absolute top-3 left-3 bg-background px-2 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
            Sold out
          </span>
        )}
      </Link>
      {/* Outside the link: a button inside an <a> is invalid and would follow the link. */}
      <WishlistButton productId={product.id} slug={product.slug} name={product.name} />
      <h3 className="mt-4 text-base tracking-[0.01em] uppercase sm:text-lg">
        <Link href={href}>{product.name}</Link>
      </h3>
      <p className="mt-1 text-base sm:text-lg">
        {formatINR(chosen?.price ?? product.price)}
        {product.compareAtPrice && (chosen?.price ?? product.price) === product.price && (
          <s className="ml-2 text-subtle">{formatINR(product.compareAtPrice)}</s>
        )}
      </p>
      <div className="mt-3 flex items-center gap-5">
        {options.length > 1 && (
          <>
            <label htmlFor={sizeId} className="sr-only">
              Size
            </label>
            <select
              id={sizeId}
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              className="cursor-pointer border-b border-foreground bg-transparent py-0.5 pr-1 pl-1.5 text-[11px] font-medium uppercase"
            >
              {options.map((o) => (
                <option key={o.variantId} value={o.variantId} disabled={!o.available}>
                  {o.label}
                  {o.available ? '' : ' (sold out)'}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          type="button"
          className={action}
          onClick={() => addToCart('cart')}
          disabled={!canBuy || busy}
        >
          {product.inStock ? 'Add to cart' : 'Sold out'}
        </button>
        {product.inStock && (
          <button
            type="button"
            className={`${action} no-underline`}
            onClick={() => addToCart('checkout')}
            disabled={!canBuy || busy}
          >
            Buy now →
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs">
          {error}
        </p>
      )}
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-[1.5px] w-full origin-left scale-x-0 bg-foreground transition-transform duration-700 ease-out-expo group-hover:scale-x-100"
      />
    </article>
  );
}
