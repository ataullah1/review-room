# Review Room Progress

## Step status

- [x] Step 0 Scope and screens — user confirmed UI renders and authorized Step 1; remaining manual coverage recorded below
- [x] Step 1 Repository and foundation — local and hosted development setup verified on 17 October 2026
- [x] Step 2 Identity and permissions — application tests, live immediate signup and active provider-hook enforcement verified on 17 October 2026
- [x] Step 3 Projects — permissions, automated checks and live browser flow verified on 17 October 2026
- [x] Step 4 Private upload — validated private storage, permissions, cleanup and live browser acceptance verified on 17 October 2026
- [x] Step 5 Image comments — focused permission/coordinate tests and live browser walkthrough verified on 17 October 2026
- [x] Step 6 Versions and approval — immutable upload, independent client decisions, concurrency and live comparison flow verified on 17 October 2026
- [ ] Step 7 Invitation and share links
- [ ] Step 8 Activity
- [ ] Step 9 Isolated demo
- [ ] Step 10 Verification and polish
- [ ] Step 11 Deployment and portfolio

## Step 6 — versions and individual client decisions (17 October 2026)

- Added additional immutable image uploads to an existing asset through the existing private validation/finalization pipeline. Reservation numbers serialize at the asset row across uploaders, including hidden pending/failed uploads; abandoned reservations can leave number gaps. An older pending upload cannot replace a newer published version, and the database rejects backwards current-version updates. READY files/metadata remain immutable.
- Added a bounded version switcher with version number, uploader snapshot and UTC timestamp, plus two-pane comparison with independent Fit/zoom and preserved aspect ratios. Historical pins and replies remain attached to their original version; historical comments/resolve and decisions are read only. New versions begin with no decisions or projected old pins.
- Assigned CLIENT members alone can Approve or Request Changes; changes require a note. The UI shows each reviewer's latest decision for the selected version and paginated append-only decision history. This represents individual version decisions, not whole-project sign-off. The general Activity feed remains Step 8; decision history is retained transactionally for that integration.
- Verified request identity, nested scope, active project, client assignment and expectedCurrentVersionId on the server under the non-bypass RLS role. Publication and decisions share the project transaction lock; database triggers also serialize direct decision/comment inserts with the asset row, reject stale versions and allocate stable decision order. UUID submission IDs make concurrent retries one canonical row; replaying an older saved decision cannot override a newer displayed response.
- Applied additive migration `20261017000800_versions_and_decisions` to the dedicated local test database and development Supabase. It backfills uploader snapshots without broadening profile visibility. Development client caching now detects regenerated scalar-field changes as well as new models, fixing the stale-client field error found in the browser walkthrough. No new secret, dependency, paid service or Dashboard setting is needed. Hosted schema diff reports no difference.
- Focused checks passed: 3 new validation tests plus 25 PostgreSQL tests across the changed versions/approval, comments and uploads paths (7 new review cases, 6 comment cases, 12 upload cases). Coverage includes both publication/approval orderings, direct RLS bypass attempts, reviewer separation, duplicate submissions, stale tabs, immutable history, reverse publication, archive behavior and pagination. Lint, typecheck and production build passed. No unrelated full-suite rerun.
- Live headless Chrome acceptance passed: owner/designer decision POSTs denied 403; client saved a version-1 pin and approval; concurrent API retries kept one decision; a second client’s request-changes remained independent; native designer file upload published a portrait version 2 through private Storage; version 2 started unreviewed with zero version-1 pins; stale approval/historical comment POSTs denied 409; version-1 pins/decisions remained readable with writes disabled; current client approval saved; landscape/portrait comparison retained both aspect ratios and independent Fit; 390px mobile stacked panes without overflow. Desktop/mobile screenshots were inspected. Earlier attempts exposed the stale generated-client cache, which was corrected before the successful full walkthrough. Temporary objects, decisions, comments, workspaces, profiles and Auth accounts were removed; the existing dev server remains running. Physical-device coverage is not claimed.
- No commit, push or deployment was performed; the user will commit. Step 7 invitation/share links has not been started.

## Step 5 — version-bound image comments (17 October 2026)

- Added persisted numbered image pins, immutable root comments/replies and OWNER/assigned DESIGNER resolve/reopen. Assigned clients can add feedback; archived projects remain readable but reject writes. The gallery opens a review canvas for the selected READY version. Version upload/comparison/approval remain Step 6.
- Every comment read/write verifies workspace/project/asset/version scope through the authorized server layer and non-bypass database role. RLS, column grants, root-only same-version parent constraints and immutable-field triggers independently enforce permissions and shape. Author identity/name come from verified server/database state. Durable submission IDs make retries idempotent; root numbers serialize per version and list/reply cursors bound reads.
- Canvas uses the actual image content rectangle for normalized coordinates, Fit and bounded 100–300% zoom. Padding clicks are ignored; gestures that ever cross the drag threshold cannot create a pin. Numbered pins remain attached through resize/zoom. Add comment and keyboard position sliders provide an alternative to pointer placement; mobile uses a feedback drawer. Bodies render as plain text; failed saves retain draft text/submission IDs and thread switching preserves reply drafts.
- Applied additive migration `20261017000700_image_comments` to the guarded local test database and development Supabase, and regenerated Prisma. No new service, secret or Dashboard setting is required.
- Focused checks passed: 7 coordinate/validation unit tests and 6 real PostgreSQL/RLS integration tests covering canonical saves/retries, persistence, outsider/unassigned/client restrictions, immutable edits, cross-version/nested parents, forged IDs, concurrent numbering, pagination and archived projects. Lint, typecheck, changed-file formatting and production build passed. Older test suites were not rerun, following the user's request for necessary checks only.
- Live headless Chrome acceptance passed: outsider direct POST denied 403; assigned client centre pin/reply and refresh persistence; blocked save retained the draft and retry succeeded; HTML rendered as text; owner resolve/reopen; four corner and centre pins retained coordinates through zoom; out-and-back pan created no draft; keyboard placement and 390px mobile feedback drawer without overflow. Desktop/mobile screenshots were inspected. Temporary Storage object, comments, workspaces, profiles and Auth users were removed; the existing development server was left running. The first browser attempt stopped on a test-selector quoting error, which was corrected before the successful walkthrough. No physical-device check was performed.
- No commit, push or deployment was performed. User will make the commit; this overrides the roadmap's automatic commit instruction.

## Step 4 — private image upload (17 October 2026)

- Added Asset and AssetVersion with composite project/workspace FKs, creator identity, immutable server-generated object keys, expected/verified metadata, content hashes, version number 1, PENDING/READY/FAILED states, expiry/processing leases and durable cleanup markers. Current-version FKs/triggers require the same asset and READY state; READY metadata cannot be rewritten. Existing project memberships and roles remain unchanged.
- Only workspace owners and assigned designers can prepare/finalize uploads, and only in active projects. All HTTP paths verify the Supabase user and execute identity-scoped reads/writes under the non-bypass request role. Finalization rechecks membership/archive state after external storage work. Client/unassigned/outsider upload and forged nested IDs are denied before signing capabilities.
- Browser sends only bounded JSON metadata to app Route Handlers; actual file bytes upload directly to a narrowly scoped signed Supabase Storage URL using XHR progress. Client selection filters are advisory. Server checks actual byte length, magic/decoded format, filename/type agreement, complete pixel decode through sharp.stats(), dimensions <=8192 each, <=20,000,000 pixels and <=10 MiB. SVG/GIF/other formats, corrupt data, APNG and animated WebP are rejected.
- A staging key is never a READY version's object key. After validation the server writes a separate immutable private object with upsert=false, then atomically publishes READY/currentVersionId. Concurrent claims, duplicate finalize, late cancel and ambiguous commit handling preserve published objects; failed/cancelled attempts never become current. Server-generated image dimensions/hash/size come from verified bytes.
- Supabase upload capabilities have a provider-fixed two-hour lifetime. App finalization expires after 10 minutes; claims have a two-minute processing lease; download capabilities last 60 seconds. Failed staging/final objects are removed immediately where possible and swept again after capability expiry plus five minutes. READY final objects are excluded from cleanup. Abandoned attempts become FAILED, and cleanup failures remain durably queued. No TTL shortening or active cron deployment is claimed.
- Added owner/designer upload panel with file selection, progress, cancel, retry and validation feedback, and a responsive paginated gallery for authorized viewers. Private images use an authenticated no-store redirect and unoptimized image tags, keeping bytes out of app responses and Next image caches. Archived projects remain viewable; uploading stays disabled. Comments, approvals and subsequent version upload remain later steps.
- Added bounded opportunistic cleanup after authorized prepare requests and `pnpm uploads:cleanup` for idle-period/operational cleanup. Maintenance explicitly uses UTC so pooled database time zones cannot shift expiry comparisons. Pending/failed attempt rows are retained for cleanup rather than presented as usable assets.
- Applied additive migration `20261017000600_private_assets` to the dedicated local test database and development Supabase; generated Prisma client and verified no schema difference. Fixed development client caching to rebuild the singleton when generated model names change, so the running dev server can use new Asset models without a manual restart. Added sharp 0.35.5 as an exact direct dependency; existing packages were not upgraded.
- Checks passed: 64 unit/session tests, 41 real PostgreSQL integration tests, lint, typecheck, formatting, production build, migration/schema drift check, live Supabase configuration checks and cleanup CLI. Tests cover real image decodes and forged/corrupt/animated/oversize inputs, RLS writes, tenant/role restrictions, pointer invariants, READY immutability, concurrent claims, archive/revocation rechecks, cancel/finalize races, quotas and cleanup retries/late staging replay.
- Live acceptance passed: assigned client prepare denied 403; assigned designer direct upload/finalize; duplicate finalize; client download of identical validated bytes; public URL denial; a valid 5.36 MiB image uploaded directly to Storage and finalized; fake PNG rejected with FAILED/cleanup; real Chrome native file chooser, cancel during preparation, retry, XHR upload/progress and saved thumbnails; desktop 1440px and mobile 390px without horizontal overflow; assignment revocation denied new file capabilities. Temporary objects, workspaces, profiles and Auth accounts were removed. Existing port-3000 dev server was left running. No deployment or Dashboard settings change was performed.
- Production bundle scan: 17 browser JavaScript files checked; no database URL/password, server Supabase secret or signup HMAC secret found.
- Next: Step 5 image comments and replies. It has not been started.

## Step 3 — project foundation (17 October 2026)

- Owner-only project creation with trimmed 2–150-character names, control-character rejection, atomic initial assignments, and a UUID submission key that prevents duplicate projects on concurrent retries.
- Explicit assignment/revocation uses existing DESIGNER/CLIENT workspace memberships; OWNER is never assigned through this picker and retains access to every workspace project. No role changes, invitations, uploads or unrelated features were introduced.
- Server-scoped case-insensitive name search, active/archived filters and 12-item pagination, stable date/ID ordering, scoped counts and bounded page inputs. Owners see every project in the selected workspace; designers/clients see only their assigned projects.
- Owner-only archive/restore preserves project rows and assignments. Archived projects remain readable by authorized users, leave active listings, and cannot have assignments changed until restored. Repeated archive/restore preserves the first archive timestamp and creates no new rows.
- Added responsive project cards, creation and people forms, useful empty/search/no-results states, pending/success/error feedback, loading and retry UI. Every server mutation re-verifies authentication, request origin, membership and nested project scope, then executes under the existing non-bypass RLS request role.
- Applied additive migrations `20261017000400_project_management` and `20261017000500_project_insert_visibility` to the dedicated local test database and existing development Supabase. The second migration fixes INSERT RETURNING visibility by checking workspace ownership directly in the SELECT policy. Browser roles remain denied direct application-table access; hard-delete permission is not granted.
- Checks passed: 51 unit/session tests, 29 real PostgreSQL integration tests, lint, typecheck, formatting, production build, live Supabase configuration checks and diff whitespace checks. Integration cases cover two workspaces, assigned/unassigned/outsider roles, direct RLS write denial, forged IDs, scoped names, atomic rejected assignments, concurrent creation, access revocation, pagination and archive preservation.
- Live headless Chrome walkthrough passed on the existing development server: confirmed test-account login, empty state, create Server Action and detail redirect, archive, active exclusion, archived listing, restore, search/no-results, desktop at 1440px, mobile at 390px without horizontal overflow, logout and protected-route denial. Temporary Auth/profile/workspace/project/permit records were removed.
- Hosted development database connection/transaction timeouts occurred during the walkthrough; retry recovery passed after correcting the new Next.js error boundary to use the version-documented `retry()` prop (re-fetches server content), rather than `reset()` (replays the existing render). Network timeouts are not claimed eliminated.
- Production browser bundle scan: 15 JavaScript files checked; no database URL/password, server Supabase secret or signup limiter secret found.
- Next: Step 4 private image upload. It has not been started.

## Google authentication extension — 17 October 2026

- Added Google buttons to login/signup, server-started PKCE OAuth, HttpOnly five-minute one-use durable intent, verified callback and existing idempotent workspace/OWNER provisioning. Existing email/password flows and project RLS remain in place.
- Added an onboarding quota guard to all HTTP bootstrap entry points so a directly obtained OAuth session cannot bypass the workspace limiter. Google Auth account creation relies on Google/Supabase safeguards; application quota protects OAuth starts and workspace provisioning.
- Applied additive migration `20261017000300_google_auth_hook` to the local test database and development Supabase, preserving the active hook and password-signup permit enforcement while accepting verified Google provider identities.
- Verified 43 unit/session tests and 19 real PostgreSQL integration tests, lint, formatting, TypeScript, production build and live Supabase configuration checks. Live HTTP checks: both forms show Google, start returns 200 with HttpOnly intent/PKCE cookies, Supabase redirects to accounts.google.com, foreign Origin rejected 403, cancellation redirects to login.
- Live Google provider is already enabled. No Dashboard setting was changed by the agent. Interactive Google consent/sign-in and callback allowlist require a browser walkthrough; exact configuration paths are in RUNBOOK.md.
- At the end of the Google extension, Step 3 had not started. Its subsequent completion is recorded above.

## Previous session — 17 October 2026, Step 2

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
