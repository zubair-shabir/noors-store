# Noor's API

Express API under `/api/v1`. All money values are integer paise (₹2,499 = `249900`).

## Public catalogue

Only `ACTIVE` products and active variants are returned. Responses carry
`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

| Method | Path                 | Returns                                                                     |
| ------ | -------------------- | --------------------------------------------------------------------------- |
| GET    | `/health`            | `{ status, uptime, checks: { database } }`, 503 when the database is down   |
| GET    | `/categories`        | `{ items: Category[] }` in sort order, with live product counts             |
| GET    | `/categories/:slug`  | One category                                                                |
| GET    | `/products`          | `Paginated<ProductSummary>`; query below                                    |
| GET    | `/products/:slug`    | `ProductDetail` with options, every image and per-variant availability      |
| GET    | `/featured`          | `{ items: ProductSummary[] }` by featured rank                              |
| GET    | `/search?q=`         | Up to 8 matches on name, tag or category name                               |
| GET    | `/collections/:slug` | Manual collections in their set order; rule collections apply their filters |

`GET /products` query: `category`, `q`, `size` and `colour` (comma lists, matched on the same
variant), `minPrice` and `maxPrice` (paise, any variant in range), `sort` (`newest`, `price_asc`,
`price_desc`), `page`, `limit` (max 60). Sold-out products are always listed last.

A product's `price` is its cheapest in-stock variant (cheapest overall when sold out).
Availability is `stock - reserved`, so units held by unpaid checkouts are not sold twice;
`lowStock` is true under 5 units.

`GET /banners?placement=HERO|ANNOUNCEMENT|CATEGORY_TILE` returns active home page banners in
order. The first hero banner's title and subtitle are the hero headline; every hero banner adds
a photo to the strip.

Response types live in `packages/shared/src/catalog.ts`.

## Admin (`/admin`)

Signed-in dashboard users only. `POST /admin/auth/login` sets an httpOnly `noors_admin` session
cookie (7 days, `SameSite=Lax`; the database stores only a SHA-256 of the token). The web app
proxies `/api` to this server so the cookie stays first-party. Sign-in is limited to 10 attempts
per IP per 15 minutes, and a state-changing request from a foreign `Origin` is refused.

Owners can do everything below. Staff can read the catalogue and change variant stock only.
Every change is written to `audit_logs`; every stock change also to `inventory_logs`.

| Method               | Path                                 | Does                                                                         |
| -------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| POST                 | `/admin/auth/login` · `/auth/logout` | Start or end a session                                                       |
| GET                  | `/admin/auth/me`                     | The signed-in admin                                                          |
| GET · POST           | `/admin/products`                    | List (search `q`, `status`, `categoryId`, pages) · create a draft            |
| GET · PATCH · DELETE | `/admin/products/:id`                | Read, edit, delete. Going `ACTIVE` needs an active variant with a price      |
| POST                 | `/admin/products/:id/duplicate`      | Copy as a draft with fresh SKUs and no stock                                 |
| PUT                  | `/admin/products/:id/options`        | Set options and regenerate variants (existing combinations keep their data)  |
| PATCH                | `/admin/products/:id/variants`       | Bulk edit SKU, prices, stock, weight, size, on/off                           |
| PUT                  | `/admin/products/:id/images`         | Replace the ordered gallery; images can belong to one colour                 |
| GET · POST · PUT     | `/admin/categories` · `/order`       | List, create, reorder                                                        |
| PATCH · DELETE       | `/admin/categories/:id`              | Edit; delete only when empty                                                 |
| GET · POST           | `/admin/collections`                 | List, create (manual product list or rules)                                  |
| GET · PUT · DELETE   | `/admin/collections/:id`             | Read with resolved products, replace, delete                                 |
| GET · PUT            | `/admin/featured`                    | Featured products in home page order; PUT sets the whole list                |
| GET · POST · PUT     | `/admin/banners` · `/order`          | List by placement, create, reorder within a placement                        |
| PATCH · DELETE       | `/admin/banners/:id`                 | Edit, delete                                                                 |
| POST                 | `/admin/uploads`                     | Multipart `file` (JPEG, PNG, WebP, AVIF, GIF up to 10 MB), returns `{ url }` |

Request and response types live in `packages/shared/src/admin.ts`.

Errors are JSON: `{ error: { code, message } }`, or `{ error: { code: 'validation_error', issues } }`
for a bad query.
