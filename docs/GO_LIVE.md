# Going live: step-by-step

This is the checklist for putting Noor's online. Follow it top to bottom. Each step says what to
click and what to copy where. Steps marked **Only you** need the business owner: they involve
signing up, ID or bank checks (KYC), payment details or the domain. A developer can do the
rest with access to the accounts.

Throughout, **`noors.in` stands for your own domain**. Replace it with the real one everywhere.

How the pieces fit:

| Piece                           | Where it runs                | Address                       |
| ------------------------------- | ---------------------------- | ----------------------------- |
| Shop and dashboard (`apps/web`) | Vercel                       | `https://noors.in`            |
| API (`apps/api`)                | Railway, from the Dockerfile | `https://api.noors.in`        |
| Database (Postgres)             | Railway                      | private, only the API sees it |
| Product photos                  | Cloudinary                   | `res.cloudinary.com`          |
| Emails                          | Resend                       | sent from `orders@noors.in`   |

Shoppers only ever open `noors.in`. The shop passes `/api/...` requests on to the API behind the
scenes, so sign-in cookies belong to `noors.in`. Razorpay and Shiprocket call the API directly at
`api.noors.in`.

---

## 0. Before you start

**Only you.** Have these ready:

- The domain, bought at a registrar (GoDaddy, Namecheap, BigRock...), and its login.
- The code on GitHub, with your GitHub login.
- A password manager (Bitwarden, 1Password...) to store every key below. Never paste keys into
  chat, email or the code.
- Accounts (free sign-ups unless noted): [Railway](https://railway.com),
  [Vercel](https://vercel.com), [Cloudinary](https://cloudinary.com),
  [Resend](https://resend.com), [Razorpay](https://razorpay.com),
  [Shiprocket](https://www.shiprocket.in), [UptimeRobot](https://uptimerobot.com) and
  optionally [Sentry](https://sentry.io). Sign up to all of them with the business email.

Plans, checked before you pay:

- **Vercel:** the free Hobby plan is for non-commercial use only. A shop needs the **Pro** plan.
- **Railway:** pick a paid plan; database backups (step 6) may need the Pro plan.

**Make two secrets.** Each is a long random string. In your password manager, generate a
64-character random password with letters and numbers only, twice, and save them as:

- `APP_SECRET`: encrypts two-factor sign-in keys. Never change it after launch (that turns off
  everyone's two-factor sign-in).
- `REVALIDATE_SECRET`: lets the API tell the shop to refresh its product pages. The same value
  goes on Railway and on Vercel.

(If you have a terminal, `openssl rand -hex 32` makes one too.)

> **The API refuses to start in production until every required key is set** (Razorpay,
> Shiprocket, Resend, Cloudinary, `APP_SECRET`). That is deliberate. So collect the keys in steps
> 1 to 4 first. Razorpay's _test_ keys are fine for the first deploy; you swap in the live keys
> in step 10.

---

## 1. Cloudinary (product photos)

**Only you** (sign-up).

1. Sign up at cloudinary.com.
2. Open **Dashboard** (or **Settings > API Keys**). Copy the **API environment variable**. It
   looks like `cloudinary://123456789012345:abcDEF...@your-cloud-name`.
3. Save it as `CLOUDINARY_URL`.

Photos uploaded in the dashboard then live on Cloudinary. The API's own disk is wiped on every
deploy, which is why production requires this.

## 2. Resend (emails): get the key

**Only you** (sign-up). Domain checks come later, in step 9.

1. Sign up at resend.com.
2. **API Keys > Create API key**, permission **Sending access**. Copy it (starts `re_`) and save
   it as `RESEND_API_KEY`.

## 3. Razorpay: test keys for now

1. Sign in to the Razorpay dashboard. Make sure the switch at the top says **Test mode**.
2. **Account & Settings > API Keys > Generate test key**. Save the Key ID (`rzp_test_...`) as
   `RAZORPAY_KEY_ID` and the secret as `RAZORPAY_KEY_SECRET`.
3. Make up a webhook secret (another random string from your password manager) and save it as
   `RAZORPAY_WEBHOOK_SECRET`. You add the webhook itself in step 10.

## 4. Shiprocket: API user

**Only you** (sign-up and KYC).

1. Sign up at shiprocket.in and finish their KYC.
2. **Settings > Pickup Address**: add the address parcels are collected from. Note its exact
   **nickname** (e.g. `Primary`) and its **pincode**.
3. **Settings > API > Configure > Create an API user**. Use a different email from your own login
   (e.g. `api@noors.in`). Save the email and password as `SHIPROCKET_EMAIL` and
   `SHIPROCKET_PASSWORD`.
4. Make up a webhook token (a random string) and save it as `SHIPROCKET_WEBHOOK_TOKEN`. You add
   the webhook itself in step 11.
5. Add money to the Shiprocket wallet before launch; bookings fail on an empty wallet.

---

## 5. Railway: database and API

### 5a. Create the project and database

1. In Railway: **New Project > Deploy from GitHub repo**, and pick the Noor's repository. (Give
   Railway access to it when GitHub asks.) This creates the API service. Its first build may fail
   because the variables aren't set yet; that's expected.
2. In the same project: **+ Create** (or **New**) **> Database > PostgreSQL**. A service named
   **Postgres** appears.

### 5b. Set up the API service

Open the API service (named after the repository; rename it to `api` under **Settings**).

**Settings:**

- **Root Directory:** leave empty (the whole repository). The API needs the shared code next to it.
- **Config file:** Railway reads `railway.json` at the repository root. It already says: build
  with `apps/api/Dockerfile`, run the database migrations before each deploy, and check
  `/api/v1/health` before switching traffic. Nothing to type.
- **Branch:** your main branch (`master`). Every push to it redeploys the API. Optionally turn on
  **Wait for CI** so a push only deploys after the GitHub checks pass.

**Variables** tab, then **Raw Editor**, paste this, fill in the values from steps 0 to 4, then
**Update Variables**:

```bash
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
CORS_ORIGINS=https://noors.in,https://www.noors.in
APP_SECRET=
STORE_URL=https://noors.in
WEB_URL=https://noors.in
REVALIDATE_SECRET=
CLOUDINARY_URL=
RESEND_API_KEY=
EMAIL_FROM=Noor's <orders@noors.in>
ORDER_ALERT_EMAIL=you@yourmail.com
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
SHIPROCKET_PICKUP_LOCATION=Primary
SHIPROCKET_PICKUP_PINCODE=190001
SHIPROCKET_WEBHOOK_TOKEN=
SENTRY_DSN=
TRUST_PROXY_HOPS=2
```

What they mean is in `apps/api/.env.example`. Notes:

- `DATABASE_URL` is typed exactly as shown: Railway fills in the database's private address.
- `CORS_ORIGINS` must list every address the shop is opened at. A dashboard save from any other
  address is refused as a forged request.
- `SHIPROCKET_PICKUP_LOCATION` and `SHIPROCKET_PICKUP_PINCODE`: the nickname and pincode from
  step 4, exactly as Shiprocket shows them.
- `SENTRY_DSN` can stay empty (see step 12).
- `TRUST_PROXY_HOPS=2` tells the API that shoppers' requests pass through Vercel and then
  Railway, so sign-in and checkout limits count each shopper separately instead of lumping
  everyone together.
- Do not set `PORT`; Railway sets it.

Railway redeploys after you save. Open **Deployments** and wait for a green **Active**. If it
fails, open the deployment's logs: a line like `RAZORPAY_KEY_ID: Required in production` names
the missing variable.

### 5c. Give the API its address

1. API service > **Settings > Networking > Custom Domain**, enter `api.noors.in`.
2. Railway shows a DNS record to add (a **CNAME** for `api` pointing at something like
   `xyz.up.railway.app`, and sometimes a **TXT** record to prove ownership). Keep the tab open;
   you add these in step 8.

## 6. Backups

**Only you** (plan choice).

1. Open the **Postgres** service > **Backups** tab.
2. Turn on the **Daily** schedule. The plan is to keep daily backups for **7 days**; check the
   retention Railway shows next to the schedule. If Railway keeps them for less, also turn on the
   **Weekly** schedule.
3. Once the shop is live, check the tab a day later and confirm a backup appeared.

**To restore** (after a bad mistake, e.g. products deleted): in the Postgres service's
**Backups** tab, pick the backup from before the mistake and choose **Restore**. Railway prepares
the restore and asks you to confirm or deploy it. Everything after that backup's time is lost
(orders included), so note recent orders first. Ask a developer to help if you can.

---

## 7. Vercel: the shop

1. In Vercel: **Add New > Project**, import the same GitHub repository.
2. **Root Directory:** click **Edit** and choose `apps/web`. Framework: **Next.js** (detected).
   Leave the build and install commands alone: `apps/web/vercel.json` sets them (install the
   workspace with pnpm, then `turbo run build --filter=@noors/web`, which builds the shared
   package first).
3. **Environment Variables**, for all environments:

   | Name                | Value                        |
   | ------------------- | ---------------------------- |
   | `API_URL`           | `https://api.noors.in`       |
   | `SITE_URL`          | `https://noors.in`           |
   | `REVALIDATE_SECRET` | the same value as on Railway |

   `API_URL` is read when the shop is built: if you change it later, redeploy (**Deployments >
   ... > Redeploy**).

4. **Deploy.** The first build takes a few minutes.
5. **Settings > Domains:** add `noors.in` and `www.noors.in`. Vercel suggests redirecting one to
   the other; keep `noors.in` as the main one (it must match `SITE_URL`). Vercel shows the DNS
   records it needs; keep the tab open.

Every push to `master` redeploys the shop.

## 8. DNS records at your registrar

**Only you** (registrar login).

In the registrar's DNS settings for `noors.in`, add exactly what Railway and Vercel showed you.
Typically:

| Type  | Name / Host | Value                                                | From    |
| ----- | ----------- | ---------------------------------------------------- | ------- |
| A     | `@`         | the IP Vercel shows (e.g. `76.76.21.21`)             | Vercel  |
| CNAME | `www`       | the value Vercel shows (e.g. `cname.vercel-dns.com`) | Vercel  |
| CNAME | `api`       | the `....up.railway.app` value Railway shows         | Railway |
| TXT   | as shown    | as shown (if Railway asked for one)                  | Railway |

Remove any old `A` record for `@` or `www` that points elsewhere (e.g. a registrar parking page).
Records usually work within an hour, sometimes up to a day. Railway and Vercel each show a green
tick when they see them and set up HTTPS by themselves.

Check: open `https://api.noors.in/api/v1/health`. You should see `"status":"ok"`. Then open
`https://noors.in`.

## 9. Resend: verify the domain

**Only you** (DNS).

1. Resend > **Domains > Add Domain**, enter `noors.in`, region closest to India.
2. Resend lists DNS records: an **MX** and a **TXT** record for a `send` subdomain (that's
   SPF) and a **TXT** record named `resend._domainkey` (that's DKIM). Add each one at your
   registrar exactly as shown.
3. Recommended: also add a TXT record named `_dmarc` with value `v=DMARC1; p=none;` so mail
   providers trust the emails.
4. Back in Resend, click **Verify**. Wait for **Verified** (minutes to hours).

Until it shows Verified, emails (order confirmations, sign-in codes) are not delivered.

---

## 10. Razorpay: go live

**Only you** (KYC and bank details).

1. **Activate the account** (Razorpay's KYC): business details, PAN, GST if any, and the bank
   account for payouts. Razorpay checks the website: give `https://noors.in`, and make sure these
   pages are live and filled in: `/terms`, `/privacy`, `/shipping`, `/returns` (refunds and
   cancellations) and `/contact`. Approval can take a few working days.
2. When activated, flip the dashboard to **Live mode**.
3. **Account & Settings > API Keys > Generate live key.** Copy the Key ID (`rzp_live_...`) and
   secret.
4. **Account & Settings > Webhooks > Add new webhook** (in Live mode; test-mode webhooks don't
   carry over):
   - URL: `https://api.noors.in/api/v1/webhooks/razorpay`
   - Secret: a new random string
   - Events: `payment.captured`, `payment.failed`, `refund.processed` (and `order.paid` if
     offered)
5. In Railway (API service > Variables), replace `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
   `RAZORPAY_WEBHOOK_SECRET` with the live values. Railway redeploys.

## 11. Shiprocket: webhook

1. Shiprocket > **Settings > API > Webhooks**.
2. URL: `https://api.noors.in/api/v1/webhooks/courier`. Token: the `SHIPROCKET_WEBHOOK_TOKEN`
   from step 4. Save. (The path avoids the word "shiprocket" on purpose; their dashboard rejects
   it.)
3. Check the wallet has money and the pickup address is verified.

---

## 12. Monitoring

### Uptime check on the API

1. UptimeRobot (free) > **Add New Monitor**, type **HTTP(s)**.
2. URL: `https://api.noors.in/api/v1/health`, every 5 minutes.
3. Alert contact: your email (and phone app if you like).

It alerts you when the API is down or can't reach the database (the page then answers with an
error). Add a second monitor for `https://noors.in` too. Better Stack's free plan works the same
way.

### Error reports from the API (optional, recommended)

1. Sentry > **Create Project**, platform **Node.js** (Express). Copy the **DSN**.
2. Railway > API service > Variables: set `SENTRY_DSN` to it.

Server errors (anything that shows a shopper "Something went wrong", and failed background jobs
like emails or shipment bookings) then appear in Sentry with an email alert.

### The shop

Vercel monitors the shop itself: **Project > Logs** shows errors from shop pages, and
**Observability** shows traffic and failures. Under **Settings > Notifications** turn on emails
for failed deployments.

---

## 13. Dashboard accounts

### Create your owner account

The live database starts empty: no products, no accounts. **Never run `pnpm db:seed` against
it** (it adds sample products and a development account).

From your computer, with the code checked out and `pnpm install` done:

1. Railway > **Postgres** service > **Variables**: copy `DATABASE_PUBLIC_URL`.
2. In a terminal at the repository folder, run (on one line):

   ```bash
   DATABASE_URL='<paste DATABASE_PUBLIC_URL>' ADMIN_PASSWORD='<a long password>' pnpm --filter @noors/api admin:create --email you@noors.in --name "Your Name" --role OWNER
   ```

   It prints `Saved owner account ...`. Clear your terminal history afterwards.

(Without a local setup: install the Railway CLI, run `railway ssh` in the API service, and run
`ADMIN_PASSWORD='...' node dist/scripts/create-admin.js --email you@noors.in --name "Your Name" --role OWNER`.)

### Then

1. Sign in at `https://noors.in/admin`.
2. **Your account > Turn on two-factor**, scan the code with an authenticator app (Google
   Authenticator, Authy, 1Password). Keep the app's backup safe.
3. **Staff:** if you see `owner@noors.local` (only if sample data was ever loaded), open it,
   untick **Account switched on**, and save. Add real staff here; ask each to turn on two-factor.

## 14. Store settings

In the dashboard, **Settings**:

- **Store details:** store name, email, phone, GSTIN and address (they go on invoices).
- **Shipping:** fee and free-shipping threshold.
- **Cash on delivery:** off by default; turn on if you want it.
- **Returns:** return window (7 days by default).
- **Fulfilment:** automatic Shiprocket booking. Leave it **off** until the test order in step
  15 is done.
- **Integrations:** every service should say connected.

Then add categories, products (with photos) and home page banners.

---

## 15. Launch-day test

Do this once everything above is green. It uses real money (refunded straight after).

**Before:**

- [ ] `https://api.noors.in/api/v1/health` shows `"status":"ok"`.
- [ ] `https://noors.in` loads with the padlock; `https://www.noors.in` goes to it.
- [ ] Razorpay is in **Live mode**, Railway has the `rzp_live_` key.
- [ ] Resend shows the domain **Verified**.
- [ ] **Fulfilment > automatic booking is off**, so the test order isn't sent to a courier.

**The order:**

1. In a private browser window, add a cheap product to the bag and check out with your own email
   and address. Pay with a real card or UPI.
2. [ ] The order page says paid.
3. [ ] The order confirmation email arrives (check spam), and `ORDER_ALERT_EMAIL` gets the
       new-order alert.
4. [ ] The dashboard shows the order as paid; Razorpay (Live) shows the payment as captured.
5. In the dashboard, open the order and **Refund** the full amount (or **Cancel order** with a
   refund).
6. [ ] The order shows refunded a few minutes later (Razorpay's webhook). The money reaches the
       card or UPI account in 5 to 7 working days.

**Also check:**

- [ ] Shopper sign-in: the 6-digit code arrives by email.
- [ ] Edit a product's price in the dashboard, reload its page in the shop: the new price shows
      straight away.
- [ ] Upload a product photo of a few MB: it saves, and the image address starts with
      `res.cloudinary.com`.
- [ ] Book one real shipment (e.g. a parcel to yourself with **Book with Shiprocket**) and
      watch the status change to Shipped when the courier scans it.
- [ ] UptimeRobot shows the monitor **Up**.

Then turn **automatic booking back on** in Settings. You're live.

---

## After launch

- **Deploying changes:** merge to `master`. Railway rebuilds the API (running new database
  migrations first) and Vercel rebuilds the shop.
- **Rolling back:** Vercel > Deployments > an older one > **Promote** (or Instant Rollback).
  Railway > API service > Deployments > an older one > **Redeploy**. Database migrations are not
  undone by a rollback; ask a developer.
- **Changing a key:** edit it in Railway or Vercel Variables; both redeploy. Never change
  `APP_SECRET`.
- **If the API is down:** UptimeRobot emails you. Look at Railway > API service > Deployments >
  logs, and Sentry.
