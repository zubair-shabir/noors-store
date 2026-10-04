import { formatINR, type StoreInfoDto } from '@noors/shared';

/*
 * Sentences built from the live store settings, shared by the policy pages and the FAQ so
 * every page quotes the same numbers.
 */

/** Typical delivery times. Checkout shows a date for the shopper's own pincode. */
export const deliveryEstimates = { local: 'about 3 days', elsewhere: 'about 5 working days' };

export function shippingFeeSentence({ shipping }: StoreInfoDto): string {
  if (shipping.fee === 0) return 'Shipping is free on every order.';
  if (shipping.freeAbove === null)
    return `Shipping is a flat ${formatINR(shipping.fee)} per order, wherever you are in India.`;
  return `Shipping is free on orders of ${formatINR(shipping.freeAbove)} or more (after any discount). Below that, it is a flat ${formatINR(shipping.fee)} per order.`;
}

export function codSentence({ cod }: StoreInfoDto): string {
  if (!cod.enabled)
    return 'Cash on delivery is not available at the moment, so orders are paid online at checkout.';
  return cod.fee > 0
    ? `Cash on delivery is available for an extra ${formatINR(cod.fee)}, which is added to the shipping line at checkout.`
    : 'Cash on delivery is available at no extra charge. Choose it at checkout.';
}

export function returnWindowSentence({ returns }: StoreInfoDto): string {
  return returns.windowDays > 0
    ? `You can ask for a return or an exchange within ${returns.windowDays} days of delivery.`
    : 'We do not accept returns for change of mind at the moment, but we will always fix a damaged or wrong item.';
}

/** "₹99 (free over ₹1,999)" for the facts band. */
export function shippingFact({ shipping }: StoreInfoDto): string {
  if (shipping.fee === 0) return 'Free';
  return shipping.freeAbove === null
    ? formatINR(shipping.fee)
    : `${formatINR(shipping.fee)}, free from ${formatINR(shipping.freeAbove)}`;
}

export function codFact({ cod }: StoreInfoDto): string {
  if (!cod.enabled) return 'Not available';
  return cod.fee > 0 ? `Yes, +${formatINR(cod.fee)}` : 'Yes, no extra charge';
}
