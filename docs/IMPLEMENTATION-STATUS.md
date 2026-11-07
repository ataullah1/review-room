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

| Task ID | Phase                   | Task                                                  | Type / priority                   | Status                 | Dependencies                   | Evidence / notes                                                                                                                                                        |
| ------- | ----------------------- | ----------------------------------------------------- | --------------------------------- | ---------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RR-001  | 0 — Foundation          | Portable, safe buyer configuration                    | improvement + docs / P0           | implemented-unverified | None                           | Configurable app origin & production ref; DB/Auth project consistency check; probe CA reuse; 14 migrations / 19 tables in docs.                                         |
| RR-002  | 0 — Foundation          | Verification harness and redacted diagnostics         | verification + improvement / P0   | implemented-unverified | RR-001 for hosted checks       | Shared sanitized mutation diagnostics; browser fixture cleanup traps; clean CI workflow; 18 files / 144 unit tests passing.                                             |
| RR-003  | 1 — Identity            | Verification-aware signup and invitation identity     | security contract correction / P0 | implemented-unverified | RR-001, RR-002                 | Fresh provider-callback mailbox proof is now required by invitation SQL; legacy auto-confirm timestamps alone cannot grant new access. SMTP/staging acceptance pending. |
| RR-004  | 1 — Identity            | Password recovery                                     | new feature / P0                  | implemented-unverified | RR-003                         | Session-bound, expiring, single-use recovery grant; ordinary session reset denied; public demo protections retained. Hosted recovery pending.                           |
| RR-005  | 1 — Identity            | Invitation lifecycle and project-access removal       | improvement / P1                  | implemented-unverified | RR-003                         | Explicit invite replacement revoking prior token; access removal retaining workspace/other projects; conflicting role guidance; 18 files / 166 unit tests passing.      |
| RR-006  | 2 — Storage             | Backlog-aware cleanup                                 | improvement / P0                  | implemented-unverified | RR-002                         | Dedicated cleanup lease/backoff columns fix READY immutability conflict found by real local DB tests; local backlog/retry tests pass.                                   |
| RR-007  | 2 — Storage             | Usage accounting and configurable limits              | new feature / P0                  | implemented-unverified | RR-006                         | Definer capacity check sees all pending uploaders without granting metadata access; includes pending versions in limits. Local hidden-project tests pass.               |
| RR-008  | 2 — Storage             | Interrupted upload recovery                           | improvement / P1                  | implemented-unverified | RR-006, RR-007                 | Authorized upload status route, retry/reload UI, expired processing lease recovery and hash-verified reuse of ambiguous Storage success; browser acceptance pending.    |
| RR-009  | 3 — Usability           | Invitation-aware onboarding/next actions              | improvement / P1                  | implemented-unverified | RR-003, RR-005, RR-008         | Invite-aware bootstrap avoids empty personal workspace; existing collaborators return to shared work; contextual first-upload/invite guidance. Local DB checks pass.    |
| RR-010  | 3 — Usability           | Project metadata and overview                         | improvement / P1                  | implemented-unverified | RR-009                         | Owner rename, nullable brief/date-only deadline, completed-project filtering and overview guidance; validation tests pass; UI acceptance pending.                       |
| RR-011  | 3 — Usability           | Draft/stale-state recovery and targeted accessibility | improvement / P1                  | implemented-unverified | RR-008, RR-009                 | User/project/version-scoped one-hour tab draft recovery, logout cleanup and focus refresh; physical mobile/keyboard acceptance pending.                                 |
| RR-015  | 4 — Approval foundation | Required reviewers/aggregate approval                 | new feature / P1                  | implemented-unverified | RR-002, RR-005, RR-010, RR-011 | Required-client round snapshots, conflicting decisions/open-pin/access-loss blocking, legacy preservation and safe designer candidate RPC; local DB tests pass.         |
| RR-012  | 5 — Notifications       | Durable outbox/invitation mail                        | new feature / P1                  | implemented-unverified | RR-002, RR-003, RR-005, RR-006 | Encrypted durable outbox, bounded leases/backoff, replacement/expiry checks and delivery states; fake-mail local DB retry tests pass; real provider off.                |
| RR-013  | 5 — Notifications       | Request review and essential event notifications      | new feature / P1                  | implemented-unverified | RR-012, RR-015                 | Explicit version review request plus feedback/reply/decision notifications, dedupe, current recipient authorization and mute preferences; live mail pending.            |
| RR-016  | 6 — Completion/delivery | Completion/reopening snapshots                        | new feature / P1                  | implemented-unverified | RR-015                         | Owner complete/reopen, immutable manifests, DB write barriers and previous-delivery preservation; local authorization/lifecycle tests pass.                             |
| RR-017  | 6 — Completion/delivery | Approved-original downloads/manifest                  | new feature / P1                  | implemented-unverified | RR-016, RR-007                 | Approved original attachment signing and authorized delivery history; immutable version/hash selection; real hosted byte download acceptance pending.                   |
| RR-018  | 6 — Completion/delivery | Printable approval summary/JSON export                | new feature / P1                  | implemented-unverified | RR-017                         | Printable approval record and JSON manifest with frozen decisions/dates/notes; no signed URLs or object keys in exports; print acceptance pending.                      |
| RR-020  | 7 — Release             | Fresh install, critical journeys and restore dossier  | verification + docs / P0 gate     | in progress            | RR-001–013, RR-015–018         | Local tests/build/migration rehearsal/schema comparison performed; release docs updated. Isolated hosted Auth/mail/browser and full backup restore remain outstanding.  |
| RR-014  | Later                   | Previous-feedback/addressed-in-version checklist      | new feature / P2                  | not started            | RR-011, RR-015                 | Intentionally deferred; original thread/version remains authoritative.                                                                                                  |
| RR-019  | Later                   | Bounded delivery ZIP                                  | new feature / P2                  | not started            | RR-017, RR-018                 | Runtime ADR/workload measurements and artifact expiry policy required; individual downloads suffice initially.                                                          |
| RR-021  | Later                   | Soft removal and safe eventual purge                  | new feature / P2                  | not started            | RR-006, RR-007, RR-016, RR-020 | Retention decision and restore proof required; first release retains originals. No automatic archive purge.                                                             |

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

## Execution receipt — 3 November 2026 (RR-004)

```text
Date / actor: 3 November 2026 / Antigravity Agent
Task ID and checkpoint: RR-004 (Phase 1 — Identity: Password recovery)
Repository commit + relevant uncommitted scope: HEAD 1f6ca1e; modified: .github/workflows/ci.yml, src/app/auth/[operation]/route.ts, src/app/auth/callback/route.ts, src/app/login/page.tsx, src/components/auth/auth-form.tsx, src/lib/auth/core.ts, src/lib/auth/validation.ts, tests/auth.test.ts; untracked: src/app/forgot-password/, src/app/reset-password/, src/components/auth/recovery-forms.tsx
Status before → after: not started → implemented-unverified
Inspected current behavior and files: `src/components/auth/auth-form.tsx` and `src/app/login/page.tsx` had no password recovery or reset link; `src/app/auth/[operation]/route.ts` and `src/lib/auth/core.ts` only handled signup, login, logout, bootstrap, and resend; `src/app/auth/callback/route.ts` had no handling for recovery callbacks (`type=recovery`); no forgot-password or reset-password pages existed.
Implemented files and migrations (if any):
  - src/lib/auth/validation.ts: added `recoveryRequestSchema` (email validation) and `passwordResetSchema` (password length 10–128).
  - src/lib/auth/core.ts: added `recover` and `reset-password` operations to `authenticate()`; prevented account enumeration by returning generic `{ ok: true, message: "If an account exists, instructions have been sent." }`; protected demo accounts (`isExistingDemoEmail`) by blocking reset requests and rejecting update attempts with 403; required active recovery user session for password update; signed out session on successful update and returned redirect to `/login?reset=success`.
  - src/app/auth/[operation]/route.ts: added `recover` and `reset-password` handlers with `resetPasswordForEmail` (redirecting to `/auth/callback?type=recovery`) and `updatePassword`.
  - src/app/auth/callback/route.ts: distinguished recovery callbacks (`type=recovery`); routed valid recovery session exchange to `/reset-password` and recovery failures to `/login?error=recovery`.
  - src/app/login/page.tsx: added friendly recovery error message (`error=recovery`) and reset success banner (`reset=success`).
  - src/components/auth/auth-form.tsx: added "Forgot password?" navigation link on login card and support for `initialSuccess` status display.
  - src/components/auth/recovery-forms.tsx: created `ForgotPasswordForm` and `ResetPasswordForm` client components following the established design system.
  - src/app/forgot-password/page.tsx: created server page for requesting password recovery.
  - src/app/reset-password/page.tsx: created server page requiring active session, guarding public demo accounts, and hosting password reset form.
  - tests/auth.test.ts: added 8 unit tests covering enumeration prevention, demo account protection, email format validation, rate limiting, password reset with active session, password length validation, unauthenticated reset rejection (401), and demo account reset rejection (403).
Configuration/manual prerequisites; actual changes versus instructions only: Local code and automated tests only. External Supabase SMTP settings documented; no live hosted credentials mutated.
Environment class + non-secret target alias: Local test runner / isolated test environment.
Commands run and exact pass/fail counts:
  - `pnpm exec vitest run tests/auth.test.ts`: passed, 27 tests passed (0 failures).
  - `pnpm exec vitest run --exclude 'tests/integration/**' --no-cache`: passed, 18 test files passed, 156 tests passed (0 failures).
  - `pnpm exec tsc --noEmit`: passed with 0 errors.
  - `pnpm exec eslint . --max-warnings=0`: passed with 0 errors, 0 warnings.
  - `pnpm format`: formatted modified files cleanly.
  - `pnpm check`: (lint + typecheck + test + format:check) passed with exit code 0.
  - `pnpm db:validate`: Prisma schema valid.
Manual/browser cases, viewport/device, outcomes: Local automated tests for recovery endpoints and demo protection; live email inbox delivery and full browser recovery journey deferred to authorized staging run.
Negative authorization + compatibility/race evidence:
  - Public demo accounts (`demo@admin.com`, `demo@designer.com`, `demo@client.com`) refuse password reset attempts with 403 Forbidden.
  - Password reset requests for demo accounts return generic success response without invoking Supabase recovery email.
  - Reset attempts without active recovery session fail with 401 Unauthorized.
  - Passwords shorter than 10 characters fail with 400 Bad Request.
  - Rate-limited recovery requests fail with 429 status.
External writes authorized/performed (or none): None.
Rollout/rollback constraints: Additive routes and handlers; no database schema migration required. Hiding recovery UI does not invalidate issued tokens.
Remaining acceptance gaps and concrete block, if any: Verification with real SMTP capture in an isolated Supabase staging environment; status remains implemented-unverified per roadmap rules.
Phase gate impact: Phase 1 password recovery code complete locally; Phase 1 gate remains open pending invitation access lifecycle (RR-005) and staging acceptance.
```

## Execution receipt — 3 November 2026 (RR-005)

```text
Date / actor: 3 November 2026 / Antigravity Agent
Task ID and checkpoint: RR-005 (Phase 1 — Identity: Invitations and explicit access removal)
Repository commit + relevant uncommitted scope: HEAD 1f6ca1e; modified: .github/workflows/ci.yml, src/app/app/[workspaceId]/projects/[projectId]/invitations/route.ts, src/app/forgot-password/page.tsx, src/app/login/page.tsx, src/app/reset-password/page.tsx, src/features/projects/actions.ts, src/features/projects/project-forms.tsx, src/features/sharing/owner-links.tsx, src/lib/data/projects.ts, src/lib/data/sharing.ts, tests/projects.test.ts, tests/sharing.test.ts; untracked: docs/IMPLEMENTATION-STATUS.md
Status before → after: not started → implemented-unverified
Inspected current behavior and files: `src/lib/data/sharing.ts` and `src/features/sharing/owner-links.tsx` supported creation, listing, and revocation of invitations, but had no explicit replace/resend operation that immediately revokes the old token; accepted invitations could be revoked without clarifying that project membership was not removed; workspace conflicting roles were checked only in SQL accept_invitation rather than upfront during invite creation; `src/lib/data/projects.ts` lacked an explicit single-member access removal function that immediately revokes project access while leaving workspace membership and other project assignments intact.
Implemented files and migrations (if any):
  - src/lib/data/sharing.ts:
    - Added `replaceInvitation(tx, userId, workspaceId, projectId, id)`: locks project, finds pending invitation, prevents replacing already accepted invitations (throws 400 directing owner to Project people), immediately revokes prior pending token, validates against active quota limit (<50) and conflicting workspace roles, generates fresh 32-byte high-entropy token with 7-day expiry.
    - Updated `createInvitation`: added upfront workspace conflicting-role check preventing invitations that contradict an accepted workspace role.
    - Updated `revokeInvitation`: returns informational warning (`warning`) when revoking an already accepted invitation link clarifying that project access must be removed via Project people.
  - src/lib/data/projects.ts: added `removeProjectMember(tx, userId, workspaceId, projectId, targetUserId)`: requires OWNER role, locks project, checks not archived (409), verifies member exists (404), and removes `ProjectMember` record while leaving `Membership` (workspace) and other project assignments intact.
  - src/app/app/[workspaceId]/projects/[projectId]/invitations/route.ts: added `operation: "replace"` schema validation and handler calling `replaceInvitation`.
  - src/features/projects/actions.ts: added `operation: "remove-member"` to `mutateProject`, calling `removeProjectMember` and returning confirmation message: "Member removed from this project. Workspace membership and other project assignments remain."
  - src/features/sharing/owner-links.tsx: added `replace(id)` client action, notice banner for warnings, "Replace & Resend" action button for pending/expired invitations, "Revoke link" with access management notice for accepted invitations, and labeled accepted status as "Accepted · Access managed in Project people".
  - src/features/projects/project-forms.tsx: updated `PeoplePicker` guidance text clarifying that removing a person revokes access here while keeping their workspace account and other project assignments.
  - tests/sharing.test.ts: added 5 unit tests covering token replacement and revocation, rejection of replacement on accepted invitations, conflicting role rejection, and revocation warning behaviors.
  - tests/projects.test.ts: added 5 unit tests covering `removeProjectMember` record deletion, non-member 404, archived project 409, invalid UUID rejection, and non-owner access denial.
Configuration/manual prerequisites; actual changes versus instructions only: Local implementation and automated tests only. No external services or credentials mutated.
Environment class + non-secret target alias: Local test runner / isolated test environment.
Commands run and exact pass/fail counts:
  - `pnpm exec vitest run tests/sharing.test.ts`: passed, 8 tests passed (0 failures).
  - `pnpm exec vitest run tests/projects.test.ts`: passed, 13 tests passed (0 failures).
  - `pnpm exec vitest run --exclude 'tests/integration/**' --no-cache`: passed, 18 test files passed, 166 tests passed (0 failures).
  - `pnpm exec tsc --noEmit`: passed with 0 errors.
  - `pnpm exec eslint . --max-warnings=0`: passed with 0 errors, 0 warnings.
  - `pnpm format:check`: all files formatted per Prettier code style.
  - `pnpm check`: (lint + typecheck + test + format:check) passed with exit code 0.
  - `pnpm db:validate`: Prisma schema valid.
Manual/browser cases, viewport/device, outcomes: Local automated tests for invitation replacement, role conflicts, revocation warning, and member access removal; multi-role browser journeys deferred to authorized staging run.
Negative authorization + compatibility/race evidence:
  - Attempting to replace an accepted invitation fails with 400 Bad Request.
  - Attempting to invite a user with a role conflicting with their existing workspace role fails with 409 Conflict.
  - Non-owner users cannot call `removeProjectMember`, `createInvitation`, `replaceInvitation`, or `revokeInvitation`.
  - Non-existent member removal fails with 404 Not Found.
  - Member removal on archived project fails with 409 Conflict.
  - Revoking an invitation invalidates prior pending tokens immediately.
External writes authorized/performed (or none): None.
Rollout/rollback constraints: Additive functions and UI workflows; existing invitation rows and memberships remain compatible; no schema migration required.
Remaining acceptance gaps and concrete block, if any: Verification across multiple browser roles in a live deployed Supabase staging environment; status remains implemented-unverified per roadmap rules.
Phase gate impact: Phase 1 (Identity, recovery and access lifecycle) local implementation complete; Phase 1 gate remains open pending staging journey verification.
```

## Execution receipt — 3 November 2026 (RR-006)

```text
Date / actor: 3 November 2026 / Antigravity Agent
Task ID and checkpoint: RR-006 (Phase 2 — Upload and storage reliability: Observable, backlog-aware cleanup)
Repository commit + relevant uncommitted scope: HEAD 6c451a7; modified: docs/IMPLEMENTATION-STATUS.md, scripts/cleanup-uploads.ts, src/app/api/maintenance/route.ts, src/features/maintenance/handler.ts, src/features/uploads/cleanup.ts, tests/uploads.test.ts
Status before → after: not started → implemented-unverified
Inspected current behavior and files: `src/features/uploads/cleanup.ts` executed an unbounded `updateMany` for expired PENDING versions; maintenance cron scheduled a static 5-item batch without time-budgeted draining; workers deleted storage objects without an atomic lease mechanism, allowing concurrent cron jobs to race destructive deletions; storage errors had no backoff, causing failing rows to immediately starve subsequent cleanup items; `/api/maintenance` lacked operational queue metrics (depth, oldest age).
Implemented files and migrations (if any):
  - src/features/uploads/cleanup.ts:
    - Bounded PENDING transitions to bounded batches (`limit * 2`), preventing table-wide locking during burst activity.
    - Added atomic worker leases using `processingToken` and `processingUntil` (`leaseMs`), preventing concurrent maintenance jobs from racing destructive deletions.
    - Added retry backoff (`backoffMs`, default 5 minutes): when storage deletion encounters an error, `cleanupAfter` is pushed forward and the lease is released so other queued rows proceed immediately.
    - Preserved safety distinction: READY versions delete only `stagingKey` (immutable originals are never deleted); FAILED versions delete both `stagingKey` and `objectKey`.
    - Added host execution budget draining (`maxDrainBudgetMs`) allowing long-running workers to drain multiple batches safely within runtime limits.
    - Added index-backed backlog metrics calculation (`pendingExpired`, `readyStaging`, `failedFinal`, `totalQueue`, `oldestAgeSeconds`, `leased`).
    - Added `dryRun` mode for inspection without mutations.
  - src/app/api/maintenance/route.ts: configured `maxDrainBudgetMs: 40_000` within 60s maxDuration and batch size 25 to drain backlogs efficiently.
  - src/features/maintenance/handler.ts: typed and propagated extended backlog metrics in maintenance response and logs.
  - scripts/cleanup-uploads.ts: added CLI arguments (`--drain`, `--dry-run`, `--limit=N`) and structured output reporting without secrets or object keys.
  - tests/uploads.test.ts: added 5 unit tests covering bounded PENDING transitions, atomic worker leasing, READY vs FAILED deletion scoping, retry backoff on storage error, index-backed backlog metrics, and dry-run safety.
Configuration/manual prerequisites; actual changes versus instructions only: Local implementation and automated tests only. No external services or credentials mutated.
Environment class + non-secret target alias: Local test runner / isolated test environment.
Commands run and exact pass/fail counts:
  - `pnpm exec vitest run tests/uploads.test.ts`: passed, 18 tests passed (0 failures).
  - `pnpm exec vitest run --exclude 'tests/integration/**' --no-cache`: passed, 18 test files passed, 171 tests passed (0 failures).
  - `pnpm exec tsc --noEmit`: passed with 0 errors.
  - `pnpm exec eslint . --max-warnings=0`: passed with 0 errors, 0 warnings.
  - `pnpm format:check`: all files formatted per Prettier code style.
  - `pnpm check`: (lint + typecheck + test + format:check) passed with exit code 0.
  - `pnpm db:validate`: Prisma schema valid.
Manual/browser cases, viewport/device, outcomes: Local automated tests for bounded expiration, worker leases, storage deletion scoping, backoff, and backlog metrics; live scheduled cron execution in staging deferred to staging acceptance.
Negative authorization + compatibility/race evidence:
  - Expired PENDING transitions are batch-limited and cannot run unbounded locks.
  - Concurrent workers with differing lease tokens cannot double-claim or race deletions on the same rows.
  - Storage deletion errors back off `cleanupAfter` by 5 minutes and clear the lease instead of starving the queue.
  - Dry run performs index-backed queries without updating database rows or deleting storage objects.
External writes authorized/performed (or none): None.
Rollout/rollback constraints: Backwards-compatible function signature; existing `AssetVersion` columns (`processingToken`, `processingUntil`, `cleanedAt`, `cleanupAfter`) are used without schema changes.
Remaining acceptance gaps and concrete block, if any: Verification with a live deployed Vercel cron and private Supabase storage bucket; status remains implemented-unverified per roadmap rules.
Phase gate impact: Phase 2 cleanup reliability implemented locally; Phase 2 gate remains open pending usage accounting (RR-007) and retry recovery (RR-008).
```

## Execution receipt — 3 November 2026 (RR-007)

```text
Date / actor: 3 November 2026 / Antigravity Agent
Task ID and checkpoint: RR-007 (Phase 2 — Upload and storage reliability: Usage accounting and configurable non-billing limits)
Repository commit + relevant uncommitted scope: HEAD b3a7585; modified: .env.example, docs/IMPLEMENTATION-STATUS.md, src/app/app/[workspaceId]/projects/page.tsx, src/lib/data/uploads.ts, src/lib/server/workspaces.ts; untracked: scripts/reconcile-storage.ts, src/lib/config/limits.ts, src/lib/data/storage-accounting.ts, tests/storage-accounting.test.ts
Status before → after: not started → implemented-unverified
Inspected current behavior and files: Normal workspace aggregate storage had no model, counter, or limit enforcement; only public demo had `ReviewerDemoQuota`; `prepareUpload` only checked single-file size (10 MB) and active reservations per user (5), allowing unbounded workspace total storage consumption; owners had no visibility into workspace storage usage; operators lacked non-destructive storage reconciliation.
Implemented files and migrations (if any):
  - src/lib/config/limits.ts: defined documented finite installation defaults (500 MB maxStorageBytes, 200 maxReadyVersions, 5 maxPendingUploads) and environment variable overrides (`WORKSPACE_MAX_STORAGE_BYTES`, `WORKSPACE_MAX_READY_VERSIONS`, `WORKSPACE_MAX_PENDING_UPLOADS`).
  - src/lib/data/storage-accounting.ts:
    - Added `getWorkspaceStorageUsage(tx, userId, workspaceId, limits, now)`: enforces workspace membership, aggregates committed bytes from all historical and current READY versions, aggregates active unexpired PENDING reserved bytes, computes usage percentage and over-limit status.
    - Added `assertStorageAvailable(tx, userId, workspaceId, expectedNewBytes, limits, now)`: acquires atomic transaction advisory lock (`storage:${workspaceId}`) to serialize concurrent reservations, rejects with 429 status and clear remediation instructions when byte limit, version limit, or pending reservation limit would be exceeded.
    - Added `reconcileWorkspaceStorage(db, targetWorkspaceId, limits, now)`: non-destructive operator reconciliation calculating actual committed, active reserved, stale expired, and failed versions per workspace without deleting files.
  - src/lib/data/uploads.ts: integrated `assertStorageAvailable` into `prepareUpload` under the workspace storage advisory lock.
  - src/lib/server/workspaces.ts: updated `getWorkspaceProjects` to return `storageUsage` for workspace owners.
  - src/app/app/[workspaceId]/projects/page.tsx: added owner workspace storage meter showing used MB, limit MB, usage percentage, version count, and limit warning.
  - scripts/reconcile-storage.ts: added operator CLI tool supporting whole-cluster or per-workspace reconciliation reporting.
  - .env.example: documented optional storage limit configuration variables.
  - tests/storage-accounting.test.ts: added 10 unit tests covering default limits, custom environment overrides, safe fallbacks, accurate byte/version aggregation, atomic workspace serialization, byte limit rejection, version limit rejection, pending upload limit rejection, unauthorized non-member rejection, and non-destructive reconciliation reporting.
Configuration/manual prerequisites; actual changes versus instructions only: Local implementation and automated tests only. No external services or credentials mutated.
Environment class + non-secret target alias: Local test runner / isolated test environment.
Commands run and exact pass/fail counts:
  - `pnpm exec vitest run tests/storage-accounting.test.ts`: passed, 10 tests passed (0 failures).
  - `pnpm exec vitest run --exclude 'tests/integration/**' --no-cache`: passed, 19 test files passed, 181 tests passed (0 failures).
  - `pnpm exec tsc --noEmit`: passed with 0 errors.
  - `pnpm exec eslint . --max-warnings=0`: passed with 0 errors, 0 warnings.
  - `pnpm format:check`: all files formatted per Prettier code style.
  - `pnpm check`: (lint + typecheck + test + format:check) passed with exit code 0.
  - `pnpm db:validate`: Prisma schema valid.
Manual/browser cases, viewport/device, outcomes: Local automated tests for storage limits, advisory lock serialization, over-limit rejection, and reconciliation; multi-role browser journeys deferred to authorized staging run.
Negative authorization + compatibility/race evidence:
  - Unauthorized non-members cannot read workspace storage usage.
  - Concurrent reservations for the same workspace are serialized by `storage:${workspaceId}` advisory lock and cannot exceed the limit.
  - Existing over-limit workspaces retain full read, view, approval, and comment history; only new `prepareUpload` reservations are blocked.
  - Expired PENDING reservations are automatically excluded from active reserved bytes.
  - Reconcile script detects totals without mutating or deleting files.
External writes authorized/performed (or none): None.
Rollout/rollback constraints: Index-backed aggregation on existing `AssetVersion` columns; no database schema change required. Disabling or increasing limits via environment variables immediately unblocks reservations.
Remaining acceptance gaps and concrete block, if any: Verification across multiple concurrent uploads in a live deployed Supabase staging environment; status remains implemented-unverified per roadmap rules.
Phase gate impact: Storage usage accounting and configurable non-billing limits complete locally; Phase 2 gate remains open pending interrupted upload recovery (RR-008).
```

## Execution receipt — 7 November 2026 (core workflow completion)

- **Scope:** preserved the incoming uncommitted RR-008 edits in `src/lib/data/uploads.ts` and `src/features/uploads/service.ts`, corrected RR-003/004/006/007 gaps, and implemented the remaining first-release source work RR-008–013 and RR-015–018. RR-020 verification is in progress. Optional RR-014/RR-019/RR-021 remain intentionally deferred per roadmap; no destructive purge or ZIP service was added.
- **User-confirmed decisions:** retain roadmap required-client approval, unresolved-comment blocking and owner-only explicit reopening; prepare verification-first identity code without changing hosted SMTP/Dashboard settings.
- **Data compatibility:** added migrations 015–022 (22 total, 27 application tables). No applied migration was rewritten. Mailbox proof/recovery grants are private; recovery is session-bound and consumed once. Existing memberships and immutable image/decision history remain. Existing individual decisions do not satisfy a newly requested round. Completion/reopen manifests preserve approved versions and historical reviewer outcomes. New code requires operator-applied migrations before hosted publication.
- **Important issue found and corrected:** RR-006 previously reused upload-processing fields on READY rows; actual local PostgreSQL immutability checks rejected those changes. Dedicated cleanup lease/retry fields now preserve immutable original metadata. Restricted request roles cannot edit these operational fields.
- **Authorization evidence:** local SQL integration tests cover hidden pending reservations, required-reviewer access changes, client/designer denial, completed-project write barriers including pre-existing finalize paths, new-version fresh review, no cross-project delivery access, actual mailbox proof and invite-only bootstrap. Designer candidate discovery uses a narrow definer function, without broadening Membership/Profile RLS.
- **Notification evidence:** local tests use synthetic identities and an injected fake sender. They check encrypted invitation payloads, SMTP-failure independence from committed invitations, bounded retries, clearing terminal payloads, replaced-link cancellation, recipient dedupe/access checks and preference ownership. No real mail provider was contacted. Application mail is disabled by default; Auth SMTP remains an external manual prerequisite.
- **Local verification:** 188 unit tests in 23 files passed; 94 PostgreSQL integration tests in 12 files passed. TypeScript and ESLint passed. A production Next.js build passed. Fresh temporary local DB applied all then-current migrations; all 27 tables had RLS. A read-only local Prisma schema comparison reported no difference. Migration 022 subsequently enriched the approval summary function only and was exercised by the integration suite; final rehearsal/build receipts are recorded below when run.
- **Environment:** only the repository's guarded PostgreSQL cluster on loopback port 55432 and synthetic test fixtures. The managed sandbox initially blocked PostgreSQL shared memory and stalled the bundler; approved local execution outside that restriction succeeded. No production/staging database, Auth account, Storage object, SMTP setting, provider account or external recipient was modified.
- **Manual/staging gaps:** configured isolated Supabase Auth/SMTP, Google consent/callback, actual browser/mobile/keyboard/draft/print/download journeys, production-host scheduling/latency and restoring DB/Auth/config plus original Storage bytes into a separate isolated project remain unverified. Do not mark tasks/phase gates verified from local tests alone.
- **Rollout/rollback:** follow the current upgrade section in `docs/RELEASE.md`. Back up first; rehearse target; apply reviewed migrations; publish compatible code; configure verification/SMTP manually; opt into application mail only after a controlled inbox test. Pause new jobs before encryption-key rotation; keep keys until queued payloads drain/expire. Never deploy old writers around completed-project protections or use a destructive down migration.
- **External writes/commit/deployment:** none. No commit, push, production migration or deployment performed. The existing-owner demo seed now requires reviewed migrations to be applied separately and refuses unexpected/pending migration histories; it no longer automatically migrates the live backend.

### Current phase gates (supersedes baseline gate notes)

| Phase | Current result                                                 | Evidence still required                                                         |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 0     | Source/config/diagnostics present; local checks pass           | Fresh buyer installation and isolated hosted baseline journey                   |
| 1     | Identity/recovery/access code and local negative tests present | Real verification/recovery mail and legacy-account browser acceptance           |
| 2     | Capacity/cleanup/interruption code and local DB checks pass    | Hosted Storage retry/download and real scheduler budget evidence                |
| 3     | Onboarding/metadata/draft source implemented                   | Physical mobile/keyboard and navigation/draft browser checks                    |
| 4     | Aggregate approval and old-data rules pass local SQL tests     | Hosted multi-client/stale-state acceptance                                      |
| 5     | Fake-provider encrypted outbox tests pass                      | Configured provider/sender, real inbox delivery and timeout/idempotency checks  |
| 6     | Completion/reopen/snapshot authorization pass local SQL tests  | Original byte download and browser print/export acceptance                      |
| 7     | Local release preparation in progress                          | Isolated full restore, hosted acceptance and separate operator release approval |

### Final local verification receipt — 7 November 2026

- Final production build: `NEXT_TELEMETRY_DISABLED=1 pnpm build` passed (no deployment).
- Final isolated migration rehearsal: `TEST_DATABASE_URL=<guarded loopback test DB> pnpm db:rehearse` applied **all 22 migrations**, confirmed **27 RLS-enabled application tables**, and removed only its temporary database.
- Full local integration suite: **94 tests in 12 files passed**, including migration 022; mail was injected/fake. Unit suite: **188 tests in 23 files passed**. TypeScript, ESLint, Prisma validation, Prettier and `git diff --check` passed.
- Remaining gate is hosted/manual acceptance and full isolated backup restoration, not a claim that local fixtures prove real Supabase SMTP/Auth or deployed browser behavior. No production migration, real email, commit, push or deployment was performed.

## Follow-up — review context and read-only release check (7 November 2026)

- Added version-scoped review request history to the existing review panel: requester, time, reason and frozen required-client names. The same existing local lifecycle test covers authorized reading and outsider denial.
- Project image cards now show the actual current-version review state (not requested, awaiting clients, changes requested, feedback open, reviewer access issue, approved). Only the current project's paginated visible assets are queried through existing authorization/RLS.
- No new files or migrations in this follow-up; incoming staged changes were preserved and not restaged/committed.
- Read-only live migration probe: 14 applied, migrations 015–022 pending (eight). Existing anonymous release smoke: all 17 checks passed. No production data, Auth setting, email or deployment was changed.
- Focused local lifecycle test: five tests passed, including review-history authorization. No full test/build rerun was needed for this focused UI/data-read update; TypeScript and changed-file lint/format checks are recorded separately.
- Hosted staging/mail configuration is absent from the available local configuration; SMTP/browser/restore acceptance remains unverified. Coordinate pending migrations with the matching application release; do not apply them to an old running invitation flow as an isolated step.

## Recovery backup receipt — 7 November 2026

- Read-only hosted export completed before any release migration: application, Auth and Storage metadata in an encrypted PostgreSQL custom archive, plus all 13 private bucket objects (12,472,692 bytes).
- Verified authenticated decryption and the archive catalog; all 13 READY originals matched their database content hashes and sizes. The backend still has 14 applied migrations; 015–022 remain pending.
- Recovery artifacts are outside Git at `~/ReviewRoom-backups/2026-11-07T04-26-55-126Z/`; `receipt.json` contains the non-secret verification result. AES-256-GCM key material is separate at `~/.review-room-backup-keys/2026-11-07T04-26-55-126Z.key`. Directories and files use owner-only permissions. Do not commit or publish either location.
- This is a verified encrypted export, **not a completed restore rehearsal**. Provider settings/global roles, off-site recovery, a full isolated Supabase restore and concurrent-write consistency remain unverified. Production writes were not paused during export.
- No production migration, Auth/Storage mutation, mail delivery, commit, push or deployment was performed. The next release gate remains isolated restoration and hosted acceptance, followed by coordinated migration/publication of compatible code.
