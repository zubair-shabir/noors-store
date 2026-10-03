import { z } from 'zod';
import type { Paise } from './money.js';
import { phoneSchema } from './schemas.js';

// ─── Store info (policy pages, FAQ, footer) ─────────────────────────────────

/** The public part of the store settings: who we are and what shipping and returns cost. */
export interface StoreInfoDto {
  name: string;
  /** Empty when the owner has not set one yet. */
  email: string;
  phone: string;
  address: string;
  gstNumber: string;
  shipping: {
    /** Flat fee per order, in paise. */
    fee: Paise;
    /** Orders of this much or more (after discounts) ship free; null when shipping is never free. */
    freeAbove: Paise | null;
  };
  cod: { enabled: boolean; fee: Paise };
  returns: { windowDays: number };
}

// ─── Contact form ───────────────────────────────────────────────────────────

const optional = (schema: z.ZodType<string>) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    schema.optional(),
  );

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Keep your name under 100 characters'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email').max(200)),
  phone: optional(phoneSchema),
  orderNumber: optional(
    z.string().trim().toUpperCase().max(20, 'Order numbers are shorter than that'),
  ),
  message: z
    .string()
    .trim()
    .min(10, 'Tell us a little more (at least 10 characters)')
    .max(4000, 'Keep your message under 4,000 characters'),
  /** Honeypot: hidden from people, so anything typed here came from a bot. */
  website: z.string().max(500).optional(),
});
export type ContactInput = z.input<typeof contactSchema>;
export type ContactMessage = z.output<typeof contactSchema>;
