# Review Room — Buyer Setup

This guide starts from a clean copy of the source. Review Room is one Next.js application with Supabase Auth/Storage and PostgreSQL; there is no separate backend service to buy. Bring your own Supabase project and hosting account. The seller's public demo accounts/backend are not installation credentials.

## 1. Requirements and supported runtime

- Node.js **22.18 or newer in the 22.x line**, pnpm **11.21.0**, Git or the source ZIP.
- A buyer-controlled hosted Supabase project with PostgreSQL, Auth and private Storage. Use a separate development project before production.
- Vercel is the supported production host. Signup uses only Vercel's trusted IP header; generic VPS/Docker production signup is intentionally unsupported. The two deployment methods below both target Vercel; they do not imply support for another platform.
- Optional local PostgreSQL 18 command-line tools for database-only fixtures/tests; optional Chrome/Python 3 only for screenshot/ZIP-integrity development checks. Neither is needed by the hosted app.
- Account quotas/costs depend on the buyer's Vercel/Supabase usage and current plans. Vercel Hobby is for personal/non-commercial use; choose an appropriate commercial plan when needed (https://vercel.com/docs/plans/hobby). No paid queue, billing system, or subscription management is bundled. Real Auth email delivery needs a configured SMTP sender/provider; app notifications are optional.

## 2. Install and configure

```sh
node --version
corepack enable
corepack prepare pnpm@11.21.0 --activate
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` **only when `.env` does not already exist**. Do not overwrite an existing installation's secrets. Replace local database examples with the new development project's own URLs. Never use the seller's live backend.

| Variable                               | Value / purpose                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | `http://localhost:3000` locally; exact HTTPS application origin in production                                           |
| `NEXT_PUBLIC_SUPABASE_URL`             | Your project's HTTPS API URL                                                                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same project's public publishable key                                                                                   |
| `SUPABASE_SECRET_KEY`                  | Same project's private server key; never prefix with NEXT_PUBLIC                                                        |
| `DATABASE_URL`                         | Supabase Connect transaction-pooler URL (normally port 6543), encoded password, `?pgbouncer=true&schema=app`            |
| `DIRECT_URL`                           | Same project's session pooler (5432) or reachable direct URL, encoded password, `?schema=app`; operator migrations only |
| `SUPABASE_DB_CA_CERT`                  | Complete downloaded PEM, including BEGIN/END lines; quoted multiline in local dotenv, raw complete text in Vercel       |
| `SUPABASE_STORAGE_BUCKET`              | Exactly `review-room-private`                                                                                           |
| `SIGNUP_RATE_LIMIT_SECRET`             | Stable independent private HMAC secret; generate with `openssl rand -hex 32`                                            |
| `CRON_SECRET`                          | Separate private 32+ character secret; generate independently                                                           |
| `PRODUCTION_SUPABASE_PROJECT_REF`      | Your production project's 20-character ref; configure before Preview/hosted testing                                     |
| `PREVIEW_SUPABASE_PROJECT_REF`         | A separate non-production project for a configured Preview deployment                                                   |
| `HOSTED_TEST_PROJECT_REF`              | Only for the guarded optional hosted test harness, never production                                                     |
| `REVIEWER_DEMO_ENABLED`                | `false` on buyer installations; `/demo` still supplies the separate guest walkthrough                                   |

Use Supabase **Connect** for your project's actual database host, pooler region and username. Percent-encode special characters in the database password; do not encode the whole URL. In Vercel's Value field, paste only the value, without `DATABASE_URL=` or outer quotation marks. Keep the complete public CA certificate; do not disable TLS verification. Do not rotate existing signing/encryption keys as part of routine redeploys.

## 3. Create the database and private bucket

With the new development project selected by `DIRECT_URL`, run:

```sh
pnpm db:validate
pnpm db:deploy
```

The current source contains **26 versioned migrations**, creating **30 application tables** under `app` with RLS. This command applies reviewed migrations; it does not create Auth users or a bucket. Never use `db push`, reset or the local seed against production. Prisma generation also runs during install/build.

In that project's Supabase SQL Editor, inspect and execute `supabase/001_application_access.sql`, then `supabase/002_private_bucket.sql`. They revoke browser table access and create/verify the private `review-room-private` bucket with a 10 MiB limit and JPEG/PNG/WebP allowlist. Conflicting existing bucket settings fail for inspection; do not silently overwrite another app's bucket. Keep `app` out of the Data API exposed schemas and do not create public Storage read policies.

## 4. Configure Supabase Auth

Dashboard labels can vary; these are the intended sections:

1. **Authentication → Hooks → Before User Created**: choose Postgres function `app.before_user_created` and enable it.
2. **Authentication → Sign In / Providers → Email**: enable Email/password; set **Confirm email ON** for the verification-aware flow.
3. **Authentication → Email → SMTP Settings**: configure a verified sender through your own SMTP provider, then test using an inbox you control. The source does not create a provider account or deliver mail by itself.
   For Resend SMTP, use host `smtp.resend.com`, port `465`, username `resend` and your private Resend API key as the SMTP password. The sender domain must be verified in your Resend account. These values follow the [official Resend Supabase guide](https://resend.com/docs/send-with-supabase-smtp); app `MAIL_API_KEY` alone does not configure Supabase Auth SMTP.

4. **Authentication → URL Configuration**: set Site URL to your application origin and allow the exact `/auth/callback` destination for local/production origins as appropriate. Preserve legitimate verification/recovery callback query parameters; never allow arbitrary return origins.
5. Optional **Authentication → Sign In / Providers → Google**: enter your own Google OAuth credentials. In Google Cloud configure the Supabase provider callback `https://<your-project-ref>.supabase.co/auth/v1/callback` and the appropriate app origins/consent screen. Without a configured provider, Google login is not available; email login remains supported.

A verified signup creates one personal workspace/OWNER membership idempotently. Invitees can join existing work without an unnecessary empty workspace. Existing users retain memberships; accepting a new invitation may require fresh **Verify my email** proof. Password reset requires an actual fresh provider recovery link; a regular login cannot replace it.

## 5. Start locally

```sh
pnpm supabase:check
pnpm dev
```

Open `http://localhost:3000`. The homepage preview works without credentials; `/demo` needs the migrated database, while real workspaces and uploads also need hosted Auth/Storage. Complete one owner signup, invite a controlled Designer/Client address, upload a synthetic design and review it. App invitation email is optional: copy/send the generated link manually when mail is disabled.

For **database-only** development/tests, run `pnpm db:local:start`, use the loopback URLs from `.env.example`, then run `pnpm test:integration`. These synthetic identities cannot sign in to Supabase. A plain local PostgreSQL cluster does not supply hosted Auth/Storage.

## 6. Deploy — method A: Git integration → Vercel

1. Put your clean source in your own private Git repository and import it into Vercel as a Next.js project. Retain `pnpm-lock.yaml` and use Node 22.x / `pnpm build`.
2. Add the required variables under **Settings → Environment Variables**, scoped to Production. Configure production origin before the build because public environment values are compiled into the browser bundle. Set public reviewer cards OFF. Do not copy production credentials into Preview.
3. Back up the intended target's database/Auth/configuration and private original bytes. Using a trusted operator environment with the production `DIRECT_URL`, separately run `pnpm db:deploy`. Coordinate additive schema changes and matching code; do not mix old invitation writers with the new proof contract.
4. Deploy the compatible code. Vercel's build runs `prisma generate && next build`; **build does not apply migrations**.
5. Confirm Supabase URL/SMTP/Google settings now point to the final domain. Check the scheduled `/api/maintenance` job and its `CRON_SECRET`. The default schedule is daily at 03:00 UTC; hosting-plan cron availability/frequency must be checked with the provider.

## 7. Deploy — method B: Vercel CLI

This is a CLI alternative to Git import, on the same supported Vercel platform. Install/authenticate the official Vercel CLI yourself, then link the buyer's project:

```sh
vercel login
vercel link
vercel env pull .env.production.local --environment=production
```

Set/verify the same production environment in the Dashboard first. The downloaded file is private and ignored; do not ship it. Perform the separately authorized backup/migration step above, then:

```sh
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

Do not run deployment commands as a setup check or against the seller's project. CLI credentials, generated `.vercel` state and downloaded environment files are never part of the source package. The buyer selects when to publish.

## 8. Optional features and limits

- **Application notifications:** default `MAIL_ENABLED=false`. Configure a verified sender and an HTTPS Resend-compatible transport with idempotency support using `MAIL_API_URL`, `MAIL_API_KEY`, `MAIL_FROM`, and a separate stable `MAIL_PAYLOAD_SECRET` (`openssl rand -hex 32`). Supabase Auth SMTP is separate. Enable only after a controlled inbox delivery check. Saved business work survives mail failure; provider acceptance is not proof of inbox delivery.
- **ZIP:** `DELIVERY_ZIP_ENABLED=false` until hosted size/time/memory checks. A separate private `DELIVERY_ZIP_BUCKET` must permit `application/zip`. Cap: 20 originals / 100 MiB, additionally bounded by the bucket limit. Packages expire after 24 hours, downloads after 60 seconds; maintenance retries physical deletion. Prepare/retry dispatches a durable job; cron cleans artifacts. Individual downloads remain available.
- **Analytics disclosure:** production public `/`, `/login`, `/signup` pageviews use Vercel Web Analytics, with query strings/fragments stripped. Private/capability/demo routes and custom events are excluded. This integration is visible in `src/components/site-analytics.tsx`; the buyer controls Dashboard enablement.
- **Soft removal:** owner impact preview, share revocation, 30-day self-service restore. Original bytes remain counted and completed delivery originals are retained. Permanent purge is unavailable. Reopen/restore a completed/archived project before changing designs.
- Defaults: 500 MiB READY+reserved storage, 200 versions and five pending reservations per workspace, configurable through `.env.example`. This is usage protection, not billing. Public reviewer accounts have their own tighter durable quotas.
- Scope: static JPG/PNG/WebP design review. No video/PDF/Figma integration, payments, subscription billing, legal e-signature or anonymous guest write access to real projects.

## 9. Release checks, recovery and troubleshooting

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm release:smoke https://your-app.vercel.app
```

Only use `pnpm test:integration` against the dedicated loopback database, and `pnpm test:browser` against a separately configured disposable hosted project. Neither is a production smoke test. Browser/real inbox/phone acceptance is separate from local test results.

Before accepting customer use: verify owner/designer/client visibility, actual private image uploads, V1/V2 feedback and approvals, original download, logout and denied access to an unrelated project. Check confirmation/recovery links and Google only when configured. Ensure a database/Auth/config + original Storage backup can be restored into an isolated project; a database dump alone does not contain image bytes. See `docs/RELEASE.md` and `docs/RUNBOOK.md` for controlled upgrade/recovery.

| Symptom                            | Check                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Database URL error / 503 reference | Value only (no variable name/quotes), encoded password, same-project username/host, complete CA; inspect sanitized server reference |
| Google returns to localhost        | Supabase Site URL, callback allowlist and production `NEXT_PUBLIC_APP_URL`; rebuild after changing public variables                 |
| Signup pending / email absent      | Confirm email state, verified SMTP sender, provider limits and controlled inbox; never disable identity checks as a workaround      |
| Missing generated Prisma Client    | Use `pnpm build`, which explicitly generates it; retain the build script on Vercel                                                  |
| Preview refuses backend            | Use a separate project and correct production/Preview refs; never bypass the guard                                                  |
| ZIP unavailable                    | Keep individual downloads; verify feature flag, separate private bucket, package limits and hosted measurement                      |

For purchase support, use the marketplace order/support channel. Never post passwords, service keys, private files or connection URLs in an issue or support screenshot.
