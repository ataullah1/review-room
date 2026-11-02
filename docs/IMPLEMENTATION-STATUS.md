# Review Room — Implementation Status

Plan: [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md). Baseline: 2 November 2026, HEAD `92f2827`.

This ledger separates existing repository functionality from planned upgrades. Initial working tree was clean. During this planning pass only this document and PRODUCT-ROADMAP.md were created; no application implementation, dependency installation, migration, service write or deployment was performed.

## Status rules

Use exactly: **not started / in progress / blocked / implemented-unverified / verified**.

- **not started:** no implementation of this roadmap task begun; existing prerequisite features do not count as completing the upgrade.
- **in progress:** implementation underway; name scope and remaining checks.
- **blocked:** a specific required decision/configuration/dependency prevents further task progress; explain it. Do not label an entire roadmap blocked merely because tasks are sequential or optional.
- **implemented-unverified:** code exists, but acceptance/compatibility/runtime evidence required by this task is incomplete.
- **verified:** all task acceptance criteria and relevant automated/manual checks have recorded evidence, including authorized isolated runtime checks when required. Existing source or test files alone never justify this status.

An accepted local check is not a passing production or staged browser journey. Record evidence class: source inspection / unit / local DB / staging Auth-Storage-mail-browser / manual / production operator receipt. Never include secrets, full capability URLs, real private content or environment credential values.

## Existing implemented baseline — not planned upgrades

These rows are **implemented-unverified** because end-to-end runtime acceptance was not rerun in this planning pass. Preserve their valid functionality; do not rebuild them as if missing.

| Baseline ID | Existing functionality                                                              | Status                 | Evidence / limitations                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BASE-01     | Email/password Auth, Google OAuth, cookie refresh, `/app` landing                   | implemented-unverified | `src/lib/auth/`, `src/app/auth/`, `src/proxy.ts`; requires current Auth/SMTP/callback configuration. Recovery missing; current signup requires auto-confirm.                              |
| BASE-02     | Profile/workspace bootstrap; workspace chooser; existing roles/project isolation    | implemented-unverified | `src/lib/data/{bootstrap,permissions,context}.ts`, `src/lib/server/workspaces.ts`, identity migrations. Source and tests are not current deployed RLS verification.                       |
| BASE-03     | Project create/search/page/assign/archive/restore                                   | implemented-unverified | `src/lib/data/projects.ts`, project routes/actions/forms; no rename/description/deadline/completion upgrade yet.                                                                          |
| BASE-04     | Private image upload, byte validation, immutable version publication/cancel/cleanup | implemented-unverified | `src/lib/data/uploads.ts`, `src/features/uploads/`, `src/lib/storage/client.ts`; staging bytes and cleanup capacity untested here.                                                        |
| BASE-05     | Pins/replies, normalized coordinates, owner/designer resolve/reopen                 | implemented-unverified | `src/lib/data/comments.ts`, `src/features/comments/review-workspace.tsx`; current-version and archive restrictions exist.                                                                 |
| BASE-06     | Version history/comparison, individual client decisions/history                     | implemented-unverified | `src/lib/data/reviews.ts`, `src/features/reviews/`, review migration; no aggregate required-reviewer or completed-delivery semantics.                                                     |
| BASE-07     | Seven-day invitation/manual send; one-day read-only share; expiry/revocation        | implemented-unverified | `src/lib/data/sharing.ts`, invite/share routes, capability functions; email assurance policy requires RR-003.                                                                             |
| BASE-08     | Activity feed and per-user unread marker                                            | implemented-unverified | `src/lib/data/activity.ts`, `src/features/activity/activity-panel.tsx`; no outbound notification system.                                                                                  |
| BASE-09     | Homepage simulation and isolated guest demo                                         | implemented-unverified | `src/features/marketing/`, `src/lib/data/demo.ts`, `src/features/demo/`; simulated/JSON demo state is not real customer review data.                                                      |
| BASE-10     | Real public three-role demo, structural/identity guards and quotas                  | implemented-unverified | `src/features/reviewer-demo/`, reviewer migration, `DEMO_SETUP.md`; operator setup is restricted to original owner-authorized accounts/backend. Do not provision or reset while planning. |
| BASE-11     | Preview/test target guards, Auth/maintenance diagnostics, bounded cron              | implemented-unverified | `src/lib/config/deployment.ts`, `src/lib/auth/failure.ts`, maintenance handler, `vercel.json`; scheduler execution and restore not verified here.                                         |

### Historical local verification, not rerun for this planning pass

The preceding read-only audit reported these checks passing on the inspected baseline:

| Command                                                            | Reported result            | What it does not prove                                                    |
| ------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------- |
| `pnpm exec vitest run --exclude 'tests/integration/**' --no-cache` | 135 tests, 17 files passed | Current hosted behavior, SMTP, RLS execution, Storage or browser journeys |
| `pnpm exec tsc --noEmit --incremental false`                       | Passed                     | Production build or runtime behavior                                      |
| `pnpm exec eslint . --max-warnings=0 --no-cache`                   | Passed                     | Workflow completeness/security                                            |
| `pnpm db:validate`                                                 | Prisma schema valid        | Applied migration state, DB drift or active policies                      |

No new test/build result is claimed by this planning pass. Integration/browser scripts were inspected only: they mutate isolated fixtures and may apply migrations. Backup/restore evidence in old narrative documentation must not be promoted to a current release receipt.

## Planned upgrades

All tasks start **not started**. “Decision/setup prerequisite” notes identify what must be settled when the task is selected, not permission to mutate configuration now. Effort and full acceptance/rollout details are in the roadmap.

| Task ID | Phase                   | Task                                                  | Type / priority                   | Status                 | Dependencies                   | Evidence / notes                                                                                                                            |
| ------- | ----------------------- | ----------------------------------------------------- | --------------------------------- | ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| RR-001  | 0 — Foundation          | Portable, safe buyer configuration                    | improvement + docs / P0           | implemented-unverified | None                           | Configurable app origin & production ref; DB/Auth project consistency check; probe CA reuse; 14 migrations / 19 tables in docs.             |
| RR-002  | 0 — Foundation          | Verification harness and redacted diagnostics         | verification + improvement / P0   | implemented-unverified | RR-001 for hosted checks       | Shared sanitized mutation diagnostics; browser fixture cleanup traps; clean CI workflow; 18 files / 144 unit tests passing.                 |
| RR-003  | 1 — Identity            | Verification-aware signup and invitation identity     | security contract correction / P0 | implemented-unverified | RR-001, RR-002                 | Verification-aware signup and resend flow; callback PKCE/OTP session exchange; return-path preservation; 18 files / 148 unit tests passing. |
| RR-004  | 1 — Identity            | Password recovery                                     | new feature / P0                  | not started            | RR-003                         | No recovery routes/UI. Preserve public-demo credential protections.                                                                         |
| RR-005  | 1 — Identity            | Invitation lifecycle and project-access removal       | improvement / P1                  | not started            | RR-003                         | Expiry/revoke/assignment already exist; clarify accepted access, replacement tokens and role conflicts. Delivery follows RR-012.            |
| RR-006  | 2 — Storage             | Backlog-aware cleanup                                 | improvement / P0                  | not started            | RR-002                         | Daily five-row upload batch plus opportunistic cleanup; add bounded expiry claims/retry/queue visibility.                                   |
| RR-007  | 2 — Storage             | Usage accounting and configurable limits              | new feature / P0                  | not started            | RR-006                         | Existing per-file/pending/demo limits are not normal workspace byte accounting. Backfill before enforcement.                                |
| RR-008  | 2 — Storage             | Interrupted upload recovery                           | improvement / P1                  | not started            | RR-006, RR-007                 | Existing state machine retained; recover expired processing/ambiguous outcomes without READY overwrite.                                     |
| RR-009  | 3 — Usability           | Invitation-aware onboarding/next actions              | improvement / P1                  | not started            | RR-003, RR-005, RR-008         | Existing normal bootstrap may create empty personal workspace for invitees. Do not delete legacy workspaces.                                |
| RR-010  | 3 — Usability           | Project metadata and overview                         | improvement / P1                  | not started            | RR-009                         | Nullable description/date-only due date, owner rename; aggregate filters wait for RR-015.                                                   |
| RR-011  | 3 — Usability           | Draft/stale-state recovery and targeted accessibility | improvement / P1                  | not started            | RR-008, RR-009                 | Existing keyboard pin/mobile drawer preserved; persistence remains user/version/session scoped.                                             |
| RR-015  | 4 — Approval foundation | Required reviewers/aggregate approval                 | new feature / P1                  | not started            | RR-002, RR-005, RR-010, RR-011 | Confirm reviewer/open-pin rules. Checkpoint A data/service, B UI/status. No dependency on notification transport.                           |
| RR-012  | 5 — Notifications       | Durable outbox/invitation mail                        | new feature / P1                  | not started            | RR-002, RR-003, RR-005, RR-006 | Checkpoint A private outbox/leases, B invite delivery. Need mail transport/sender and encrypted short-lived delivery-secret handling.       |
| RR-013  | 5 — Notifications       | Request review and essential event notifications      | new feature / P1                  | not started            | RR-012, RR-015                 | Reuse actual round contract; recipient reauthorization, dedupe, preference and failure isolation required.                                  |
| RR-016  | 6 — Completion/delivery | Completion/reopening snapshots                        | new feature / P1                  | not started            | RR-015                         | Confirm lifecycle semantics. DB restrictions must cover every write path before UI enabled.                                                 |
| RR-017  | 6 — Completion/delivery | Approved-original downloads/manifest                  | new feature / P1                  | not started            | RR-016, RR-007                 | Reuse short-lived authorized signing; exact frozen version/hash, no object keys or persistent URLs in exports.                              |
| RR-018  | 6 — Completion/delivery | Printable approval summary/JSON export                | new feature / P1                  | not started            | RR-017                         | Browser print, not mandatory headless PDF. No claim of legal e-signature.                                                                   |
| RR-020  | 7 — Release             | Fresh install, critical journeys and restore dossier  | verification + docs / P0 gate     | not started            | RR-001–013, RR-015–018         | All core acceptance, migration compatibility and isolated DB/Auth/Storage restore; no production release authorized.                        |
| RR-014  | Later                   | Previous-feedback/addressed-in-version checklist      | new feature / P2                  | not started            | RR-011, RR-015                 | Intentionally deferred; original thread/version remains authoritative.                                                                      |
| RR-019  | Later                   | Bounded delivery ZIP                                  | new feature / P2                  | not started            | RR-017, RR-018                 | Runtime ADR/workload measurements and artifact expiry policy required; individual downloads suffice initially.                              |
| RR-021  | Later                   | Soft removal and safe eventual purge                  | new feature / P2                  | not started            | RR-006, RR-007, RR-016, RR-020 | Retention decision and restore proof required; first release retains originals. No automatic archive purge.                                 |

Stable IDs are retained even though dependency order differs numerically: **RR-015 must precede RR-013**. Do not execute task IDs by numeric range without checking phase/dependencies. First release excludes RR-014/RR-019/RR-021.

## Phase completion gates

| Phase | Gate                                                                             | Current state / evidence still required                                                                |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0     | Buyer configuration portable; safe baseline local and staged journey documented  | Open — clean buyer install, target guards, reproducible staging and diagnostic evidence                |
| 1     | Verified signup/invite identity/recovery/access lifecycle accepted               | Open — identity policy confirmation, SMTP, legacy compatibility and expired/replay tests               |
| 2     | Accurate usage; cleanup backlog drains; interrupted uploads safe                 | Open — concurrent accounting, failure injection, observed backlog/host budget                          |
| 3     | First-use and mobile/keyboard review usable without context loss                 | Open — owner/invitee browser flows, draft isolation and actual viewport/device records                 |
| 4     | Explainable required-reviewer aggregate preserves old history                    | Open — policy confirmation, round data/UI, stale/new-version/open-pin/reviewer-removal races           |
| 5     | Essential mail reliable and permission-aware, core actions survive SMTP failure  | Open — outbox/recipient/dedupe/encryption tests and controlled inbox acceptance                        |
| 6     | Complete→original download/summary→reopen→fresh review works                     | Open — immutable completion manifests, write barriers, exact bytes and export authorization            |
| 7     | Fresh installation and isolated complete restore verified; release dossier ready | Open — all first-release tasks verified, full critical journeys and separate operator release approval |
| Later | Optional task's own security/runtime/data acceptance                             | Unselected — not a release gate and not “blocked” just because deferred                                |

## Execution evidence template

Append a dated entry per task/checkpoint; do not overwrite historical receipts:

```text
Date / actor:
Task ID and checkpoint:
Repository commit + relevant uncommitted scope:
Status before → after:
Inspected current behavior and files:
Implemented files and migrations (if any):
Configuration/manual prerequisites; actual changes versus instructions only:
Environment class + non-secret target alias:
Commands run and exact pass/fail counts:
Manual/browser cases, viewport/device, outcomes:
Negative authorization + compatibility/race evidence:
External writes authorized/performed (or none):
Rollout/rollback constraints:
Remaining acceptance gaps and concrete block, if any:
Phase gate impact:
```

Never set **verified** because code compiled, a screenshot exists or a test was added. For checkpoints A/B, keep the task in progress or implemented-unverified until both required checkpoints and runtime acceptance pass. Mark a phase complete only after checking every required task, not an optional enhancement.

## Planning receipt — 2 November 2026

- Read AGENTS.md and relevant current source/tests/schema/migrations/docs; initial working tree clean at `92f2827`.
- No existing PRODUCT-ROADMAP.md or IMPLEMENTATION-STATUS.md was present; no completed plan entries were overwritten.
- Created only the two requested English planning documents. No application implementation, secrets copied, dependencies installed, migration/test fixture run, email sent, external service write, commit, push or deployment.
- First implement RR-001, then RR-002. Phase 1 needs the identity policy/sender setup decision; approval/completion policy confirmation is needed before RR-015/RR-016, not before the initial safe configuration work.

## Execution receipt — 2 November 2026 (RR-001)

```text
Date / actor: 2 November 2026 / Antigravity Agent
Task ID and checkpoint: RR-001 (Phase 0 — Foundation: Portable, safe buyer configuration)
Repository commit + relevant uncommitted scope: HEAD 92f2827; modified: .env.example, docs/RELEASE.md, scripts/check-database.ts, scripts/reviewer-demo/verify.ts, src/app/auth/callback/route.ts, src/app/auth/google/route.ts, src/app/layout.tsx, src/app/page.tsx, src/app/robots.ts, src/app/sitemap.ts, src/lib/config/deployment.ts, src/lib/config/environment.ts, tests/deployment.test.ts, tests/environment.test.ts; untracked: docs/IMPLEMENTATION-STATUS.md, docs/PRODUCT-ROADMAP.md
Status before → after: not started → implemented-unverified
Inspected current behavior and files: src/lib/config/deployment.ts fixed origin to https://rreviewroom.vercel.app and backend ref to pwzwrknnzkdagfcjnqkr; layout.tsx/page.tsx/robots.ts/sitemap.ts/auth routes hardcoded origin or expected NEXT_PUBLIC_APP_URL without safe normalization/actionable error; scripts/check-database.ts bypassed databaseConnectionOptions CA cert logic; assertPreviewIsolation/assertHostedTestTarget only protected the owner's ref; docs/RELEASE.md reported stale 13 migrations / 17 tables instead of 14 migrations / 19 tables.
Implemented files and migrations (if any):
  - src/lib/config/deployment.ts: added readAppOrigin(env), readProtectedProductionProjectRef(env), extractSupabaseProjectRef(value), assertHostedProjectConsistency(env), getProtectedProjectRefs(env); preserved productionOrigin/productionSupabaseRef for backwards compatibility.
  - src/lib/config/environment.ts: integrated assertHostedProjectConsistency(env) into readDatabaseEnvironment and readStorageEnvironment.
  - src/app/layout.tsx: metadataBase dynamically uses readAppOrigin().
  - src/app/page.tsx: generateMetadata() and siteIdentity dynamically use readAppOrigin().
  - src/app/robots.ts, src/app/sitemap.ts: sitemap URLs dynamically use readAppOrigin().
  - src/app/auth/callback/route.ts, src/app/auth/google/route.ts: redirect base URLs use readAppOrigin().
  - scripts/check-database.ts: refactored to reuse databaseConnectionOptions(process.env).
  - scripts/reviewer-demo/verify.ts: uses readAppOrigin() for test requests.
  - .env.example: documented Mode A (local loopback) vs Mode B (hosted dev), PRODUCTION_SUPABASE_PROJECT_REF, and reviewer demo defaults.
  - docs/RELEASE.md: added PRODUCTION_SUPABASE_PROJECT_REF to Vercel production table; updated migration count to 14 migrations / 19 application tables.
  - tests/deployment.test.ts: added tests for readAppOrigin resolution/redaction, buyer PRODUCTION_SUPABASE_PROJECT_REF preview/test isolation, and hosted DB/Auth consistency.
  - tests/environment.test.ts: added test for deployed DB/Storage project mismatch.
  - No database migration needed or executed (no schema changes).
Configuration/manual prerequisites; actual changes versus instructions only: Local changes only. No external services, deployments, or credentials mutated.
Environment class + non-secret target alias: Local test runner / isolated test environment.
Commands run and exact pass/fail counts:
  - `pnpm exec vitest run --exclude 'tests/integration/**' --no-cache`: 17 test files passed, 139 tests passed (0 failures).
  - `pnpm exec tsc --noEmit --incremental false`: passed with 0 errors.
  - `pnpm exec eslint . --max-warnings=0 --no-cache`: passed with 0 errors, 0 warnings.
  - `pnpm format:check`: all files formatted per Prettier code style.
  - `pnpm check`: (lint + typecheck + test + format:check) passed with exit code 0.
  - `pnpm db:validate`: Prisma schema valid.
Manual/browser cases, viewport/device, outcomes: Local automated tests only; real hosted multi-role browser journeys deferred to RR-002 staging run.
Negative authorization + compatibility/race evidence:
  - Invalid NEXT_PUBLIC_APP_URL throws actionable error without leaking invalid input or secrets.
  - Missing NEXT_PUBLIC_APP_URL in VERCEL_ENV=production throws app_url_missing.
  - Preview environment with PREVIEW_SUPABASE_PROJECT_REF equal to custom buyer PRODUCTION_SUPABASE_PROJECT_REF throws "Production access is disabled".
  - Hosted test environment with HOSTED_TEST_PROJECT_REF equal to custom buyer PRODUCTION_SUPABASE_PROJECT_REF throws "live project is protected".
  - Deployed environment with mismatched DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL projects throws "Deployed DATABASE_URL does not match".
External writes authorized/performed (or none): None.
Rollout/rollback constraints: Rollback requires reverting git changes. No database schema changes occurred.
Remaining acceptance gaps and concrete block, if any: Verification on a live buyer domain in an isolated Supabase project/Vercel deployment has not been performed; status remains implemented-unverified per roadmap rules.
Phase gate impact: Phase 0 gate remains open pending RR-002 verification harness and staging acceptance.
```

## Execution receipt — 2 November 2026 (RR-002)

```text
Date / actor: 2 November 2026 / Antigravity Agent
Task ID and checkpoint: RR-002 (Phase 0 — Foundation: Reproducible verification harness and redacted diagnostics)
Repository commit + relevant uncommitted scope: HEAD 92f2827; modified: .env.example, docs/RELEASE.md, next-env.d.ts, scripts/check-database.ts, scripts/reviewer-demo/verify.ts, scripts/test-browser.mjs, src/app/app/[workspaceId]/projects/[projectId]/assets/[assetId]/comments/route.ts, src/app/app/[workspaceId]/projects/[projectId]/assets/[assetId]/decisions/route.ts, src/app/auth/callback/route.ts, src/app/auth/google/route.ts, src/app/layout.tsx, src/app/page.tsx, src/app/robots.ts, src/app/sitemap.ts, src/features/projects/actions.ts, src/features/sharing/http.ts, src/features/uploads/http.ts, src/lib/config/deployment.ts, src/lib/config/environment.ts, tests/deployment.test.ts, tests/environment.test.ts, tests/uploads.test.ts; untracked: .github/workflows/ci.yml, docs/IMPLEMENTATION-STATUS.md, docs/PRODUCT-ROADMAP.md, docs/VERIFICATION.md, src/lib/server/diagnostics.ts, tests/diagnostics.test.ts
Status before → after: not started → implemented-unverified
Inspected current behavior and files: Auth used dedicated failure handler src/lib/auth/failure.ts, but core mutations (projects, uploads, comments, reviews, sharing) lacked uniform correlation IDs and redacted diagnostics; browser test runner scripts/test-browser.mjs lacked signal-trap cleanup on abort; repository lacked a reproducible clean CI workflow without secrets.
Implemented files and migrations (if any):
  - src/lib/server/diagnostics.ts: added classifyFailureReason, mutationFailure, actionFailure to map errors into safe categories (e.g. database_credentials, database_connection, database_schema, storage_failure, unclassified), emit { event: "mutation_failure", requestId, domain, operation, stage, reason }, and append safe (Reference: <id>) without exposing raw queries or tokens.
  - src/features/projects/actions.ts: integrated actionFailure for project create/archive/restore.
  - src/features/uploads/http.ts: integrated mutationFailure for upload operations.
  - src/app/app/[workspaceId]/projects/[projectId]/assets/[assetId]/comments/route.ts: integrated mutationFailure for comment additions.
  - src/app/app/[workspaceId]/projects/[projectId]/assets/[assetId]/decisions/route.ts: integrated mutationFailure for decision recording.
  - src/features/sharing/http.ts: integrated mutationFailure for capability operations.
  - scripts/test-browser.mjs: added SIGINT/SIGTERM handlers and cleanupTrackedFixtures to safely clean up only tracked test resources on abort.
  - .github/workflows/ci.yml: clean-room GitHub Actions CI pipeline running validate, typecheck, lint, format:check, test without secrets.
  - docs/VERIFICATION.md: verification boundaries, refusal guards, log schemas.
  - tests/diagnostics.test.ts: 5 unit tests for classification, redaction, correlation IDs.
  - tests/uploads.test.ts: updated upload failure assertion for reference ID presence.
Configuration/manual prerequisites; actual changes versus instructions only: Local changes only. No production or staging credentials mutated.
Environment class + non-secret target alias: Local test runner / isolated test environment.
Commands run and exact pass/fail counts:
  - `pnpm exec vitest run --exclude 'tests/integration/**' --no-cache`: 18 test files passed, 144 tests passed (0 failures).
  - `pnpm exec tsc --noEmit`: passed with 0 errors.
  - `pnpm exec eslint . --max-warnings=0`: passed with 0 errors, 0 warnings.
  - `pnpm format:check`: all files formatted per Prettier code style.
  - `pnpm check`: (lint + typecheck + test + format:check) passed with exit code 0.
Manual/browser cases, viewport/device, outcomes: Local automated tests and guard checks; full hosted browser journey deferred to staging execution.
Negative authorization + compatibility/race evidence:
  - Raw database errors with database credentials or connection strings are classified and replaced with safe reference IDs.
  - Preserved 4xx validation errors without emitting server failure logs.
External writes authorized/performed (or none): None.
Rollout/rollback constraints: Dual-compatible error handling; does not alter success responses.
Remaining acceptance gaps and concrete block, if any: Verification against live Supabase staging requires explicit operator staging credentials; status remains implemented-unverified per roadmap rules.
Phase gate impact: Phase 0 code implemented and verified locally; gate remains open until hosted staging verification journey is executed.
```

## Execution receipt — 2 November 2026 (RR-003)

```text
Date / actor: 2 November 2026 / Antigravity Agent
Task ID and checkpoint: RR-003 (Phase 1 — Identity: Verification-aware signup and trustworthy invite identity)
Repository commit + relevant uncommitted scope: HEAD 92f2827; modified: .env.example, docs/RELEASE.md, next-env.d.ts, scripts/check-database.ts, scripts/reviewer-demo/verify.ts, scripts/test-browser.mjs, src/app/app/[workspaceId]/projects/[projectId]/assets/[assetId]/comments/route.ts, src/app/app/[workspaceId]/projects/[projectId]/assets/[assetId]/decisions/route.ts, src/app/auth/[operation]/route.ts, src/app/auth/callback/route.ts, src/app/auth/google/route.ts, src/app/layout.tsx, src/app/login/page.tsx, src/app/page.tsx, src/app/robots.ts, src/app/sitemap.ts, src/components/auth/auth-form.tsx, src/features/projects/actions.ts, src/features/sharing/http.ts, src/features/uploads/http.ts, src/lib/auth/core.ts, src/lib/auth/failure.ts, src/lib/config/deployment.ts, src/lib/config/environment.ts, tests/auth.test.ts, tests/deployment.test.ts, tests/environment.test.ts, tests/uploads.test.ts; untracked: .github/workflows/ci.yml, docs/IMPLEMENTATION-STATUS.md, docs/PRODUCT-ROADMAP.md, docs/VERIFICATION.md, src/lib/server/diagnostics.ts, tests/diagnostics.test.ts
Status before → after: not started → implemented-unverified
Inspected current behavior and files: `src/app/auth/[operation]/route.ts` hardcoded `assertInstantSignup` requiring `mailer_autoconfirm === true` and threw 503 if verification was enabled; `src/lib/auth/core.ts` required an immediate session on signup and failed with 503 instead of returning a pending-verification state; `src/app/auth/callback/route.ts` only handled Google OAuth and failed with `error=callback` when email confirmation codes arrived; `src/components/auth/auth-form.tsx` lacked email verification and resend UI; `src/app/login/page.tsx` lacked friendly verification failure message.
Implemented files and migrations (if any):
  - src/lib/auth/core.ts: updated `authenticate` to return `{ pendingVerification: true, email }` on signup when email confirmation is active (`hasSession: false`), added `resend` operation support, and added `unconfirmed` error classification for login attempts.
  - src/app/auth/[operation]/route.ts: updated `assertInstantSignup` to require enabled email provider without forcing `mailer_autoconfirm === true`; added `emailRedirectTo` with canonical app origin and preserved return path; added `resend` route operation; handled unconfirmed login errors cleanly.
  - src/lib/auth/failure.ts: added `resend_provider` to `AuthStage`.
  - src/app/auth/callback/route.ts: added support for PKCE session exchange (`exchangeCodeForSession`) and OTP token verification (`verifyOtp`), bootstrapped workspace for verified users, preserved destination return paths (including `/invite/accept`), and redirected errors safely to `/login?error=verification`.
  - src/app/login/page.tsx: added error message explaining invalid or expired verification links.
  - src/components/auth/auth-form.tsx: added conditional "Verify your email" check-inbox screen with resend link action and clear sign-in link.
  - tests/auth.test.ts: added unit tests for pending verification on signup without session, unconfirmed login rejection (403), login without session (503), resend verification success, and resend rate limiting.
Configuration/manual prerequisites; actual changes versus instructions only: Local code and tests only. External Supabase SMTP and Dashboard confirmation settings documented; no live hosted Auth configuration mutated.
Environment class + non-secret target alias: Local test runner / isolated test environment.
Commands run and exact pass/fail counts:
  - `pnpm exec vitest run tests/auth.test.ts`: passed, 19 tests passed (0 failures).
  - `pnpm exec vitest run --exclude 'tests/integration/**' --no-cache`: passed, 18 test files passed, 148 tests passed (0 failures).
  - `pnpm exec tsc --noEmit`: passed with 0 errors.
  - `pnpm exec eslint . --max-warnings=0`: passed with 0 errors, 0 warnings.
  - `pnpm format`: formatted modified files cleanly.
  - `pnpm check`: (lint + typecheck + test + format:check) passed with exit code 0.
  - `pnpm db:validate`: Prisma schema valid.
Manual/browser cases, viewport/device, outcomes: Local automated unit tests for auth core and API boundary; hosted SMTP capture and full browser confirmation journey deferred to authorized staging run.
Negative authorization + compatibility/race evidence:
  - Unconfirmed login attempts rejected with 403 status.
  - Invalid or missing email on resend rejected with 400 status.
  - Rate-limited resend attempts rejected with 429 status.
  - Invalid or expired confirmation links redirect to `/login?error=verification` without disclosing internal tokens or provider codes.
External writes authorized/performed (or none): None.
Rollout/rollback constraints: Dual-compatible signup allows both instant sign-in (`mailer_autoconfirm = true`) and verification-first mode (`mailer_autoconfirm = false`) without breaking existing deployments.
Remaining acceptance gaps and concrete block, if any: End-to-end verification through real email dispatch requires configured SMTP in a non-production Supabase project; status remains implemented-unverified per roadmap rules.
Phase gate impact: Phase 1 signup and verification code implemented locally; Phase 1 gate remains open pending password recovery (RR-004), invitation access lifecycle (RR-005), and staging journey verification.
```
