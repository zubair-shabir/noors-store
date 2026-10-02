import type { OptionValueDto, ProductSummaryDto } from '@noors/shared';

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];

/** Sizes and colours offered across a listing, for its filter bar. */
export function facetsOf(products: ProductSummaryDto[]) {
  const sizes = [...new Set(products.flatMap((p) => p.sizes))].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const colours = new Map<string, OptionValueDto>();
  for (const c of products.flatMap((p) => p.colours)) {
    const key = c.value.toLowerCase();
    if (!colours.has(key) || (!colours.get(key)!.swatch && c.swatch)) colours.set(key, c);
  }
  return { sizes, colours: [...colours.values()] };
}
