# Noor's store

Ecommerce web app for Noor's, a Kashmir-based clothing brand: storefront, admin dashboard, and an API with Razorpay, Shiprocket and Resend.

## Layout

| Path                 | What it is                                             |
| -------------------- | ------------------------------------------------------ |
| `apps/web`           | Next.js (App Router) storefront and `/admin` dashboard |
| `apps/api`           | Express API, Prisma ORM, PostgreSQL                    |
| `packages/shared`    | Types and Zod validation shared by web and API         |
| `docker-compose.yml` | PostgreSQL 16 and Redis 7 for local development        |

## Getting started

Requirements: Node 22, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
pnpm db:up                                # start Postgres + Redis in Docker
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate                           # apply Prisma migrations
pnpm db:seed                              # load sample categories and products
pnpm dev                                  # web on :3000, API on :4000
```

Check the API: <http://localhost:4000/api/v1/health>

## Dashboard

Open <http://localhost:3000/admin>. The seed creates a development owner account:
`owner@noors.local` / `noors-dev-password`.

Create real accounts (owners manage the catalogue; staff can view it and change stock):

```bash
ADMIN_PASSWORD='a long password' pnpm --filter @noors/api admin:create --email you@brand.in --name "Your Name" --role OWNER
```

Running it again for the same email resets the password and signs that account out everywhere.

Product photos upload to Cloudinary when `CLOUDINARY_URL` is set in `apps/api/.env`; without it
they are saved to `apps/api/uploads` and served at `/uploads`.

## Scripts

| Command                                      | Does                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                                   | Run web and API in watch mode                                              |
| `pnpm build`                                 | Build every package                                                        |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks, also run in CI                                                     |
| `pnpm format`                                | Format with Prettier                                                       |
| `pnpm db:up` / `pnpm db:down`                | Start or stop Postgres and Redis                                           |
| `pnpm db:migrate`                            | Create and apply a migration after editing `apps/api/prisma/schema.prisma` |
| `pnpm db:seed`                               | Load sample categories, products and variants (safe to re-run)             |
| `pnpm db:studio`                             | Browse the database in Prisma Studio                                       |

## Database

The schema lives in `apps/api/prisma/schema.prisma`. Every change becomes a plain SQL migration in `apps/api/prisma/migrations`, which is committed and can be read or edited before it runs. Rules Prisma can't express (stock never below zero, reserved never above stock, positive prices and quantities) are hand-written `CHECK` constraints at the end of the migration.

API tests run against a real Postgres database of their own (`TEST_DATABASE_URL`, created and migrated automatically), so `pnpm test` never touches your development data. Only `pnpm db:up` is needed first. The API endpoints are listed in [apps/api/README.md](apps/api/README.md).
