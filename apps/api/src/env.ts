import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => v || undefined);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    /** cloudinary://key:secret@cloud_name. When unset, uploads are saved to UPLOADS_DIR. */
    CLOUDINARY_URL: optional,
    UPLOADS_DIR: z.string().default('uploads'),
    /** Razorpay API keys (test keys start rzp_test_). Without them, development uses a stand-in. */
    RAZORPAY_KEY_ID: optional,
    RAZORPAY_KEY_SECRET: optional,
    /** The secret set on the webhook in the Razorpay dashboard. */
    RAZORPAY_WEBHOOK_SECRET: optional,
    /** Resend API key for sign-in codes. Without it, codes are written to the log (development). */
    RESEND_API_KEY: optional,
    /** Sender for customer emails; the domain must be verified in Resend. */
    EMAIL_FROM: z
      .string()
      .optional()
      .transform((v) => v || "Noor's <orders@noors.in>"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of [
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
      'RESEND_API_KEY',
    ] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'Required in production' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
