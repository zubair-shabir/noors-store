import { describe, expect, it } from 'vitest';
import { formatINR, rupeesToPaise } from './money.js';
import { phoneSchema, pincodeSchema } from './schemas.js';

describe('money', () => {
  it('converts rupees to integer paise', () => {
    expect(rupeesToPaise(1999.99)).toBe(199999);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
  });

  it('formats paise as Indian rupees', () => {
    expect(formatINR(249900)).toBe('₹2,499');
    expect(formatINR(12345650)).toBe('₹1,23,456.50');
  });
});

describe('schemas', () => {
  it('validates pincodes', () => {
    expect(pincodeSchema.safeParse('190001').success).toBe(true);
    expect(pincodeSchema.safeParse('090001').success).toBe(false);
  });

  it('normalises phone numbers', () => {
    expect(phoneSchema.parse('+91 98765-43210')).toBe('9876543210');
    expect(phoneSchema.safeParse('12345').success).toBe(false);
  });
});
