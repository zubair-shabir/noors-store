/**
 * All money is stored and passed around as integer paise (1 INR = 100 paise)
 * so totals never suffer from floating point rounding.
 */
export type Paise = number;

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

export function formatINR(paise: Paise): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);
}
