# Development runbook

## Prerequisites

- Node.js 22.18+ (verified here with 26.7.0), pnpm 11.21.0.
- PostgreSQL 18 command-line tools on PATH: `initdb`, `pg_ctl`, `pg_isready`, `psql`, `createdb`.
- On this Mac PostgreSQL 18.6 is already installed. On a new Mac install `postgresql@18` with Homebrew and follow its PATH instructions. No Docker is needed for the local database.

## Fresh local checkout

```sh
pnpm install --frozen-lockfile
pnpm db:local:start
pnpm db:deploy
pnpm db:seed
pnpm db:check
pnpm dev
```

`db:local:start` creates an isolated cluster under ignored `.local/postgres`, binds **127.0.0.1:55432**, and creates `review_room_dev` and `review_room_test`. It copies `.env.example` to `.env` only if `.env` does not already exist. Inspect existing environment configuration yourself; the script never replaces it. It never changes the system PostgreSQL instance on port 5432.

Local trust authentication is for this single-user development machine only; the cluster must never be exposed on a network or reused in hosting. Other processes/users on this computer can connect. Application secrets are not needed for this local fixture database. Stop with `pnpm db:local:stop`; data is retained. Restart with `pnpm db:local:start`.

Open http://localhost:3000. The visible UI remains the Step 0 static prototype; connecting the seed to private pages is deliberately deferred until verified authentication and authorization exist.

## Schema and migration ownership

- Prisma owns only the PostgreSQL `app` schema. Do not introspect, migrate or seed Supabase's `auth` or `storage` internals with Prisma.
- Initial models: UserProfile, Workspace, Membership, Project and ProjectMember. Composite foreign keys prevent cross-workspace project assignments. Later domain tables arrive with their roadmap steps.
- `DATABASE_URL` is runtime access (Supabase transaction pooling later); `DIRECT_URL` is CLI/migration access using a direct or session connection. Use dashboard-generated values for the selected provider and driver adapter; do not assume an old Prisma engine's pooling flags apply to `pg`.
- Runtime Prisma uses `@prisma/adapter-pg`, a small per-process connection pool and a reused server-only client. Static builds do not connect to the database.
- For local schema changes: edit `prisma/schema.prisma`, run `pnpm db:migrate --name meaningful_name`, inspect the generated SQL and commit it. Run `pnpm db:generate` after schema changes.
- Fresh checkout application: `pnpm db:deploy`. Seeding is separate and explicit.
- Never run `migrate reset`, development seeds or `db push` against production. This repository's seed rejects remote hosts, other ports/users and unrelated database names.
- Fixture IDs do not represent verified Auth accounts. No sign-in accounts or password are created. Step 2 will build identity fixtures through the development Supabase Auth service.

## Quality checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm format:check
pnpm build
```

`pnpm test` checks configuration handling and guards against writing fixtures to the wrong database. `test:integration` validates its target before any database command, applies committed migrations to the dedicated `review_room_test`, and tests seed idempotency, membership uniqueness and cross-workspace foreign keys. It does not reset databases. Tests expect the dedicated fixture database to contain only the development fixtures; do not use it for manual application work.

`pnpm format` formats maintained source/configuration/docs. The canonical imported roadmap, original planning files, generated client and migration SQL are excluded. Lint and formatting are separate checks; Next.js build does not run them for you.

## Separate development Supabase project

1. Create a **development-only** Supabase project, separate from future production. The current development project was provisioned and verified on 17 October 2026. Credentials stay in ignored `.env`.
2. Store development connection values and keys in ignored `.env` using `.env.example` as the field list. Never paste secrets into chat, commit them or add `NEXT_PUBLIC_` to privileged keys. A public publishable key is different from the server secret key.
3. The current setup uses the dashboard-supplied database owner for Prisma. For a dedicated application role, follow Supabase's integration guide. Scope application migration ownership to `app`. If using a separate role, grant only the privileges needed for that schema; do not make browser roles table owners.
4. Apply Prisma migrations to the verified **development** target with `pnpm db:deploy`. Do not run the local fixture seed on Supabase.
5. In that project's SQL editor run `supabase/001_application_access.sql` as the table owner. This revokes browser grants, hardens defaults and enables RLS with no browser policies. Repeat after new application migrations; default privileges apply to the role executing the SQL, so use the same table-owning role consistently.
6. Keep `app` out of the Data API exposed schemas in Supabase settings. The server checks membership/roles before data access in Step 2; RLS alone does not provide a user's identity context to Prisma.
7. Run `supabase/002_private_bucket.sql` in the development SQL editor. It creates `review-room-private` with `public=false`, a 10 MiB ceiling and JPG/PNG/WebP MIME hints. An existing conflicting bucket causes an error instead of silently changing it. No browser object policies are added.
8. Verify that the bucket is private, unauthenticated download is denied, and browser roles cannot read/write application tables. Record the results in PROGRESS.md. These checks passed for the current development project on 17 October 2026. `pnpm supabase:check` reruns read-only connection, role, API and bucket configuration checks; it does not create records, migrate, upload or send email.
9. Auth callbacks, real identity and upload finalization come in Steps 2 and 4. No external recipient is contacted during setup.

During initial private-storage verification, an agent-created temporary PNG was uploaded, read through privileged/signed access, denied through anonymous/public access, and then deleted. The application upload flow is still Step 4.

Do not point the local integration harness or seed at Supabase. To return to local development, restore the loopback URLs from `.env.example` without overwriting any saved secret values.

## Failure handling

- Port 55432 occupied by another process: the start script refuses to continue. Resolve that conflict without changing the existing database.
- PostgreSQL tools missing: install PostgreSQL 18 and add its executable directory to PATH.
- Connection failure: start the local cluster, check local `.env` and rerun migrations. Do not print connection strings to debug.
- Migration failure: inspect the migration and database state. Use an additive forward fix; do not reset an environment with valuable data.
- Generated client missing: run `pnpm db:generate`; it is also generated by `postinstall` without requiring a database URL.
- Browser layout/interactions and real-device checks remain manual in this session; successful TypeScript/build checks are not evidence that they were performed.

## References checked for this foundation

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and version-bundled CSS/ESLint guides in `node_modules/next/dist/docs/`.
- [Prisma v7 generation](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators), [database connections](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections), and [explicit seeding](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding).
- [Supabase Prisma integration](https://supabase.com/docs/guides/database/prisma) and [bucket creation](https://supabase.com/docs/guides/storage/buckets/creating-buckets).
- [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs) and [shadcn Next.js setup](https://ui.shadcn.com/docs/installation/next).

Versions were inspected from the npm registry. Prisma's `latest` tag currently resolves to a prerelease; this project deliberately pins the stable 7.10.1 CLI/client/adapter together. Existing Next.js/React pins were retained. The source-owned button follows the shadcn composition pattern and uses existing product styles to preserve the UI; future generated components must be reviewed against the design tokens.

## Step 2 Auth setup and manual Dashboard settings

Step 1 is already complete. The additive `20261017000200_identity_permissions` migration supplies workspace bootstrap uniqueness, database request-role RLS, durable signup counters/permits and the signup hook function. It has been applied to the existing development Supabase project and the local test database; do not rerun Step 1 provisioning to use Auth.

The current user explicitly requested immediate signup without email confirmation. The previous verification-required description above records Step 1's setup only.

1. **Supabase Dashboard → Authentication → Sign In / Providers → Email → Confirm email → OFF → Save.** Keep the Email provider enabled. Live settings are checked before signup; a mismatch returns a temporary-unavailable error before creating an account/sending email.
2. **Supabase Dashboard → Authentication → Hooks → Before User Created → PostgreSQL function → schema app → before_user_created → Enable/Save.** The SQL function/grants already exist. Enabling this is necessary to stop bots from bypassing the app limiter by calling Supabase's public signup API directly. It is available on the Free plan; no new paid service is required. Without Dashboard access or a Management API access token, the agent cannot enable/verify this setting from SQL installation alone.
3. **Supabase Dashboard → Authentication → Rate Limits:** retain Supabase's built-in signup/token limits. They are additional to the application counters and are not disabled by this implementation. Server-side publishable-key requests may share the server's upstream IP quota; the application limiter separately enforces the Vercel client-IP quota.

No Dashboard-setting change should be inferred from an applied database migration. `pnpm supabase:check` verifies current email confirmation mode and hook installation/grants, but reports that hook activation must be checked separately. A real provider signup without a permit must be rejected after activation.

The server-only `.env` now needs a stable random SIGNUP_RATE_LIMIT_SECRET of at least 32 characters. A random value was generated locally without printing it. In Vercel, configure the same value for all instances of one environment; never add NEXT_PUBLIC_ to its name. Keep NEXT_PUBLIC_APP_URL equal to the actual application origin, and set the correct preview origin through Vercel's platform VERCEL_URL where needed.

Use `/signup`, `/login`, and `/app`. The root remains the clearly labeled sample prototype and links to the real workspace. New workspaces contain no fake projects; project creation is Step 3. Logout is POST-only, verifies request origin, and clears the current session's cookies. The callback exchanges a PKCE code and only permits internal app destinations.

Public signup on a non-Vercel production host fails closed because there is no trusted Vercel IP header. `pnpm dev` uses a single durable local-development quota; it does not trust locally spoofed request headers. This is not a reason to weaken the production header check for local testing.

### Step 2 checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm db:local:start
pnpm test:integration
pnpm build
pnpm supabase:check
```

Local tests cover concurrent bootstrap, two independent limiter clients/restart, hourly/daily limits, permit binding/replay, server authorization and deliberately unfiltered RLS queries. Do not run the local fixture seed against hosted Supabase. The live Auth session check used an agent-created, email-confirmed test account through the Admin API without sending email, exercised login/refresh/logout, then deleted its profile/workspace/Auth account. This does not substitute for testing the immediate public signup happy path after the Dashboard settings are correct.

Do not reapply supabase/001_application_access.sql as a migration: application request policies are now managed by the Step 2 migration. The original hardening SQL is idempotent and preserves policies, but routine setup should use committed additive migrations.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Auth settings](https://supabase.com/docs/guides/auth/general-configuration), [built-in rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Vercel request headers](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for), [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook), [free hook availability](https://supabase.com/docs/guides/auth/auth-hooks).

### Final live Step 2 acceptance

On 17 October 2026 the user enabled the Before User Created Postgres hook. A real missing-permit signup returned HTTP 403 with no account/session; app signup with a permitted request returned HTTP 200 with immediate sign-in and profile/workspace/OWNER bootstrap. Protected access, duplicate-safe bootstrap retries and password login/logout passed with the hook active. The test account and its application records were deleted. `pnpm supabase:check` passed; its read-only hook-installation check is supplemented by this actual provider-enforcement test. No Step 2 Dashboard setting remains pending for the current development project.

### Google sign-in (Step 2 extension)

Both `/login` and `/signup` offer **Continue with Google**. The same-origin POST `/auth/google` checks the live provider setting, reserves the durable signup quota, starts Supabase PKCE, and sets a five-minute HttpOnly intent cookie. `/auth/callback` consumes the database-backed intent exactly once, exchanges the code, verifies the Google-linked identity through `getUser`, then performs the existing idempotent profile/workspace/OWNER bootstrap. Provider cancellation and invalid callbacks return a static login error. No Google access or refresh tokens are requested for offline API use.

Migration `20261017000300_google_auth_hook` preserves the enabled `app.before_user_created` function and its grants. It allows Supabase-assigned Google provider identities with a verified email; password signups still require the one-use email-bound permit. Do not disable the hook. Google Auth account creation itself relies on Google/Supabase protections; the durable application quota limits OAuth starts and new application workspace provisioning. Directly obtained OAuth sessions cannot bypass the latter through login/bootstrap. Existing provisioned users can retry bootstrap without consuming signup quota. OAuth starts currently share the five/hour and twenty/day signup allowance, including returning Google users.

Provider setup, if configuring another environment:

1. Google Cloud Console → Google Auth Platform → Branding, Audience and Data Access: configure the consent screen, allowed test users while in Testing, and only `openid`, email and profile scopes.
2. Google Auth Platform → Clients → Create client → Web application. Authorized JavaScript origin: `http://localhost:3000`. Authorized redirect URI for this hosted development project: `https://pwzwrknnzkdagfcjnqkr.supabase.co/auth/v1/callback`.
3. Supabase Dashboard → Authentication → Sign In / Providers → Google: enable the provider, enter the Google Client ID and Client Secret, Save. The secret belongs here, never in browser environment variables or chat.
4. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs: allow `http://localhost:3000/auth/callback`; set Site URL to `http://localhost:3000`. Add the actual HTTPS production origin and callback when deploying. The app derives its callback from `NEXT_PUBLIC_APP_URL`, not request input.
5. Keep Authentication → Hooks → Before User Created pointing to `pg-functions://postgres/app/before_user_created`.

On 17 October 2026 the public settings endpoint reported Google enabled and email confirmation off. App OAuth initiation returned 200 with HttpOnly intent and PKCE cookies, and Supabase authorization returned 302 to `accounts.google.com`. The new hook migration was applied to development Supabase. No Google Dashboard setting was changed by the agent. The callback allowlist, Google consent configuration, and completed interactive Google sign-in were not independently verified; finish one browser sign-in to accept the live flow.

Reference: [Supabase Google OAuth setup and SSR callback](https://supabase.com/docs/guides/auth/social-login/auth-google).

### Step 3 projects

Open `/app`, select a workspace, then **New project**. Only owners can create projects, assign existing designers/clients, or archive/restore. New workspaces have no designers/clients until membership exists; the creation form explains this and still allows creating an unassigned project. Invitations remain Step 7; do not add fake accounts or run the local seed on hosted Supabase to populate this picker.

Use the project detail page to save explicit assignments. Removing an assignment immediately removes that designer/client's project access. Existing workspace roles never change through project forms. Owners always have access and do not need ProjectMember rows.

Projects default to Active. Search runs on the server within the verified workspace and project permissions. It preserves the status filter and paginates 12 at a time; search/filter changes reset the page. URLs retain search/filter/page state. Archive preserves the project and all ProjectMember rows; use Archived to find it, and Restore project to return it to Active. Archived projects remain readable and assignments are locked until restore. There is no hard-delete UI or request-role DELETE grant on Project.

Deploy application policy changes with `pnpm db:deploy`: migrations `20261017000400_project_management` and `20261017000500_project_insert_visibility` were applied to the existing development project on 17 October 2026. They add owner-only writes and scoped teammate-name access, retaining existing tenant isolation and browser-role denial. No Prisma schema change or Supabase Auth/Storage internal schema change is required.

Checks: `pnpm check`, `pnpm test:integration`, `pnpm build`, `pnpm supabase:check`. Integration tests use only the dedicated local test database. Development Supabase connection timeouts can surface the project retry state; an error does not prove a previous write failed. Project creation retries reuse the same submission ID while the form is mounted; archive/restore are idempotent. Refreshing a creation form starts a new submission.

Live Step 3 acceptance on 17 October 2026 used an agent-owned, confirmed temporary Auth account without sending email, a separate temporary workspace, and the user's existing development server. Browser creation/archive/restore/search/logout and desktop/mobile rendering passed. Database connection/transaction timeouts also exercised the error state; its Try again button uses this installed Next.js version's `retry()` prop to fetch fresh server content. All temporary application and Auth records were removed afterward. No user projects were created, archived or modified by this test.

### Step 4 private image uploads

Apply the versioned application migration and regenerate the client:

```sh
pnpm db:deploy
pnpm db:generate
pnpm supabase:check
```

No additional environment secret or Dashboard setting is required for the already-configured development project. `SUPABASE_SECRET_KEY` stays server-only; `review-room-private` remains private with a 10 MiB limit and only image/jpeg, image/png and image/webp. Browser roles still have no direct application-table grants or unrestricted storage policy. Do not expose the bucket or add a broad authenticated storage policy to make uploads work.

Open an active project as its owner or assigned designer, choose one JPG/PNG/static WebP, then Upload image. Images must be <=10 MiB, <=20 MP and <=8192 pixels on either side. Assigned clients can view READY images but cannot upload. Project images paginate 12 at a time and survive refresh; clicking an image opens its version-bound review canvas (Step 5). Archived projects retain existing images but cannot accept uploads. Comments/approval/version comparison have not been implemented in this step.

The app's prepare/finalize/cancel Route Handlers accept at most 4096 bytes of JSON; file bytes go from browser to Storage. Vercel Functions have a 4.5 MB inbound/response payload limit, so sending a 10 MB File through Server Actions or the app API is intentionally avoided. Finalize is a Node route with maxDuration=60: it downloads the staging object server-to-server with a 10 MiB stream cap, validates signatures and fully decodes the image with sharp, writes a distinct immutable object, and atomically updates READY/currentVersionId. Original bytes are preserved; verified SHA-256, MIME, byte size and dimensions are stored. A decoder or network failure leaves no readable current version.

Supabase createSignedUploadUrl has a provider-fixed two-hour expiry; the current API does not accept an application-selected shorter TTL. The application's reservation/finalize window is 10 minutes and a single processing claim lasts two minutes. Tokens are restricted to random staging paths, with upsert=false. The validated final image uses a different server-only key, so the staging capability cannot replace READY bytes. No token/code/signed URL is logged. This design bounds provider capabilities but does not revoke them when Cancel is clicked; cancellation prevents publication and queues cleanup. If final publication already won the race, cancellation returns the saved result and preserves it.

Authorized image reads go through `/app/[workspaceId]/projects/[projectId]/assets/[assetId]/file`: verify current membership/project scope, require a READY current version, then issue a 60-second private Storage redirect with no-store and no-referrer headers. Thumbnails use unoptimized image rendering, so Next's shared image optimizer never caches private originals. Revocation blocks newly issued capabilities immediately; a previously issued URL can work for its remaining 60 seconds, and already downloaded copies cannot be recalled.

Cleanup is durable and retryable:

```sh
pnpm uploads:cleanup
```

This expires abandoned PENDING attempts after their finalize deadline/processing lease. Immediate failure/cancel cleanup is best effort; the durable sweeper revisits staging and failed final keys after 125 minutes, covering the two-hour provider capability lifetime and a five-minute grace. READY final keys are never deleted. Storage-delete failures keep cleanedAt unset for retry. Rows are retained as cleanup tombstones; incomplete assets do not appear in the gallery. Run cleanup again after connectivity failures.

A successful prepare also runs a small cleanup batch through Next's after() hook. With no future traffic, run the CLI periodically yourself or schedule it in the deployment step; no hosted cron has been configured or claimed here, and no extra paid service is required. The CLI uses privileged database/storage clients only for server-owned expired upload rows; it accepts no user-provided object keys. Database work and storage calls are separate, and UTC is set explicitly for expiry comparisons.

Verification: `pnpm check`, `pnpm test:integration`, `pnpm build`, `pnpm supabase:check`, `pnpm uploads:cleanup`. Local tests use real PostgreSQL/RLS plus an injected storage adapter; image tests use real sharp codecs. Live acceptance used temporary confirmed Auth accounts and an isolated workspace, tested a 5.36 MiB image via Storage, fake PNG rejection, designer/client permissions, native Chrome cancellation/retry/upload/thumbnail rendering and revocation, then removed all temporary objects/accounts/application records. No actual Vercel deployment has been tested. Development database/network timeouts may still surface retry states; no timeout elimination is claimed.

Sources: [Supabase signed-upload lifetime](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl), [signed uploads](https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl), [private signed downloads](https://supabase.com/docs/guides/storage/serving/downloads), [Vercel function payload limits](https://vercel.com/docs/functions/limitations), [sharp metadata and pixel statistics](https://sharp.pixelplumbing.com/api-input/), [sharp decoder limits](https://sharp.pixelplumbing.com/api-constructor/).

### Step 5 image comments

Migration `20261017000700_image_comments` adds the Comment table, same-version parent constraints, immutable bodies, scoped RLS and resolve-only update grants. It has been applied to the development Supabase project and dedicated local test database. Other environments need `pnpm db:deploy` and `pnpm db:generate`. No new environment variable or Dashboard setting is required.

Open an image from an authorized project's gallery. Click inside the image to place a numbered thread, write feedback and save. Add comment also supports keyboard placement with horizontal/vertical position sliders. Fit and zoom (100–300%) retain normalized image coordinates; drag at zoom to pan. Letterbox/padding clicks do not place pins. Mobile uses the Feedback drawer.

Assigned clients can create threads and replies. Owners and assigned designers can also resolve/reopen root threads. Archived projects remain readable with feedback disabled. Bodies/replies are immutable and rendered as plain text. Every read/write verifies the workspace, project, asset and READY version under the existing request database role; replies cannot target another version or another reply. Failed saves retain the draft and submission ID for retry. Threads and replies use bounded cursor pagination.

Walkthrough: sign in as an assigned client, open an image, add a centre pin and reply, then refresh and verify both remain. As owner/designer resolve and reopen that thread. Place corner pins, change zoom/window size and verify they stay attached to the same image points. Try Add comment and keyboard sliders. On mobile open Feedback. Outsider/unassigned requests must be denied. Version upload, comparison and approval remain Step 6.

Focused automated coverage lives in `tests/comments.test.ts` (coordinate/validation cases) and `tests/integration/comments.test.ts` (real local PostgreSQL/RLS, idempotency, permissions, immutable fields, cross-version parents, concurrency, pagination and archive behavior). Run integration tests only against the guarded local test database, following the existing integration runner's migration/environment setup; never point tests at hosted application data.
