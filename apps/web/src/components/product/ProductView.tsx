'use client';

import {
  formatINR,
  MAX_LINE_QUANTITY,
  type ProductDetailDto,
  type SizeChartRow,
} from '@noors/shared';
import { Minus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { useShop } from '@/lib/cart-store';
import { errorMessage } from '@/lib/shop-api';
import { useUi } from '@/lib/ui-store';
import { DeliveryCheck } from '@/components/shop/DeliveryCheck';
import { ProductGallery } from './ProductGallery';
import { WishlistButton } from './WishlistButton';
import {
  choose,
  findVariant,
  initialSelection,
  isColourOption,
  valueState,
} from './variant-select';

const label = 'text-[11px] font-semibold tracking-[0.14em] uppercase';

/** Product page body: gallery, options, price, add to cart and the details below. */
export function ProductView({ product }: { product: ProductDetailDto }) {
  const [selection, setSelection] = useState(() => initialSelection(product));
  const [quantity, setQuantity] = useState(1);
  const add = useShop((s) => s.add);
  const openPanel = useUi((s) => s.open);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variant = findVariant(product, selection);
  const colourOption = product.options.find(isColourOption);
  const colourId = colourOption ? selection[colourOption.name] : undefined;

  // A colour's own photos first, then photos shared by every colour.
  const images = useMemo(() => {
    const own = product.images.filter((i) => colourId && i.optionValueId === colourId);
    const shared = product.images.filter((i) => !i.optionValueId);
    const list = own.length ? [...own, ...shared] : product.images;
    return list.length ? list : product.images;
  }, [product.images, colourId]);

  const addToCart = async (then: 'cart' | 'checkout') => {
    if (!variant?.available || busy) return;
    setBusy(true);
    setError(null);
    try {
      await add(variant.id, quantity);
      if (then === 'checkout') router.push('/checkout');
      else openPanel('cart');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const price = variant?.price ?? product.price;
  const compareAt = variant ? variant.compareAtPrice : product.compareAtPrice;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-16">
      <ProductGallery images={images} name={product.name} />

      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className={`${label} text-muted`}>{product.category.name}</p>
        <h1 className="mt-3 font-display text-4xl leading-none uppercase sm:text-5xl">
          {product.name}
        </h1>
        <p className="mt-4 text-xl">
          {formatINR(price)}
          {compareAt && <s className="ml-3 text-subtle">{formatINR(compareAt)}</s>}
        </p>
        <p className="mt-1 text-xs text-muted">Inclusive of all taxes.</p>

        <div className="mt-8 space-y-6">
          {product.options.map((option) => {
            const chosen = option.values.find((v) => v.id === selection[option.name]);
            const colour = isColourOption(option);
            return (
              <fieldset key={option.name}>
                <legend className={label}>
                  {option.name}
                  {chosen && (
                    <span className="ml-2 font-normal text-muted normal-case">{chosen.value}</span>
                  )}
                </legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {option.values.map((value) => {
                    const state = valueState(product, selection, option.name, value.id);
                    const on = selection[option.name] === value.id;
                    const unavailable = state !== 'available';
                    return colour ? (
                      <button
                        key={value.id}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${value.value}${unavailable ? ' (sold out)' : ''}`}
                        title={value.value}
                        onClick={() =>
                          setSelection(choose(product, selection, option.name, value.id))
                        }
                        className={`relative h-9 w-9 rounded-full border transition ${
                          on ? 'border-foreground p-0.5' : 'border-line p-1 hover:border-foreground'
                        } ${unavailable ? 'opacity-40' : ''}`}
                      >
                        <span
                          className="block h-full w-full rounded-full border border-line"
                          style={{ background: value.swatch ?? 'var(--surface)' }}
                        />
                      </button>
                    ) : (
                      <button
                        key={value.id}
                        type="button"
                        aria-pressed={on}
                        disabled={state === 'missing'}
                        onClick={() =>
                          setSelection(choose(product, selection, option.name, value.id))
                        }
                        className={`h-10 min-w-12 border px-3 text-xs font-medium tracking-[0.08em] uppercase transition-colors disabled:hidden ${
                          on
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-line hover:border-foreground'
                        } ${state === 'sold-out' ? 'text-subtle line-through' : ''}`}
                      >
                        {value.value}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <p className="mt-6 min-h-5 text-xs" aria-live="polite">
          {error ? (
            <span role="alert" className="font-medium">
              {error}
            </span>
          ) : !variant || !variant.available ? (
            <span className="text-muted">This combination is sold out.</span>
          ) : variant.lowStock ? (
            <span className="font-medium">Only a few left.</span>
          ) : null}
        </p>

        <div className="mt-4 flex items-stretch gap-3">
          <div className="flex items-center border border-line">
            <button
              type="button"
              className="p-3 disabled:opacity-30"
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => q - 1)}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-6 text-center text-sm tabular-nums" aria-label="Quantity">
              {quantity}
            </span>
            <button
              type="button"
              className="p-3 disabled:opacity-30"
              aria-label="Increase quantity"
              disabled={quantity >= MAX_LINE_QUANTITY}
              onClick={() => setQuantity((q) => q + 1)}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => addToCart('cart')}
            disabled={!variant?.available || busy}
            className="flex-1 border border-foreground py-3.5 text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground"
          >
            {variant?.available ? 'Add to cart' : 'Sold out'}
          </button>
          <WishlistButton
            productId={product.id}
            slug={product.slug}
            name={product.name}
            variant="page"
          />
        </div>
        <button
          type="button"
          onClick={() => addToCart('checkout')}
          disabled={!variant?.available || busy}
          className="mt-3 w-full bg-foreground py-3.5 text-[11px] font-semibold tracking-[0.18em] text-background uppercase transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Buy now
        </button>
        <DeliveryCheck />

        <div className="mt-10 border-t border-line">
          {product.description && (
            <Details title="Description" open>
              <div
                className="rich-text"
                dangerouslySetInnerHTML={{ __html: asHtml(product.description) }}
              />
            </Details>
          )}
          {product.fabric && (
            <Details title="Fabric">
              <p className="text-sm leading-relaxed">{product.fabric}</p>
            </Details>
          )}
          {product.care && (
            <Details title="Care">
              <p className="text-sm leading-relaxed whitespace-pre-line">{product.care}</p>
            </Details>
          )}
          {isSizeChart(product.sizeChart) && (
            <Details title="Size chart">
              <SizeChart rows={product.sizeChart} />
            </Details>
          )}
          <Details title="Shipping and returns">
            <p className="text-sm leading-relaxed text-muted">
              Shipped from Srinagar across India, usually within 2 to 3 working days. Easy returns
              and size exchanges within 7 days of delivery.
            </p>
          </Details>
        </div>
      </div>
    </div>
  );
}

function Details({
  title,
  open,
  children,
}: {
  title: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group border-b border-line py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold tracking-[0.14em] uppercase [&::-webkit-details-marker]:hidden">
        {title}
        <Plus
          className="h-4 w-4 transition-transform duration-500 group-open:rotate-45"
          aria-hidden
        />
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

const isSizeChart = (v: unknown): v is SizeChartRow[] => Array.isArray(v) && v.length > 0;

const chartColumns = [
  { key: 'chestCm', label: 'Chest' },
  { key: 'lengthCm', label: 'Length' },
  { key: 'shoulderCm', label: 'Shoulder' },
  { key: 'sleeveCm', label: 'Sleeve' },
] as const;

function SizeChart({ rows }: { rows: SizeChartRow[] }) {
  const columns = chartColumns.filter((c) => rows.some((r) => r[c.key] != null));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Measurements in centimetres</caption>
        <thead>
          <tr className="border-b border-line text-[11px] tracking-[0.1em] text-muted uppercase">
            <th className="py-2 font-medium">Size</th>
            {columns.map((c) => (
              <th key={c.key} className="py-2 font-medium">
                {c.label} (cm)
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.size} className="border-b border-line last:border-0">
              <td className="py-2 font-medium">{r.size}</td>
              {columns.map((c) => (
                <td key={c.key} className="py-2 tabular-nums">
                  {r[c.key] ?? '–'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Seeded descriptions are plain text; dashboard ones are already sanitised HTML. */
function asHtml(description: string): string {
  if (/<[a-z][\s\S]*>/i.test(description)) return description;
  const escaped = description.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
