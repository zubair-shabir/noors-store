/**
 * Creates a dashboard account, or resets an existing one's password, name and role.
 *
 *   pnpm --filter @noors/api admin:create --email you@brand.in --name "Your Name" --role OWNER
 *
 * The password is read from the ADMIN_PASSWORD environment variable so it stays out of
 * shell history; set it inline: ADMIN_PASSWORD='...' pnpm --filter @noors/api admin:create ...
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { adminRoleSchema } from '@noors/shared';
import { z } from 'zod';
import { createPrisma } from '../lib/prisma.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../lib/password.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'STAFF' },
  },
});

const input = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().min(1),
    role: adminRoleSchema,
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `ADMIN_PASSWORD needs ${MIN_PASSWORD_LENGTH}+ characters`),
  })
  .parse({ ...values, password: process.env.ADMIN_PASSWORD ?? '' });

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const prisma = createPrisma(url);

const passwordHash = await hashPassword(input.password);
const admin = await prisma.adminUser.upsert({
  where: { email: input.email },
  create: { email: input.email, name: input.name, role: input.role, passwordHash },
  update: { name: input.name, role: input.role, passwordHash, isActive: true },
});
// A password reset signs the account out everywhere.
await prisma.adminSession.deleteMany({ where: { adminUserId: admin.id } });
console.log(`Saved ${admin.role.toLowerCase()} account ${admin.email}`);
await prisma.$disconnect();
