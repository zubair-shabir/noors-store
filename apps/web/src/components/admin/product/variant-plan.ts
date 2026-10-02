import type { AdminProductDto } from '@noors/shared';

export interface OptionDraft {
  key: string;
  name: string;
  values: { value: string; swatch: string | null }[];
}

const lower = (s: string) => s.trim().toLowerCase();

/**
 * Predicts what PUT /options will do to the variants, mirroring the API: options and values
 * match by name (case-insensitive); a variant survives when it still has a value for every
 * option it already had (new options give it their first value) and no other variant
 * claimed the same combination first.
 */
export function planVariants(
  product: AdminProductDto,
  drafts: OptionDraft[],
): { total: number; kept: number; created: number; removed: number } {
  const existingNames = new Set(product.options.map((o) => lower(o.name)));
  const valueById = new Map(
    product.options.flatMap((o) =>
      o.values.map((v) => [v.id, { option: lower(o.name), value: lower(v.value) }]),
    ),
  );
  const total = drafts.reduce((n, o) => n * Math.max(1, o.values.length), 1);

  const claimed = new Set<string>();
  let removed = 0;
  for (const variant of product.variants) {
    const held = variant.optionValueIds
      .map((id) => valueById.get(id))
      .filter((v) => v !== undefined);
    const combo: string[] = [];
    let lost = false;
    for (const option of drafts) {
      const name = lower(option.name);
      const kept = option.values.find((v) =>
        held.some((h) => h.option === name && h.value === lower(v.value)),
      );
      if (kept) combo.push(lower(kept.value));
      else if (!existingNames.has(name)) combo.push(lower(option.values[0]?.value ?? ''));
      else lost = true;
    }
    const key = combo.join('\u0000');
    if (lost || claimed.has(key)) removed++;
    else claimed.add(key);
  }
  return { total, kept: claimed.size, created: total - claimed.size, removed };
}

/** Options in the shape PUT /options expects, for comparing with the saved product. */
export function optionsKey(
  options: { name: string; values: { value: string; swatch: string | null }[] }[],
) {
  return JSON.stringify(
    options.map((o) => [
      o.name.trim(),
      o.values.map((v) => [v.value.trim(), v.swatch?.toLowerCase() ?? null]),
    ]),
  );
}

/** Colour-like options get a swatch per value. */
export const isColourOption = (name: string) => /^(colou?rs?|shades?)$/i.test(name.trim());
