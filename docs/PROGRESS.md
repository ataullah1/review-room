# Review Room Progress

## Step status

- [x] Step 0 Scope and screens — user confirmed UI renders and authorized Step 1; remaining manual coverage recorded below
- [x] Step 1 Repository and foundation — local and hosted development setup verified on 17 October 2026
- [x] Step 2 Identity and permissions — application tests, live immediate signup and active provider-hook enforcement verified on 17 October 2026
- [ ] Step 3 Projects
- [ ] Step 4 Private upload
- [ ] Step 5 Image comments
- [ ] Step 6 Versions and approval
- [ ] Step 7 Invitation and share links
- [ ] Step 8 Activity
- [ ] Step 9 Isolated demo
- [ ] Step 10 Verification and polish
- [ ] Step 11 Deployment and portfolio

## Google authentication extension — 17 October 2026

- Added Google buttons to login/signup, server-started PKCE OAuth, HttpOnly five-minute one-use durable intent, verified callback and existing idempotent workspace/OWNER provisioning. Existing email/password flows and project RLS remain in place.
- Added an onboarding quota guard to all HTTP bootstrap entry points so a directly obtained OAuth session cannot bypass the workspace limiter. Google Auth account creation relies on Google/Supabase safeguards; application quota protects OAuth starts and workspace provisioning.
- Applied additive migration `20261017000300_google_auth_hook` to the local test database and development Supabase, preserving the active hook and password-signup permit enforcement while accepting verified Google provider identities.
- Verified 43 unit/session tests and 19 real PostgreSQL integration tests, lint, formatting, TypeScript, production build and live Supabase configuration checks. Live HTTP checks: both forms show Google, start returns 200 with HttpOnly intent/PKCE cookies, Supabase redirects to accounts.google.com, foreign Origin rejected 403, cancellation redirects to login.
- Live Google provider is already enabled. No Dashboard setting was changed by the agent. Interactive Google consent/sign-in and callback allowlist require a browser walkthrough; exact configuration paths are in RUNBOOK.md.
- Step 3 remains unstarted, as requested.

## Current session — 17 October 2026, Step 2

### Final acceptance — 17 October 2026

- User enabled the Before User Created hook in Dashboard. Both confirmation-OFF behavior and provider hook enforcement were verified live; the agent did not claim or perform the Dashboard setting change.
- Direct public Supabase signup without a server-issued permit returned HTTP 403, issued no session and created no Auth account.
- App signup with a durable-quota-backed permit returned HTTP 200, immediately set HttpOnly session cookies, created an auto-confirmed Auth account and exactly one profile/workspace/OWNER membership, and redirected into the protected workspace.
- Protected workspace access, two bootstrap retries without duplication, logout/private-page denial, password login and final logout all passed while the hook was active.
- All test workspace/profile/Auth records created by this acceptance check were deleted. The user's existing development server on port 3000 was used and left running; a separate temporary server attempt on 3100 exited because the existing server already owned the dev lock.
- pnpm supabase:check passed. Previous code checks remain valid: lint, typecheck, build, formatting, 30 unit/session tests and 16 PostgreSQL integration tests. No application code changed during this settings-only acceptance check, so the full suite was not unnecessarily repeated.
- Step 2 is complete. Earlier pending-setting sections below are historical; no Dashboard setting remains outstanding for this step. Browser/device walkthrough and real Vercel deployment behavior remain outside the performed checks.
- Next: Step 3 project creation, explicit member assignment, scoped project listing/search/pagination and non-destructive archive behavior. No Step 3 implementation started.

### Scope and implementation

- Inspected the existing Step 1 repository, progress, schema, migrations, credentials/configuration and live Supabase Auth settings first. Step 1 was not redone. User explicitly overrides email verification with confirmation-OFF immediate signup; DECISIONS.md records this precedence.
- Added pinned @supabase/ssr 0.12.7 and supabase-js 2.118.0, email/password signup/login UI, POST-only same-origin Auth handlers, logout and a safe PKCE callback. HttpOnly cookies carry sessions; Next.js 16 proxy verifies/refreshes claims and forwards refreshed cookies to both request and browser. Server data boundaries independently verify users through getUser, never getSession.
- Added idempotent profile/workspace/OWNER bootstrap: verified Auth ID, advisory transaction lock, unique createdById and atomic writes. New workspaces contain no sample projects. Login/Finish workspace setup repairs a previously interrupted bootstrap without creating another workspace.
- Added non-bypass request database role, transaction-local verified identity and RLS policies alongside server membership/role/nested-project checks. Owner sees all projects within own workspace; designer/client only explicitly assigned projects. Browser roles remain denied direct app schema/Data API access.
- Added durable PostgreSQL signup limits (5/hour, 20/UTC day), cross-instance atomic counters and expiry cleanup on subsequent attempts. Only trusted x-vercel-forwarded-for on Vercel supplies client IP. The server stores HMAC-derived hashes, never raw IP. Other production hosts/missing trusted headers fail closed; local development uses a shared durable quota identity. Generated a stable private limiter secret in ignored .env without printing it.
- Added email-bound one-use permits and free Postgres Before User Created hook to prevent direct-provider signup bypass once enabled in Dashboard. Hook function/grants are installed; installation is not proof of Dashboard activation. Built-in Supabase Auth limits remain enabled.
- Applied only additive Step 2 migration 20261017000200_identity_permissions to the existing development Supabase database and dedicated local test database. Prisma migration status is up to date; schema diff reports no difference. No Supabase auth/storage internal schema was migrated.
- Found and corrected two concrete issues during integration checks: Prisma raw void-return deserialization for advisory locks, and non-UTC database session handling for time-bound permits. User-scoped transactions explicitly use UTC; limiter/permit expiry uses database time.
- Next dev generated AGENTS.md with version-bundled documentation guidance; retained it. Existing prototype was preserved with an Open your workspace link. No Step 3 project creation, uploads, invitations, email delivery or unrelated features were added.

### Verification

- pnpm lint: passed with zero warnings.
- pnpm typecheck: passed.
- pnpm test: 30 passed (signup/login/logout flows, missing/invalid identity, provider rate errors, confirmation-mode mismatch, strict origin/return paths, trusted header selection/HMAC, IPv6 normalization, cookie refresh propagation/cache headers).
- pnpm test:integration: 16 passed against isolated local PostgreSQL (foundation plus concurrent bootstrap, non-bypass RLS, owner/assigned/outsider access, forged nested IDs, unauthorized writes/role escalation, transaction identity isolation, durable concurrent quotas/restart/daily limit/expiry, email-bound permit/replay).
- pnpm build: passed with public Auth pages, protected dynamic app routes and proxy.
- pnpm format:check and git diff --check: passed.
- Live HTTP/Supabase session check: created an agent-owned confirmed test account via Admin API without sending email, logged in through the app, received session cookies and a real workspace, retried bootstrap twice with exactly one workspace, forced stored session expiry to exercise a real token refresh/rotation, verified no-store response, logged out, confirmed cleared cookies and subsequent private-page denial, and rejected incorrect credentials/cross-origin POST. Deleted test workspace/profile/Auth account afterward; test fixture cleanup succeeded. Temporary local server stopped.
- Browser bundle scan: 13 static files checked, no database password, server secret or limiter secret found. .env remains Git-ignored.
- No interactive browser/device walkthrough, Vercel deployment header behavior or successful public immediate-signup happy path has been claimed. Header trust rules and failure modes are tested locally; a real deployment still needs its environment configured.

### Initial Dashboard verification (superseded by follow-up below)

- Public live Auth API still reports mailer_autoconfirm=false, meaning Confirm email ON, even after the user reported turning it off. Management API access is unavailable; no Dashboard setting was changed by the agent. The signup handler safely detects this before attempting account creation/email, returns unavailable, and that failure path was verified over HTTP.
- Exact path: Supabase Dashboard → Authentication → Sign In / Providers → Email → Confirm email OFF → Save, for the project configured in .env.
- Exact path: Supabase Dashboard → Authentication → Hooks → Before User Created → PostgreSQL function → app.before_user_created → Enable/Save. Function/grants are live and tested, but activation and direct-provider denial must still be verified after enabling it.
- pnpm supabase:check passes database/RLS/hook-installation checks, then correctly fails on the live confirmation-mode mismatch; it must not be reported as passing overall until that setting is fixed.
- Step 2 remains unchecked until the immediate public signup path and provider hook activation can be verified. Code/configuration/tests are ready; stay within Step 2 until then.
- No commit, push or app deployment. Development fixtures only were created and cleaned up for live verification; no external recipient was contacted.

### Follow-up after user saved Dashboard settings — 17 October 2026

- Live Auth settings now confirm mailer_autoconfirm=true and the Email provider enabled. Confirmation-OFF immediate signup is verified; the agent did not change the Dashboard setting.
- pnpm supabase:check now passes all its read-only checks, including both database connections, RLS role/grant checks, installed hook function/grants, email confirmation mode, Data API exclusion and private bucket configuration. Its output explicitly distinguishes hook installation from Dashboard activation.
- Real public app signup returned HTTP 200 with immediate HttpOnly session cookies and a workspace redirect. Verified an auto-confirmed Auth account, exactly one profile/workspace/OWNER membership, successful protected workspace access, two safe bootstrap retries, logout/private-page denial and login using the new account's password.
- Removed the test workspace/profile/Auth account after verification. No confirmation email was intentionally sent; confirmation mode was checked before the live signup.
- Remaining failure: direct Supabase signup without a permit returned HTTP 200 with an access token and created an account. That controlled bypass test account was also deleted. Therefore provider-level protection is NOT active/verified yet, even though the user reported saving both settings.
- Read-only SQL confirmed the expected app.before_user_created function body is installed and rejects a missing permit with error 403. The remaining issue is connecting/enabling that function in the Supabase Auth hook configuration, not a missing SQL function.
- Exact remaining configuration: Authentication → Hooks → Before User Created → Postgres → app.before_user_created → Enabled/Save; URI pg-functions://postgres/app/before_user_created. Asked the user to verify this exact selection.
- Step 2 remains unchecked solely until provider signup without a permit is rejected and permitted app signup still succeeds with the hook active. No Step 3 work started.

## Previous session — 17 October 2026, Step 1 complete

- User explicitly authorized completing the remaining development Supabase migration, access hardening and private bucket setup.
- Preflight verified the expected development pooler/project and existing auth/storage schemas. No application tables existed before migration.
- Applied committed `20261016000100_foundation` using Prisma migrate deploy. Applied `supabase/001_application_access.sql` and `supabase/002_private_bucket.sql` to the development project only. No fixture seed was run against Supabase.
- Remote results: five application tables plus Prisma migration tracking exist under app; RLS enabled. Migration status is up to date and schema diff reports no difference.
- Added read-only `pnpm supabase:check` to recheck both database connections, table/RLS presence, browser-role grant denial, Data API schema exclusion, Auth settings and private bucket configuration without printing secrets.
- `pnpm supabase:check`: passed. anon/authenticated have no application schema usage or table read/write privileges; direct role-impersonated reads reject with permission denied. Data API rejects app with PGRST106, confirming it is not exposed. Publishable and secret keys pass live checks; email verification is required.
- Bucket: review-room-private, public=false, 10 MiB file limit, JPEG/PNG/WebP allowlist. Uploaded an agent-created temporary 1-pixel image: privileged download and 60-second signed URL returned 200 with expected bytes; public, unauthenticated and publishable-only downloads were denied. Deleted the temporary object successfully.
- Corrected a pre-existing filename typo in the integration-test package script. The test command initially failed because the local cluster was stopped; started only the owned cluster and reran successfully. Remote runtime URLs were preserved.
- Checks: lint (zero warnings), typecheck, 13 unit tests, 5 local PostgreSQL integration tests and production build passed. Local cluster remains available on port 55432; integration tests never target Supabase.
- Updated README, RUNBOOK and DECISIONS to describe the completed development setup. Earlier dated sections below are historical records, not current blockers.
- Remaining limits: UI is still a static prototype. Verified identity, authorization helpers, private pages and sign-in flows are Step 2. No browser/device checks, real application uploads or email delivery were claimed. Current dashboard-supplied database owner is used by Prisma; keep database calls server-only and implement authorization before exposing private data.
- No deployment, push, production data change or external message. No commit created during this session.
- Next task: Step 2 — Supabase SSR identity, email verification, idempotent workspace bootstrap and role/project authorization with denied-access tests.

## Previous foundation session — 16 October 2026, Step 1

- User accepted the rendered prototype and requested the next step. User explicitly chose local setup because no development Supabase project exists yet.
- Local completion: Prisma 7.10.1 CLI/client/pg adapter; server-only reusable database client; app-only schema; initial versioned migration; deterministic seed; dedicated development/test databases; local cluster lifecycle scripts; environment placeholders and validation; Tailwind v4 utilities/tokens and shadcn composition primitive; ESLint, Prettier and Vitest scripts; setup/runbook documentation.
- Database models: UserProfile, Workspace, Membership, Project, ProjectMember. Composite foreign keys bind assignment to both the project workspace and a real workspace membership. These constraints do not replace Step 2 authorization.
- Fixtures: 2 workspaces, 5 profiles, 5 memberships, 2 projects and 2 explicit project assignments. Includes outsider and unassigned-user fixtures. No Supabase Auth accounts or passwords were created.
- Local cluster: PostgreSQL 18.6 at 127.0.0.1:55432, data under ignored `.local/postgres`; left running for development. Existing system PostgreSQL and existing `.env` files are preserved. `pnpm db:local:stop` stops only the owned cluster.

### Verification performed

- `pnpm install`: succeeded after explicitly allowing Prisma/engines, esbuild and unrs-resolver build scripts in pnpm configuration. Stable Prisma is pinned because npm's latest CLI tag points to a prerelease.
- `pnpm db:validate`: passed.
- `prisma migrate deploy`: initial migration applied successfully to both fresh dedicated development and test databases.
- `pnpm db:seed`: passed; repeated execution retained deterministic fixtures without duplication.
- `pnpm db:check`: connected through the pg adapter and found 2 workspaces.
- `prisma migrate status`: up to date. `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: no difference.
- `supabase/001_application_access.sql`: executed successfully on the owned local database (PUBLIC revokes/RLS path). Supabase's anon/authenticated-role branch is not verified on a hosted project yet.
- `pnpm lint`: passed with zero warnings. TypeScript 7 was rejected by the ESLint parser, so TypeScript was pinned to compatible 6.0.3; current lint/build pass. ESLint 10 works with the documented Next.js configuration, though bundled third-party plugin peer ranges still produce install-time peer warnings.
- `pnpm typecheck`: passed after correcting environment-input and child-process environment types.
- `pnpm test`: 13 passed (configuration and local fixture target safety, including connection-query overrides).
- `pnpm test:integration`: 5 passed against real PostgreSQL (idempotent seed, membership uniqueness, cross-workspace FK rejection, UTC/unassigned fixtures, RLS/PUBLIC schema defaults).
- `pnpm format:check`: passed.
- `pnpm build`: passed.
- Fresh-source reproduction: copied maintained source/configuration without node_modules, .env or generated client to a temporary directory; `pnpm install --frozen-lockfile --offline`, `pnpm typecheck`, and `pnpm build` all passed. This verifies reproduction from the cached dependency store, not a cold internet download. Temporary copy removed after verification.
- Production HTTP smoke on temporary port 3100: HTTP 200 with sample heading, prototype label and shared button rendered. Temporary server stopped afterward.
- `.env`, local cluster data and generated Prisma client are ignored by Git.

### Remaining limits and next task

- Hosted development Supabase project, private bucket and browser-role grants still require account setup; SQL and exact instructions are in RUNBOOK.md. Step 1 remains unchecked until those checks pass. User approved completing the available local work first.
- No authentication, permission-enforcing data access helpers, real upload, persisted comment or approval is implemented. Static UI deliberately does not read private fixtures.
- No browser visual/interaction, real-device or timed 30–60 second comprehension check was performed by the agent. User confirmed the UI opens; that does not establish full interaction or device coverage.
- No push, deployment, production migration or external communication occurred.
- Commit: changes remain local; no commit created.
- Next: create/configure a development-only Supabase project using RUNBOOK.md, verify private bucket/access settings, then implement Step 2 verified identity and authorization. Never put credentials in chat or docs.

## Previous session — Step 0

- Created the static project list, desktop review canvas and mobile comment drawer, original sample artwork, scope/role/route decisions and roadmap/progress documentation.
- Prototype interactions include filters, version selection, pin selection, zoom/fit and temporary resolve toggles. All displayed data is explicitly sample data.
- User confirmed the UI rendered and asked to advance. Broader browser/device checks remain unverified.

## Supabase configuration check — 16 October 2026

- Development project URL, publishable key and server secret key are now configured in ignored `.env`; no values are recorded here.
- Read-only API probes: publishable key HTTP 200, secret-key bucket listing HTTP 200; email sign-in enabled and email verification required.
- Corrected URL encoding of special characters in database passwords, restored transaction/session pooler ports and `schema=app` parameters. Both runtime and migration connections passed read-only PostgreSQL queries afterward.
- Remote `app` schema, Workspace table and Prisma migration table do not exist yet. No remote migrations were executed during this check.
- `review-room-private` bucket does not exist yet. No bucket or remote data was created/changed during this check.
- Step 1 remains pending remote migrations, application access hardening and private bucket provisioning/verification.

## Completion rule

Mark a step complete only after its roadmap acceptance checks pass, recording user-authorized scope adjustments. Record checks not performed. Never put credentials, tokens, signed URLs or private client content in this file.
