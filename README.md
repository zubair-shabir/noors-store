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

## Storefront

Every store page reads the catalogue from the API (`API_URL`). Responses are cached for 60
seconds, so dashboard edits show up in the store within a minute. "Latest Drip"
(`/shop/latest`) is every active product, newest first, not a category. If the API is
down, the layout and home page still render without their product sections; other store
pages show the error page.

## Checkout and payments

The bag lives on the server (a cookie for guests, the account once signed in). Checkout
re-prices everything, holds the stock for 30 minutes and opens Razorpay; an unpaid order is
cancelled after that and its items go back on sale. Shoppers sign in with a 6-digit code
sent by email.

Without `RAZORPAY_KEY_ID` in `apps/api/.env`, development uses a test payment dialog that
stands in for Razorpay, and sign-in codes are shown on the form instead of emailed. To try
real Razorpay test mode, add your test keys, then add a webhook in the Razorpay dashboard
for `https://<your API>/api/v1/webhooks/razorpay` with the events `payment.captured`,
`payment.failed` and `refund.processed`, and put its secret in `RAZORPAY_WEBHOOK_SECRET`.

Sample coupons from the seed: `WINTER50` (50% off, up to ₹2,000), `WELCOME10` (10% off a
first order) and `FLAT300` (₹300 off orders of ₹2,999 or more).

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
