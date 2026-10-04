'use client';

import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useShop } from '@/lib/cart-store';
import { errorMessage, ShopError } from '@/lib/shop-api';
import { productHref } from '@/lib/site';

/** Where a signed-out shopper goes to sign in, coming back to this product afterwards. */
export const wishlistSignInHref = (slug: string) =>
  `/account?next=${encodeURIComponent(productHref(slug))}&intent=wishlist`;

/**
 * Heart that saves a product to the signed-in shopper's wishlist. Filled when saved; the change
 * shows at once and rolls back with a short message if the server refuses it. Signed-out
 * shoppers are sent to sign in and brought back to the product.
 */
export function WishlistButton({
  productId,
  slug,
  name,
  variant = 'card',
  className = '',
}: {
  productId: string;
  slug: string;
  name: string;
  /**
   * `card`: a small round button pinned to the top right of the nearest positioned ancestor
   * (the card). `page`: a square button that sits in a row beside Add to cart.
   */
  variant?: 'card' | 'page';
  className?: string;
}) {
  const router = useRouter();
  const loaded = useShop((s) => s.loaded);
  const signedIn = useShop((s) => Boolean(s.customer));
  const saved = useShop((s) => s.wishlist.includes(productId));
  const toggle = useShop((s) => s.toggleWishlist);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    if (!loaded) return;
    if (!signedIn) {
      router.push(wishlistSignInHref(slug));
      return;
    }
    try {
      await toggle(productId);
    } catch (err) {
      if (err instanceof ShopError && err.status === 401) {
        router.push(wishlistSignInHref(slug));
        return;
      }
      setError(errorMessage(err));
      window.setTimeout(() => setError(null), 5000);
    }
  };

  const label = saved ? 'Remove from wishlist' : 'Save to wishlist';
  const shape =
    variant === 'card'
      ? 'h-9 w-9 rounded-full bg-background/85 backdrop-blur-sm hover:bg-background'
      : 'w-12 border border-line hover:border-foreground';

  return (
    <div
      className={`flex shrink-0 ${variant === 'card' ? 'absolute top-3 right-3 z-10' : 'relative'} ${className}`}
    >
      <button
        type="button"
        aria-pressed={saved}
        aria-label={label}
        title={`${label}: ${name}`}
        onClick={() => void onClick()}
        className={`flex items-center justify-center text-foreground transition-[background-color,border-color,transform] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-90 ${shape}`}
      >
        <Heart
          aria-hidden
          strokeWidth={1.5}
          className={`${variant === 'card' ? 'h-4 w-4' : 'h-5 w-5'} transition-[fill] duration-300 ${
            saved ? 'fill-current' : 'fill-transparent'
          }`}
        />
      </button>
      {error && (
        <p
          role="alert"
          className={`absolute z-10 w-48 bg-foreground px-3 py-2 text-xs text-background ${
            variant === 'card' ? 'top-11 right-0' : 'right-0 bottom-full mb-2'
          }`}
        >
          {error}
        </p>
      )}
    </div>
  );
}
