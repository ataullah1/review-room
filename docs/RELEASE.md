# Release operations — rreviewroom.vercel.app

Prepared 18 October 2026. Target: **https://rreviewroom.vercel.app**. The owner confirmed that **pwzwrknnzkdagfcjnqkr** now serves the live application; earlier documents calling it development describe historical checks. Treat it as production from this point onward.

**Historical baseline:** before that deployment, the older homepage lacked the demo link and `/demo` returned 404; all 11 then-current release checks failed. That earlier result is superseded by the 17 passing live checks above, rather than erased from the verification history. The instructions below remain the setup and operations reference for future releases.

## 1. Set Production environment variables before pushing

Vercel → **the project serving rreviewroom.vercel.app → Settings → Environment Variables**. Scope the following to **Production**, not All Environments. Keep existing secret values private; do not paste them into chat, screenshots, Git or documentation.

| Variable                               | Production value/action                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | `https://rreviewroom.vercel.app` — no localhost                                                                             |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://pwzwrknnzkdagfcjnqkr.supabase.co`                                                                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | This project's publishable key; reuse the existing correct value                                                            |
| `SUPABASE_SECRET_KEY`                  | This project's private server secret key; never prefix with NEXT_PUBLIC                                                     |
| `DATABASE_URL`                         | Copy this project's transaction pooler connection from Supabase Connect, port 6543; URL-encode the password                 |
| `SUPABASE_DB_CA_CERT`                  | Full PEM public CA certificate from the Database Settings path below; required for deployed database requests               |
| `SUPABASE_STORAGE_BUCKET`              | `review-room-private`                                                                                                       |
| `SIGNUP_RATE_LIMIT_SECRET`             | Existing stable private HMAC secret, at least 32 characters; do not rotate casually because guest cookies/IP buckets use it |
| `CRON_SECRET`                          | New independent private random value, at least 32 characters, e.g. generate locally with `openssl rand -hex 32`             |

`DIRECT_URL` is needed by an operator running Prisma migration commands, not by normal runtime/builds. Use this project's session pooler on port 5432, or a reachable direct connection; do not send migrations through port 6543. Do not set `TEST_DATABASE_URL` in Vercel Production. Preserve local `.env`'s `NEXT_PUBLIC_APP_URL=http://localhost:3000`; changing the local origin to the live URL breaks same-origin local forms. A local `.env` change does not update Vercel.

**Database TLS:** Supabase → [Database → Settings → SSL Configuration](https://supabase.com/dashboard/project/pwzwrknnzkdagfcjnqkr/database/settings) → **Download certificate**. Paste the complete PEM into the Vercel `SUPABASE_DB_CA_CERT` value, preserving its BEGIN/END lines. Actual multiline text and literal `\n` separators are supported. This is a public CA certificate, not a database password or private key. A verified-TLS read-only connection probe without this CA failed with `SELF_SIGNED_CERT_IN_CHAIN`; do not work around it using `rejectUnauthorized:false` or disabling TLS. The new runtime fails closed on deployed backends without a CA, strips conflicting URL SSL options, and uses `rejectUnauthorized:true`. A successful authenticated production database connection with the supplied CA remains to be verified after configuration. Enabling server-side SSL enforcement is a separate Dashboard action and has not been performed.

The runtime uses Prisma 7's `PrismaPg` adapter/node-postgres: the JavaScript pool is capped at **1 on Vercel**, 5 outside Vercel. Request identity/role/timezone are set inside each transaction, not as persistent session state. Existing `pgbouncer=true` is preserved in the Supabase runtime URL; do not apply advice for Prisma's older Rust engine blindly to the adapter. SSL URL parameters cannot override the explicit CA configuration.

References: [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [Prisma pooling/migration guidance](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer), [node-postgres SSL options](https://node-postgres.com/features/ssl), [Supabase SSL certificate setup](https://supabase.com/docs/guides/platform/ssl-enforcement), [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

## 2. Keep Preview away from production

Vercel → Settings → Environment Variables → filter **Preview**. Remove production database URLs, Supabase keys, signing/cron secrets and production Supabase URL from that scope. Do not put them under All Environments. The repository additionally checks isolation before DB, Storage, Supabase Auth or Auth proxy access.

Without a separate backend, Preview can render the public landing page, while backend/Auth/demo interactions fail closed. Its metadata/robots block indexing and its sitemap is empty. This is deliberate; do not disable the guard to make a preview interactive.

If an interactive Preview is later needed, create a separate disposable Supabase project and migrate/configure it independently. Set `PREVIEW_SUPABASE_PROJECT_REF`, that project's URL/keys/CA and pooled URLs in Preview only. Both DB and Auth must match the declared non-production project; a copied production DIRECT_URL also causes rejection. Set a preview-specific app origin/Auth callback allowlist; stable staging is easier than broad wildcard URLs. Never use production credentials for an untrusted branch build even with this runtime guard.

`pnpm test:browser` now requires `HOSTED_TEST_PROJECT_REF`, corresponding non-production public URL and session/direct DB URL. It refuses the live project **before connecting or creating fixtures**. Historical runbook instructions targeting the old development project are superseded. The normal unit/integration suite and migration rehearsal remain local.

## 3. Auth Dashboard paths and exact URLs

Supabase → [Authentication → URL Configuration](https://supabase.com/dashboard/project/pwzwrknnzkdagfcjnqkr/auth/url-configuration):

- **Site URL:** `https://rreviewroom.vercel.app`
- **Redirect URLs:** include the exact `https://rreviewroom.vercel.app/auth/callback`.
- Remove obsolete deployed callbacks. Only retain localhost callbacks if intentionally using this live project for local Auth; a separate development project is the safer long-term arrangement. Do not add a broad production wildcard for arbitrary previews.

Supabase → [Authentication → Sign In / Providers → Email](https://supabase.com/dashboard/project/pwzwrknnzkdagfcjnqkr/auth/providers): Confirm email **OFF**, matching the implemented immediate-sign-in flow. This was previously reported saved by the owner; verify rather than claiming it was changed again.

Supabase → **Authentication → Hooks → Before User Created**: the Postgres hook must be enabled for `app.before_user_created`, URI `pg-functions://postgres/app/before_user_created`. This was previously reported saved; activation is not established by checking that the SQL function exists alone.

Google Cloud Console → **Google Auth Platform → Clients → existing Web application client** (legacy navigation: APIs & Services → Credentials → the OAuth client):

- Authorized JavaScript origin: `https://rreviewroom.vercel.app`.
- Authorized redirect URI: `https://pwzwrknnzkdagfcjnqkr.supabase.co/auth/v1/callback`.
- The application `/auth/callback` belongs in the Supabase redirect allowlist; it is not the Google-to-Supabase callback above.

Supabase → Authentication → Sign In / Providers → **Google**: the same Google client ID/secret must be configured. Keep the secret in the provider Dashboard. Verify Google consent/publishing/test-user status as appropriate for the existing OAuth client. A real interactive sign-in/consent/callback is still a manual acceptance step. [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 4. Build, migrations and release order

The GitHub repository is already connected to Vercel; do not create a second project/domain. `vercel.json` declares Next.js, `pnpm build`, Tokyo `hnd1` (matching the current database's ap-northeast-1 region) and the daily cleanup schedule. Confirm the production branch under **Vercel → Settings → Environments → Production** / the project's Git settings. Keep lockfile-based pnpm installation and the existing Prisma generate postinstall. `pnpm build` explicitly runs `prisma generate && next build` so the ignored `src/generated/prisma` client is recreated even when a cached install skips lifecycle scripts. Generation does not connect to the database. No migration is attached to the build command.

For this release there is **no new database migration**. The existing 13 migrations were applied during earlier steps. Their order is fixed by the directories under `prisma/migrations`: foundation → identity/RLS → Google hook → project management/insert visibility → private assets → comments → version decisions → invitations/shares → invitation role/confirmed identity fixes → activity → guest demo. Never edit previously applied SQL to retrofit production.

1. Finish the Production variables and Auth settings above; record the current working commit/deployment ID and backup status.
2. Run the local checks appropriate to this release. `pnpm db:local:start` then `pnpm db:rehearse` creates a uniquely named temporary database on the guarded loopback cluster, applies all 13 migrations with no seed, verifies 17 application tables/RLS, and drops only that new database. It does not reset existing databases. This rehearsal passed; a separate hosted staging rehearsal has not been performed.
3. If inspecting production migration state, load its session/direct `DIRECT_URL` into a trusted operator environment and run `pnpm exec prisma migrate status`. For a future pending additive migration, rehearse/backup/review first, then explicitly run `pnpm db:deploy` once. Do not run `migrate dev`, `migrate reset`, `db push` or development seeds against production. Do not run schema scripts blindly against the existing live project.
4. The user commits and pushes the reviewed change to the connected production branch. Git integration then creates the deployment. If only environment variables changed, use **Vercel → Deployments → the Production deployment → ⋯ → Redeploy** after saving. Build for Production rather than promoting an artifact built with Preview credentials/noindex metadata.
5. Run `pnpm release:smoke` against the live domain. Its 17 anonymous GET checks cover landing/canonical/demo link, social metadata and WebSite identity, public icons/social image/manifest, robots, sitemap, noindex/no-referrer on capability/Auth pages, anonymous workspace redirect, denied demo state and denied maintenance. It creates no guest session or Auth/application fixture.
6. Complete the small authenticated/real-device checklist below. If a check fails, stop calling the release verified and inspect sanitized logs/configuration before adding features.

[Vercel function regions](https://vercel.com/docs/regions). Dashboard region/build/environment settings still need verification; a committed configuration file alone does not prove the active deployment uses it.

### Brand and search identity

The release includes an original shared frame/pin mark, SVG/ICO favicon, Apple/home-screen icons and a static 1200 × 630 social card. See [asset sources and regeneration](../public/brand/README.md). Home metadata includes large Open Graph/Twitter previews and WebSite JSON-LD with the actual name and canonical URL. Existing production-only indexing and private-route exclusions remain in place. The manifest supplies identity in browser mode; it does not enable offline operation.

After the new code is deployed, the owner can complete Google Search Console setup:

1. Open [Search Console](https://search.google.com/search-console), choose **Add property → URL prefix**, and enter `https://rreviewroom.vercel.app/`.
2. Under ownership verification choose **HTML tag**. Copy only the tag's `content` token into Vercel → project → Settings → Environment Variables → **GOOGLE_SITE_VERIFICATION**, scoped to **Production**. This public token is optional and unrelated to Google login.
3. Save and redeploy Production so the homepage contains the verification tag. Return to Search Console and select **Verify**. Keep the token configured for continued verification.
4. In the verified property, open **Sitemaps** and submit `https://rreviewroom.vercel.app/sitemap.xml`.
5. Open **URL inspection**, inspect the homepage, use **Test live URL**, then **Request indexing** if eligible. Keep private/Auth/demo URLs out of submissions.

No Search Console account access, ownership verification, sitemap submission or Google indexing is claimed. WebSite markup indicates a preferred site name; Google's selection and indexing remain automated. It can be syntax-checked with Schema Markup Validator; Google's Rich Results Test does not support site names. [Ownership verification](https://support.google.com/webmasters/answer/9008080), [site-name guidance](https://developers.google.com/search/docs/appearance/site-names).

## 5. Cleanup, hosting and logs

Vercel → Production Environment Variables: set **CRON_SECRET** before the release. After redeploy, **Vercel → project → Cron Jobs** should show `/api/maintenance`, schedule `0 3 * * *` (03:00 UTC / 09:00 Bangladesh time). It is a daily schedule compatible with Hobby's current minimum interval; precise start time is not guaranteed. No paid scheduler was added. [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Bearer secret handling](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

The GET endpoint requires the exact `Authorization: Bearer <CRON_SECRET>` and rejects missing/invalid authorization before any DB/Storage client is created. Each call deletes at most 100 expired explicitly marked DemoSession rows and examines at most 5 abandoned/ready upload cleanup rows; READY originals are excluded. Partial Storage failure returns 503 with counts, leaving unfinished rows queued. Full retries remain safe. The route has a 60-second budget; unusually slow batches can time out with durable work remaining. Daily batches are bounded, not a guarantee to drain arbitrary traffic. Existing opportunistic cleanup and operator CLI commands remain available for backlogs. Do not place a cleanup secret in a URL or manually expose it in browser requests.

To retry from a trusted operator shell, use a private environment variable and an Authorization header, or use `pnpm demo:cleanup` / `pnpm uploads:cleanup` with the intended database/CA configuration. Never invoke an authorized cleanup against production just to prove that the endpoint works. Watch request ID, operation and complete/partial/failed status in **Vercel → Logs**; this new handler deliberately logs no provider error object, bearer token, signed image URL or user content. Do not enable third-party analytics on capability pages.

Image bytes still upload directly to private Supabase Storage. App routes accept only bounded metadata; previews are capped at 3 MiB, below Vercel's currently documented 4.5 MB function payload limit. Finalize remains Node/sharp with maxDuration=60; preview decode is not persisted/cached across users. Measure actual hosted latency/memory before any load/performance claim. [Vercel function limits](https://vercel.com/docs/functions/limitations).

## 6. Backup and recovery runbook

No backup or restore was executed. Check the actual subscription under **Supabase → Organization → Billing**, and backup availability under **Database → Backups**. Do not assume paid backup retention/PITR on this project. Free-tier projects should maintain their own off-site exports. A database backup contains Storage metadata, **not the private image bytes**. [Backup scope and availability](https://supabase.com/docs/guides/platform/backups).

Before a migration or risky data operation:

1. Record the live Git SHA, deployment ID, Prisma migration status, backup timestamp and intended recovery point. Pause the cleanup cron if recovering deleted files or investigating accidental deletion.
2. Store an encrypted database export outside this repository, including app data, custom roles/grants/RLS, Auth identities required by profile/membership foreign keys and Prisma's `app._prisma_migrations` history. Record Auth provider/hook/site URL and bucket configuration separately. Do not treat an app-only dump as an Auth/Storage backup.
3. Use the official [Supabase CLI backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) with the selected **session/direct URL**, not a Prisma URL containing `schema=app`/`pgbouncer=true`. With Supabase CLI and Docker installed and `RELEASE_DATABASE_URL` loaded privately, the documented export pattern is:

```sh
# Run inside a private backup directory OUTSIDE the Git checkout.
# The environment variable contains a URL-encoded session/direct connection URL.
supabase db dump --db-url "$RELEASE_DATABASE_URL" -f roles.sql --role-only
supabase db dump --db-url "$RELEASE_DATABASE_URL" -f schema.sql
supabase db dump --db-url "$RELEASE_DATABASE_URL" -f data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
```

Inspect the installed CLI version's export coverage and the official guide's managed Auth/Storage schema considerations. Verify that required app/Auth data and Prisma history are actually included; preserve custom managed-schema changes separately. Keep the public CA/root-certificate setup appropriate for the CLI. Do not disable certificate verification to make an export pass. Encrypt the output and record a checksum through the backup tooling; keep passwords/tokens out of shell history.

4. Export Storage objects separately through authorized tooling into an encrypted off-site location, retaining exact keys and an inventory of hashes/sizes. Back up original objects and relevant Auth/configuration together; a SQL metadata-only restore cannot recover missing image bytes.
5. Rehearse restoration into a **new isolated project**, following the official roles → schema → data sequence and Auth/encryption-key considerations. Reconfigure providers, hooks, bucket privacy and secrets. Check row counts, custom role memberships/RLS, profile/Auth ID relationships, migration history, original-file hashes and a private-file access denial. Only a successful rehearsal establishes recoverability; this has not been performed.

For an application regression, use **Vercel → Deployments → the last known good Production deployment → ⋯ → Instant Rollback/Promote to Production**, as offered by the plan/UI. Re-run the smoke checks. This changes application routing, not the database schema/data, OAuth settings or Storage objects. Keep future migrations backward compatible; use a reviewed forward fix for database problems. Do not run destructive down/reset commands against live data. For data loss, recover to an isolated project, validate first, then explicitly plan the cutover and secret/URL changes. [Vercel rollback](https://vercel.com/docs/deployments/rollback-production-deployment).

## 7. Final acceptance after the new deployment

- [x] `pnpm release:smoke`: all 17 anonymous checks passed on the public domain on 18 October 2026.
- [ ] Existing-owner email/password login, logout and private-route denial work with Secure cookies and the live origin.
- [ ] A deliberate immediate-signup check creates one profile, workspace and OWNER membership; retry does not duplicate it. Do not use the old fixture runner against production.
- [ ] Google button completes real consent → Supabase callback → app callback → workspace on the final domain.
- [ ] Owner/project assignment, designer upload, client pin/reply and designer resolve work; outsider/unassigned private file access is denied.
- [ ] New version has fresh feedback/approval state; client compares and requests changes/approves the current version.
- [ ] A real phone uploads an EXIF portrait image and reviews it without shifted pins or horizontal overflow.
- [ ] Explicitly created share is read only, version scoped and denied after expiry/revocation; existing signed original URLs retain their bounded lifetime.
- [ ] Two intentionally opened guest browsers retain isolated demo state; reset affects only one and quotas survive.
- [ ] Cron is configured with a secret and its real scheduled execution logs counts/status; investigate partial/failed work without logging credentials.
- [ ] Backup/restore and private Storage export coverage are established; the independent production/Preview credentials remain separated.

These are user-run release checks on intended accounts/content, not permission to create test fixture batches or send invitations to external recipients. No email delivery, real phone, successful final-domain Google callback, production CA connection, scheduled cron execution or backup restoration is claimed by this preparation.

## Web Analytics

Public pageviews for `/`, `/login` and `/signup` use `@vercel/analytics/next`. Query strings and fragments are stripped before sending pageviews; custom events and private, capability and demo routes are excluded. Tracking is mounted only on production deployments. No Analytics environment variable or custom event setup is required.

In Vercel, open the Review Room project → Analytics / Web Analytics → Enable, then deploy the updated code. Visit the production homepage and check the dashboard for incoming pageviews. Dashboard activation and receipt of live events must be verified separately from the build. See the [official quickstart](https://vercel.com/docs/analytics/quickstart).
