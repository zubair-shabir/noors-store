'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useId, useState } from 'react';
import { formatINR } from '@noors/shared';
import type { Product } from '@/lib/catalog';
import { useCart } from '@/lib/cart-store';
import { useUi } from '@/lib/ui-store';

interface ProductCardProps {
  product: Product;
  priority?: boolean;
}

const action =
  'text-[11px] font-medium tracking-[0.14em] uppercase underline underline-offset-[5px] decoration-1 transition-opacity hover:opacity-60';

/**
 * Product tile from the reference site: the image cross-fades to the second photo on hover
 * (with the "View" cursor), then name, price with struck compare-at price, a size picker,
 * Add to cart and Buy now. A rule under the card draws in from the left on hover.
 */
export function ProductCard({ product, priority = false }: ProductCardProps) {
  const [size, setSize] = useState(product.sizes[1] ?? product.sizes[0]);
  const add = useCart((s) => s.add);
  const openPanel = useUi((s) => s.open);
  const sizeId = useId();
  const [front, back] = product.images;
  const href = `/shop/${product.category}`; // Product pages arrive in Step 5.

  const addToCart = () => {
    add({ slug: product.slug, name: product.name, image: front, size, price: product.price });
    openPanel('cart');
  };

  return (
    <article className="group relative pb-4">
      <Link
        href={href}
        data-cursor-label="View"
        className="relative block aspect-[467/529] overflow-hidden bg-surface"
      >
        <Image
          src={front}
          alt={product.name}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
          className="object-cover transition-transform duration-[1.2s] ease-out-expo group-hover:scale-[1.03]"
        />
        {back && (
          <Image
            src={back}
            alt=""
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
            className="object-cover opacity-0 transition-opacity duration-700 ease-out-expo group-hover:opacity-100"
          />
        )}
      </Link>
      <h3 className="mt-4 text-base tracking-[0.01em] uppercase sm:text-lg">
        <Link href={href}>{product.name}</Link>
      </h3>
      <p className="mt-1 text-base sm:text-lg">
        {formatINR(product.price)}
        {product.compareAtPrice && (
          <s className="ml-2 text-subtle">{formatINR(product.compareAtPrice)}</s>
        )}
      </p>
      <div className="mt-3 flex items-center gap-5">
        <label htmlFor={sizeId} className="sr-only">
          Size
        </label>
        <select
          id={sizeId}
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="cursor-pointer border-b border-foreground bg-transparent py-0.5 pr-1 pl-1.5 text-[11px] font-medium uppercase"
        >
          {product.sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" className={action} onClick={addToCart}>
          Add to cart
        </button>
        {/* Buy now goes straight to checkout once Step 6 lands; until then it opens the cart. */}
        <button type="button" className={`${action} no-underline`} onClick={addToCart}>
          Buy now →
        </button>
      </div>
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-[1.5px] w-full origin-left scale-x-0 bg-foreground transition-transform duration-700 ease-out-expo group-hover:scale-x-100"
      />
    </article>
  );
}
