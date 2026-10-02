import type { OptionDto, ProductDetailDto, VariantDto } from '@noors/shared';

/** Selected option value id per option name. */
export type Selection = Record<string, string>;

export const isColourOption = (o: OptionDto) => /^colou?r$/i.test(o.name);

/** The variant matching every selected value, if the combination exists. */
export function findVariant(product: ProductDetailDto, selection: Selection) {
  const ids = Object.values(selection);
  return product.variants.find(
    (v) =>
      v.optionValueIds.length === ids.length && ids.every((id) => v.optionValueIds.includes(id)),
  );
}

/**
 * The starting selection: the variant that sets the listed price (cheapest in stock),
 * so the page opens on the same colour and price the card showed.
 */
export function initialSelection(product: ProductDetailDto): Selection {
  const byPrice = [...product.variants].sort((a, b) => a.price - b.price);
  const start = byPrice.find((v) => v.available) ?? byPrice[0];
  return selectionOf(product, start);
}

export function selectionOf(product: ProductDetailDto, variant: VariantDto | undefined): Selection {
  const selection: Selection = {};
  for (const option of product.options) {
    const value = option.values.find((v) => variant?.optionValueIds.includes(v.id));
    if (value) selection[option.name] = value.id;
  }
  return selection;
}

/**
 * Picks `valueId` for `optionName`. When that combination doesn't exist, it keeps the new
 * value and moves the other options to the closest in-stock variant that has it.
 */
export function choose(
  product: ProductDetailDto,
  selection: Selection,
  optionName: string,
  valueId: string,
): Selection {
  const next = { ...selection, [optionName]: valueId };
  if (findVariant(product, next)) return next;
  const candidates = product.variants.filter((v) => v.optionValueIds.includes(valueId));
  const best =
    candidates.find((v) => v.available) ?? candidates[0] ?? findVariant(product, selection);
  return selectionOf(product, best);
}

/** State of one value button given the other selections: missing, sold out or buyable. */
export function valueState(
  product: ProductDetailDto,
  selection: Selection,
  optionName: string,
  valueId: string,
): 'available' | 'sold-out' | 'missing' {
  const variant = findVariant(product, { ...selection, [optionName]: valueId });
  if (!variant) return 'missing';
  return variant.available ? 'available' : 'sold-out';
}
