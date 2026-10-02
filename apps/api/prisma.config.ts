import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Read lazily so `prisma generate` (build, typecheck) works without a database configured.
    // Commands that touch the database fail with a clear error if DATABASE_URL is missing.
    url: process.env.DATABASE_URL,
  },
});
