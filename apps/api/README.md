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

Response types live in `packages/shared/src/catalog.ts`.

Errors are JSON: `{ error: { code, message } }`, or `{ error: { code: 'validation_error', issues } }`
for a bad query.
