import type { CartLineDto } from '@noors/shared';

/** What to tell the shopper about a bag line that can't be bought as it stands. */
export function issueText(line: CartLineDto): string | null {
  switch (line.issue) {
    case 'sold_out':
      return 'Sold out. Remove it to check out.';
    case 'not_enough_stock':
      return `Only ${line.maxQuantity} left. Lower the quantity to check out.`;
    case 'unavailable':
      return 'No longer available. Remove it to check out.';
    default:
      return null;
  }
}
