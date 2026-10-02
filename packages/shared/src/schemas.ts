import { z } from 'zod';

/** Indian postal code: 6 digits, cannot start with 0. */
export const pincodeSchema = z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit pincode');

/** Indian mobile number, 10 digits starting 6-9, optional +91 prefix stripped. */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\s|-/g, '').replace(/^\+?91/, ''))
  .pipe(z.string().regex(/^[6-9][0-9]{9}$/, 'Enter a valid 10-digit mobile number'));

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptime: z.number(),
  checks: z.object({
    database: z.enum(['up', 'down']),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
