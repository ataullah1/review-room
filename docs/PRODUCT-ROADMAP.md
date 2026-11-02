# Review Room — Product and Development Roadmap

Planning baseline: 2 November 2026, repository HEAD `92f2827`. Companion execution ledger: [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md).

This document is a plan, not an implementation or permission to change a hosted environment. Read `AGENTS.md` before each task. Preserve unrelated changes. Never edit an applied migration, weaken RLS, expose secrets, or automatically provision, deploy, commit or reset production.

## 1. Product scope and customer

Review Room is primarily a source-code/self-hosted product for freelancers and small design agencies reviewing static design work with clients:

**Create project → upload design → request review → feedback → revision → version approval → final delivery.**

The first release must make that loop installable, understandable and recoverable. Keep Next.js App Router, Supabase Auth/private Storage, Prisma/PostgreSQL, existing roles and transaction-scoped authorization. No architectural rewrite, new role system, generic task manager or mandatory paid platform service.

Source-code readiness means a buyer can install on their own Supabase project and domain, understand service requirements, operate cleanup/backups, and run a protected demo without the original owner's identities. Hosted SaaS adds platform operations, tenant-wide abuse/cost enforcement, support and later billing. Do not build the latter merely to sell source code. A buyer's email service may incur charges; document that dependency honestly.

Effort: S = small focused change; M = several related modules; L = substantial workflow/data work. No calendar dates are implied. Priorities are relative to this release: P0 = trust/installability/reliability gate; P1 = complete the promised core; P2 = later enhancement. Types distinguish confirmed contract defects, improvements, new features and verification work.

## 2. Concise repository-confirmed baseline

| Existing behavior                                                                                  | Evidence                                                                                                                           | Important boundary                                                                                                                                              |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email/password signup/login/logout, Google PKCE, cookie refresh, default `/app` landing            | `src/lib/auth/core.ts`, `google.ts`, `supabase.ts`, `src/proxy.ts`, `src/app/auth/`                                                | No recovery flow. Signup explicitly requires auto-confirm; provider settings are external.                                                                      |
| Profile/workspace bootstrap, OWNER/DESIGNER/CLIENT memberships, assigned-project checks            | `src/lib/data/bootstrap.ts`, `onboarding.ts`, `permissions.ts`, `context.ts`, `prisma/schema.prisma`                               | One role per workspace; normal invited signups can create empty personal workspaces.                                                                            |
| Create/search/page/assign/archive/restore projects                                                 | `src/lib/data/projects.ts`, `src/features/projects/actions.ts`, `project-forms.tsx`                                                | No project description/deadline/rename flow or completion state.                                                                                                |
| Static JPG/PNG/WebP uploads, 10 MB/20 MP/8192px validation, private originals, version publication | `src/lib/data/uploads.ts`, `src/features/uploads/{service,image,validation,preview}.ts`, `src/lib/storage/client.ts`               | Five active pending reservations; no aggregate customer storage accounting. Preview bytes are regenerated.                                                      |
| Version-bound pins/replies, owner/designer resolution, historical read-only access                 | `src/lib/data/comments.ts`, `src/features/comments/review-workspace.tsx`                                                           | No durable drafts, edit/delete policy or cross-version addressed references.                                                                                    |
| V1/V2 history, side-by-side comparison, individual latest client decisions plus history            | `src/lib/data/reviews.ts`, `src/features/reviews/`, migration `20261017000800_versions_and_decisions`                              | No required-reviewer set, project sign-off or final handoff. Existing decisions must survive upgrades.                                                          |
| Seven-day email-bound invitations, one-day read-only version shares, hashed tokens/revocation      | `src/lib/data/sharing.ts`, `src/app/invite/`, `src/app/share/`, `src/features/sharing/`                                            | Manual send. A share holder can read image feedback; cannot comment/approve. Accepted invite revocation does not remove membership/assignment.                  |
| Project activity/unread state                                                                      | `src/lib/data/activity.ts`, `src/features/activity/activity-panel.tsx`                                                             | Focus/manual refresh, no notification delivery service.                                                                                                         |
| Bounded cleanup, private API headers, redacted Auth failure references                             | `src/features/uploads/cleanup.ts`, `src/app/api/maintenance/route.ts`, `src/lib/auth/failure.ts`, `next.config.mjs`, `vercel.json` | Scheduled upload batch is five per daily invocation; opportunistic prepare-time cleanup also exists. Restore is documented, not established by this inspection. |
| Three distinct demo mechanisms                                                                     | `src/features/marketing/showcase-state.ts`, `src/lib/data/demo.ts`, `src/features/reviewer-demo/`, `DEMO_SETUP.md`                 | Homepage simulation, isolated guest JSON session, and real public-role accounts are different products of evidence; do not conflate them.                       |
| Restricted request/capability roles, RLS, immutable READY versions, concurrency/permission tests   | `prisma/migrations/`, `supabase/`, `tests/integration/`                                                                            | Policies/tests existing in Git do not prove the deployed configuration or a passing hosted journey.                                                             |

There are 14 migration directories and 19 application models at this baseline. Some release instructions still describe 13 migrations/17 tables. `productionOrigin` and known backend references are hard-coded in `src/lib/config/deployment.ts`; public reviewer accounts and their operator seed are tied to the existing owner's backend. These are distribution limitations, not evidence that private server keys are published.

### Verification limits

For this planning pass: read `AGENTS.md`, checked the clean working tree and HEAD, inspected current Auth, schema, sharing, cleanup, configuration, tests and docs. No application command, migration, browser flow, DB connection or external service write was run. Only these two planning documents may change.

The immediately preceding read-only audit reported 135 unit tests in 17 files, ESLint, non-incremental TypeScript and Prisma validation passing. This is historical local evidence for this baseline, not a new run or hosted acceptance. Integration tests, build, fresh installation, browser/device checks, live SMTP/hook settings and recovery remain unverified here. `scripts/test-integration.ts` applies migrations and writes fixtures; `scripts/test-browser.mjs` creates hosted fixtures. Neither is read-only.

## 3. Product rules and explicit decisions

Defaults below are the planned contract, not claims about existing code.

### Access and identity

- Keep OWNER/DESIGNER/CLIENT and membership/project assignment authority. Owner manages; assigned designer uploads/resolves; assigned client reviews; all permitted collaborators can discuss.
- Prefer verified-email signup for new password users. Use Supabase transactional Auth email for verification/recovery. Do not treat auto-confirmed legacy `email_confirmed_at` or user-editable metadata as mailbox proof.
- Before granting an invitation, establish fresh mailbox possession through a server-validated verification flow, or an explicitly trusted provider-verified identity. Existing auto-confirmed identities require a compatible proof step; do not silently revoke their existing membership or lock them out.
- Invitation tokens remain random, hashed, expiring, email-bound and non-OWNER. Accepted-link revocation and removal of project access are separate, clearly worded actions. Removing project assignment does not implicitly remove unrelated assignments or workspace membership.
- Anonymous shares remain read-only version capabilities, including visible comments/author names. No anonymous write feature in the first release. Revocation cannot recall downloaded files or a signed URL during its remaining short lifetime.
- Do not expose arbitrary backend configuration to the browser beyond public keys/origins. Preserve preview/hosted-test production-denial guards when making installation configurable.

### Reviews and approvals

- Upload publishes a new immutable version, not a notification to everyone. An explicit **Request review** action records recipients and sends notification for that exact current version. Uploaders can correct a draft version before requesting review; no separate binary upload store is needed.
- Each requested review round has a nonempty snapshot of selected, assigned CLIENT reviewers; default selection is all currently assigned clients. No clients means “reviewers not configured,” never automatic approval.
- The version's latest decision per required reviewer determines its round: any current changes request = Changes requested; otherwise missing required decisions = Awaiting review; otherwise all approved = Approved. Non-required/historical decisions remain visible but do not satisfy the round.
- New version requires a new round and fresh decisions. Membership removal suspends an outstanding obligation; owner must explicitly replace/remove that required reviewer with an audit entry. Removed users immediately lose access. Completed delivery snapshots are never recomputed from today's memberships.
- Unresolved current-version pins block an Approved aggregate, even if all required reviewers approved. Do not erase their decisions; show “feedback remains open.” No override in the first release. Resolve/reopen/decision/publication must use consistent locking; owner/designer resolution permissions stay unchanged.
- Existing pre-upgrade decisions remain history. Do not retroactively invent required reviewers or claim final approval; show “legacy individual decisions — review round not configured.”

### Completion and delivery

- Owner explicitly completes a project when every non-removed deliverable's current version has a qualifying Approved round. Empty projects cannot complete. Initially, every visible asset is a deliverable; selective deliverable lists are deferred.
- Completion atomically freezes the asset/version/reviewer/outcome manifest. Further uploads, feedback, new decisions and review-round changes require explicit owner reopening. Existing archive is a separate organizational/read-only control; it is not completion.
- Reopening records actor/reason/time, retains previous completion snapshots and requires new completion evaluation. It must not mutate historical approvals or delivered files.
- Delivery downloads reauthorize current access; no permanent public originals, secret tokens in exports or export grants to unrelated users. An approval summary is a product record, not a legal e-signature or proof of copyright ownership.
- First release provides individually downloadable approved originals plus a printable summary and machine-readable manifest. ZIP generation is optional later and gated by runtime measurements.

### Storage and communication

- Existing READY originals are retained; archive never deletes bytes. First release adds accounting/recovery/cleanup, not automatic hard deletion. New limits block new reservations, never retroactively erase files or history.
- Email is a notification, not authority. Commit core data and durable notification intent together; a failed email must never undo the core action. Reauthorize recipients before sending and before opening links.
- Supabase Auth email handles identity/recovery; application invitations/review events use one configurable server-side mail transport and durable outbox. No in-memory queue or unnecessary external queue service.

### Material decisions requiring confirmation before implementation

1. **Before Phase 1:** accept the verified-email/fresh invitation-proof policy and its transition for auto-confirmed existing users; identify the buyer's sender domain/SMTP setup. Changing only the Dashboard switch will break the existing signup contract and is insufficient.
2. **Before RR-015/RR-016:** confirm required-reviewer snapshots, unresolved-pin blocking and frozen completion semantics above. These intentionally change customer behavior.
3. **Before RR-019 or RR-021:** confirm packaging limits and deletion/retention policy only if those later tasks are selected. They do not block the first release.

Routine defaults are already chosen: UTC storage; browser-local display with timezone labels; optional date-only project due date; optional short description; owner-only rename; structured safe logs; no destructive migration rollback. Ask only if inspection shows a materially incompatible requirement.

## 4. Dependency-ordered phases and task specifications

All new paths/model names below are **proposed**, not existing repository features. Every task must update the status ledger with actual commands, environment class and evidence. Automated tests listed are targets, not claims of passing tests. Owner approval is required separately for external writes, mail sending, migrations and deployment; a task plan is not that approval.

### Phase 0 — Buyer foundation and verification baseline

#### RR-001 — Portable, safe buyer configuration

- **Type / priority / effort:** Improvement + documentation correction / P0 / M. **Dependencies/config:** none; buyer-controlled origin, separate development/staging Supabase project, CA and private bucket; Vercel is the supported initial production host.
- **Current/evidence:** `src/lib/config/deployment.ts` fixes origin/backend identity; `.env.example` combines local DB examples with hosted Auth/Storage; `src/features/reviewer-demo/config.ts` and `scripts/reviewer-demo/seed-existing.ts` are owner-specific; `docs/RELEASE.md` has stale migration counts; `scripts/check-database.ts` bypasses shared CA options.
- **Problem/outcome:** buyers cannot rely on the original owner's environment. Produce one authoritative fresh-install path with explicit local-fixture versus full hosted-development modes.
- **Scope/modules:** configurable canonical/runtime origin and explicit protected production backend identity; consistent DB/Auth project validation for hosted modes; reuse `database-connection.ts` in probes; accurate README/runbook/env/SQL comments. Default public reviewer mode off on new installations; document guest demo versus optional real-account demo without auto-adopting users. No change to owner demo data; no generalized account-provisioning project or Docker migration.
- **Data compatibility:** no intended table change. Preserve current installation via explicit configuration migration instructions; never remove production/test denial checks or fall back silently to owner identifiers.
- **Acceptance:** fresh buyer domain appears in metadata/callbacks; missing required config gives a redacted actionable error; copied production URLs are rejected in preview/tests; buyer installation has no owner account requirement and does not advertise unusable demo credentials.
- **Automated/manual:** `tests/environment.test.ts`, `deployment.test.ts`, `analytics.test.ts`, `reviewer-demo.test.ts`; isolated new-project installation using documented inputs, private bucket and verified CA; no credentials in test output.
- **Rollout/rollback:** publish config mapping before release; preserve old deployment until buyer config passes. Roll back code/config together, never disable isolation to restore availability.

#### RR-002 — Reproducible verification harness and redacted diagnostics

- **Type / priority / effort:** Verification + reliability improvement / P0 / M. **Dependencies/config:** RR-001 for hosted runs; local test PostgreSQL, disposable Supabase staging, CI secret store. Local harness inspection can start alongside RR-001.
- **Current/evidence:** `tests/integration/`, `scripts/test-integration.ts`, `scripts/test-browser.mjs`, `src/lib/auth/failure.ts`; Auth has useful references but uploads/sharing/project actions mostly return generic failures. No `.github` CI workflow at baseline.
- **Problem/outcome:** code coverage is not reproducible full-journey assurance, and support cannot correlate many failures.
- **Scope/modules:** inventory safe/unit, local-write and hosted-write commands; extend existing browser harness rather than replace all tests; proposed CI workflow with explicit isolated-target guards and cleanup; shared sanitized correlation events for core mutation failures. Never log raw Prisma errors, URLs, tokens, passwords, comments or mail bodies. No broad telemetry service requirement.
- **Data compatibility:** no business schema change expected; fixtures are synthetic and scoped. Never let CI configure production credentials or invoke existing live demo seeding.
- **Acceptance:** wrong target refuses before any writes; interrupted fixture run can clean only its own tracked resources; one baseline three-role review journey runs in staging; UI error reference maps to a safe operation/stage/code event.
- **Automated/manual:** existing Auth/session/permission/upload/review/share suites; test log redaction and guard refusal; manually trigger a synthetic staging storage failure and locate its reference.
- **Rollout/rollback:** introduce diagnostics without changing success response contracts; disable optional logging sink if broken, retain local safe references. No production fixture execution.

**Phase 0 gate:** clean-install instructions and isolated test prerequisites are usable; local baseline results and at least one authorized staging journey are recorded separately. If staging is unavailable, status is implemented-unverified, not verified. No full release yet.

### Phase 1 — Identity, recovery and access lifecycle

#### RR-003 — Verification-aware signup and trustworthy invite identity

- **Type / priority / effort:** Security contract correction / P0 / L. **Dependencies/config:** RR-001, RR-002; material identity decision above; Supabase SMTP, callback allowlists and explicitly authorized Dashboard changes.
- **Current/evidence:** `src/app/auth/[operation]/route.ts` requires `mailer_autoconfirm`; `src/lib/auth/core.ts` requires an immediate session; `src/lib/auth/user.ts` maps confirmation timestamp to emailVerified; invitation SQL in `20261017001100_invitation_confirmed_identity` trusts that server-supplied flag. Token possession still matters; there is no email-only access bypass established here.
- **Problem/outcome:** auto-confirm does not independently prove mailbox ownership. New users and legacy invitees need an honest verification path without losing existing access.
- **Scope/modules:** pending-verification signup state, safe verification callback/resend, one-use expiry/replay handling, invitation return preservation, fresh proof for legacy auto-confirm accounts. Proposed identity-proof data/helpers only if Supabase server evidence cannot express proof provenance. Keep Google server-validated provider identity; never trust editable metadata as proof. Do not mass-reset confirmations or revoke existing memberships.
- **Data compatibility:** likely additive proof/provenance records and a replacement invitation function in a new migration. Audit existing Auth states read-only first; explicitly preserve public-demo identity/MFA guards and define safe email test recipients. Old confirmations are not backfilled as independently verified.
- **Acceptance:** signup supports confirmation-on without a false failure; unverified/auto-confirm-only identity plus a stolen/forwarded token cannot satisfy strict invite binding; valid fresh proof accepts once; wrong email, expired/replayed proof and unsafe callback fail; previously authorized members retain access.
- **Automated/manual:** update `tests/auth.test.ts`, `google.test.ts`, local identity/sharing integration suites; isolated SMTP capture, valid/expired verification link, fresh and legacy password identities, trusted Google identity and matching invite.
- **Rollout/rollback:** deploy dual-state-compatible code and additive migration before changing Auth setting; record Dashboard state. Fail closed for new acceptance if proof unavailable; roll back with a documented compatible signup policy, never weaken invite proof to recover service.

#### RR-004 — Password recovery

- **Type / priority / effort:** New core feature / P0 / M. **Dependencies/config:** RR-003; Auth SMTP and approved recovery callback origin.
- **Current/evidence:** login/signup in `src/components/auth/auth-form.tsx` and `src/app/auth/` have no reset flow.
- **Problem/outcome:** a password user needs self-service recovery without operator intervention.
- **Scope/modules:** proposed forgot/reset pages and server handlers, Supabase recovery exchange, fresh recovery-session validation, password validation, rate limiting and generic request response to avoid account enumeration. Reuse existing cookies/origin checks; separate recovery intent from Google/signup. No profile settings redesign.
- **Data compatibility:** no table change expected unless a narrowly scoped recovery intent is necessary. Public demo passwords must not become remotely changeable through recovery.
- **Acceptance:** valid recovery updates only intended non-demo identity; expired/replayed link or ordinary session cannot substitute for recovery authority; external redirect denied; request responses do not disclose account existence; success leads safely to login/workspaces.
- **Automated/manual:** proposed recovery unit tests plus session/rate-limit tests; staging inbox capture, expired link, invalid token, unrelated logged-in identity, protected demo account. Never email a real customer during acceptance.
- **Rollout/rollback:** enable after callbacks and SMTP verified; hiding recovery UI does not revoke issued links, so keep validation compatible for their lifetime. Never bypass demo guards.

#### RR-005 — Invitations and explicit access removal

- **Type / priority / effort:** Workflow improvement / P1 / M. **Dependencies/config:** RR-003; actual email delivery added in RR-012.
- **Current/evidence:** `src/lib/data/sharing.ts`, `src/features/sharing/owner-links.tsx`, `src/lib/data/projects.ts` support expiry/revoke/manual replacement and project assignments; accepted revocation does not remove access; workspace role conflicts are rejected.
- **Problem/outcome:** owners must understand whether they revoke a link or remove a person's access.
- **Scope/modules:** explicit invite replacement/resend intent that rotates/revokes prior pending token rather than extending a secret silently; visible expiry/accepted state; dedicated project-access removal, with warning that other project access remains; clear conflicting-role guidance. Keep one workspace role and no OWNER invitations. Workspace-wide member deletion/owner transfer is deferred.
- **Data compatibility:** use existing invite/member data; add replacement relation only if needed for history. Preserve accepted invitation and access history; a resend never restores a removed assignment. Existing read-only shares keep one-day semantics.
- **Acceptance:** old pending link fails after replacement; accepted revoke alone is clearly labeled; access removal immediately denies project endpoints; other assignments survive; duplicate accept cannot reinstate removed access; only owner can mutate.
- **Automated/manual:** sharing/projects integration tests for wrong/expired/revoked links, concurrent accept/remove, role conflict and idempotency; staging owner/client flow. Until RR-012, copy/send remains honestly manual.
- **Rollout/rollback:** additive UI/function changes; avoid bulk membership rewrites. Roll back UI while retaining historical records and denied access; do not restore assignments automatically.

**Phase 1 gate:** verification-on signup, legacy invitation proof, recovery, expiry/replay denial and explicit access removal pass local and authorized staging journeys; demo credential protections remain intact. Manual Auth settings and sender configuration are recorded, never assumed saved.

### Phase 2 — Upload and storage reliability

#### RR-006 — Observable, backlog-aware cleanup

- **Type / priority / effort:** Reliability improvement / P0 / M. **Dependencies/config:** RR-002; host execution budget and authorized scheduler/cron secret.
- **Current/evidence:** `src/features/uploads/cleanup.ts` retains failed deletions for retry; `src/app/api/maintenance/route.ts` schedules five upload rows, `vercel.json` runs daily, prepare route also opportunistically cleans two. Expired PENDING transition is not batch-limited even though returned deletion work is bounded.
- **Problem/outcome:** bursts can outpace cleanup and make maintenance scans unbounded.
- **Scope/modules:** bounded claiming/expiry transitions, safe concurrent worker lease/retries with backoff, queue depth/oldest age/failure counts, configurable bounded drain within host budget; CLI continuation and operational alert threshold. Distinguish READY staging-only from FAILED final/staging deletion. No automatic deletion of READY originals or blind bucket listing/deletion.
- **Data compatibility:** additive job/lease/retry metadata if needed, index-backed scans and versioned migration; existing queued rows remain discoverable. Cleanup must not consume customer upload quota.
- **Acceptance:** seeded backlog larger than batch drains across calls; partial failure remains queued; concurrent workers do not race destructive work; finalized originals and late-ready/cancel races remain safe; unauthorized endpoint cannot initialize clients.
- **Automated/manual:** extend `tests/integration/uploads.test.ts`, deployment/maintenance tests; stage synthetic backlog, injected delete failure and bounded time budget. Inspect counts only, no object secrets in logs.
- **Rollout/rollback:** ship dry-run/metrics first, then bounded worker; disabling scheduler pauses deletion without losing durable jobs. Do not delete queue metadata on rollback.

#### RR-007 — Accurate usage and configurable non-billing limits

- **Type / priority / effort:** New reliability feature / P0 / M. **Dependencies/config:** RR-006; installation-level byte/version/pending limits with documented finite defaults and explicit overrides, not paid plans.
- **Current/evidence:** `src/lib/data/uploads.ts` caps active pending reservations and validates each file; `ReviewerDemoQuota` protects public demo only. Normal workspace aggregate usage has no model/counter.
- **Problem/outcome:** owners/operators need predictable storage usage and race-safe reservation limits.
- **Scope/modules:** committed READY bytes versus reserved PENDING bytes, per-workspace reservation limits, owner usage display and operator reconciliation; atomic reserve/publish/fail/release accounting. Count historical READY versions. Physical Storage cleanup backlog is a separate operational measurement, not falsely reported as user-visible zero bytes. No billing integration.
- **Data compatibility:** additive usage/reservation data; backfill from existing metadata and reconcile before enforcing. Do not count demo JSON assets as uploaded originals. Existing over-limit tenants retain reads/history; block only new reservations and explain remediation.
- **Acceptance:** concurrent reservations cannot exceed limits; retries do not double count; fail/cancel/expiry release once; replaced version still counts; unauthorized tenants cannot read usage; reconciliation detects drift without deleting files.
- **Automated/manual:** upload/identity integration tests, proposed usage concurrency tests; known synthetic workspace totals, over-limit upgrade and stale reservation recovery in staging.
- **Rollout/rollback:** observe/backfill, compare totals, then enforce; feature-disable enforcement if inaccurate while preserving accounting records. Never retroactively purge data.

#### RR-008 — Interrupted uploads and predictable retry

- **Type / priority / effort:** Improvement / P1 / M. **Dependencies/config:** RR-006, RR-007.
- **Current/evidence:** `src/features/uploads/upload-panel.tsx` supports progress/cancel; service distinguishes PENDING/READY/FAILED and late commits; `claimUpload()` uses a processing token/lease but does not reclaim an already-set expired processing token.
- **Problem/outcome:** refresh/disconnection or abandoned processing can leave users unsure whether a file was saved.
- **Scope/modules:** authorized recent-upload status/recovery, lease-expiry recovery rules, clear retry versus restart, idempotent finalize responses, no duplicate asset for ambiguous completion. Proposed upload-status route under existing project uploads convention. No multipart upload protocol, offline sync or cross-device file resume.
- **Data compatibility:** retain immutable READY records and existing keys/expiry; additive indexes/attempt metadata only if justified. Avoid blanket retry of a storage put after an ambiguous commit.
- **Acceptance:** disconnect during prepare/PUT/finalize, reload, cancel/publication race and expired processing lease produce one canonical outcome; no orphan current pointer or deleted READY object; client/unassigned user cannot inspect another upload.
- **Automated/manual:** upload service mocks plus local concurrency tests; browser abort/reload/slow-network staging cases, with Storage failures injected only into tracked fixtures.
- **Rollout/rollback:** retain old status responses during transition; disable recovery UI if necessary, existing cleanup remains authoritative. Never rewrite a READY version to retry it.

**Phase 2 gate:** accounting reconciles, documented limits hold under concurrency, a backlog drains with retry visibility, and interrupted uploads recover without losing original bytes. Confirm runtime measurements on the supported host; do not infer throughput from unit tests.

### Phase 3 — First-project usability and accessible review

#### RR-009 — Invitation-aware onboarding and next actions

- **Type / priority / effort:** Improvement / P1 / M. **Dependencies/config:** RR-003, RR-005, RR-008.
- **Current/evidence:** `src/lib/data/bootstrap.ts` auto-creates personal workspaces; `/app` chooses memberships; project/upload/invite interfaces are separate. Demo users already hide compatibility workspaces via `src/lib/server/workspaces.ts`.
- **Problem/outcome:** a new owner should reach first review quickly; an invitee should not land in an unrelated empty workspace.
- **Scope/modules:** owner checklist linking create/upload/invite/request-review steps; verified invite intent resumes after Auth; lazy/deferred personal-workspace creation for invite-only onboarding; contextual next action on project page. Do not reuse the demo-email exception for real users or delete old empty workspaces automatically.
- **Data compatibility:** existing memberships/workspaces remain; allow legitimate authenticated profile without a personally owned workspace. Adapt bootstrap consumers explicitly, no silent role promotion.
- **Acceptance:** fresh owner reaches first upload; invitee completes exact invited project without forced personal workspace; invalid intent falls safely to chooser; multi-workspace users retain navigation; restart/reload does not duplicate bootstrap data.
- **Automated/manual:** Auth/bootstrap/identity tests and owner/client browser flows; clean and legacy accounts, conflicting invite, no-workspace retry and mobile first-use.
- **Rollout/rollback:** additive onboarding state/optional intent only if necessary; preserve old bootstrap fallback for ordinary ownership. Roll back presentation without deleting user records.

#### RR-010 — Useful project metadata and overview

- **Type / priority / effort:** Improvement / P1 / M. **Dependencies/config:** RR-009; derived review status added after RR-015.
- **Current/evidence:** `Project` contains name/createdAt/archivedAt; `src/lib/data/projects.ts` supports active/archive search and assignment but no rename/description/due date. Existing filters and pagination work in code.
- **Problem/outcome:** agencies need to identify the brief, due date and next step without an external spreadsheet.
- **Scope/modules:** owner-only rename, optional short plain-text description and date-only due date; show current review/feedback state and actionable links when available; keep archive filter; add derived review filters only after the aggregate exists. No task management, calendar, budgets or arbitrary status builder.
- **Data compatibility:** nullable metadata columns; retain names/archives; no invented due dates on backfill. Index only measured/used filters. Store date-only deadlines without timezone shifts.
- **Acceptance:** unauthorized edit denied; empty description/deadline supported; dates render consistently across zones; search/pagination retain filters; archived/completed mutation rules respected; counts reflect only visible projects.
- **Automated/manual:** project validation/action/integration tests and mobile overview with long names, empty brief, overdue date and assigned-only access.
- **Rollout/rollback:** additive fields; rollback code leaves metadata intact. Do not overload archivedAt for review/completion status.

#### RR-011 — Draft recovery, stale state and targeted accessibility

- **Type / priority / effort:** Improvement / P1 / M. **Dependencies/config:** RR-008, RR-009.
- **Current/evidence:** `src/features/comments/review-workspace.tsx` keeps drafts in component state/refs, supports keyboard pin-position sliders and mobile drawer; decision/version controls have retry UI. No persistent drafts or automatic review-state synchronization.
- **Problem/outcome:** navigation/reload should not silently lose feedback; users must notice newer versions and collaboration updates.
- **Scope/modules:** user/workspace/asset/version-scoped session draft recovery with explicit discard and logout cleanup; clear shared-device notice, no tokens in storage; refresh-on-focus/stale banner with draft preservation and bounded lightweight polling only if needed. Test focus, touch, 320px, long threads, zoom and reduced motion. No realtime provider, collaborative cursor or full UX redesign.
- **Data compatibility:** no expected DB migration; transient drafts must never cross users/projects or be auto-submitted to a new version. Do not persist private content beyond documented short session lifetime.
- **Acceptance:** current draft survives reload in the same session; logout/account switch isolates it; newer version leaves old draft recoverable but unsubmitted; keyboard pin flow, drawer Escape/focus and retry work; role/read-only errors are understandable.
- **Automated/manual:** existing comments/coordinates/preview tests plus browser draft/stale/focus tests; mobile touch and keyboard manual checks. Record actual widths/devices rather than claim universal WCAG compliance.
- **Rollout/rollback:** clear/version scoped draft format on incompatible changes; optional persistence can be disabled without affecting server comments. Do not clear unsaved text merely on a failed refresh.

**Phase 3 gate:** fresh Owner and invited Client reach the intended work; metadata is permission-safe; draft/stale/version behavior and keyboard/mobile review pass actual browser checks. Only target the existing design system.

### Phase 4 — Required reviewers and approval foundation

#### RR-015 — Required reviewers and aggregate version approval

- **Type / priority / effort:** New feature / P1 / L, split into checkpoints. **Dependencies/config:** RR-002, RR-005, RR-010, RR-011; confirm approval rules in section 3. No dependency on notification delivery.
- **Current/evidence:** `src/lib/data/reviews.ts` returns latest per-client decisions; `decision-panel.tsx` explicitly labels individual decisions; migration `20261017000800_versions_and_decisions` serializes current-version decisions/publication. No aggregate sign-off exists.
- **Problem/outcome:** an owner needs an unambiguous, explainable approval state without misrepresenting one client's decision as everyone’s sign-off.
- **Scope/modules:** checkpoint A: additive review-round/required-reviewer model, Request review service and status calculation; checkpoint B: reviewer selection, version/project badges and pending/conflict explanation. Current assigned CLIENTs only; snapshots, membership-change auditing and zero-reviewer blocking per section 3. Preserve client-only append-only decisions, version races and open-pin blocking; use one lock order across publish/comment/decision/round operations. No legal signature or owner override.
- **Data compatibility:** new round/reviewer/audit records and necessary restrictive RLS/grants/constraints in new migrations. Preserve old decisions unchanged and label them legacy, not completed rounds. Membership removal must not silently turn pending review into approval.
- **Acceptance:** all selected approve + no open pins = Approved; any changes request wins; missing/suspended reviewer or open pin blocks; zero reviewers never approves; non-required decisions remain visible; new version clears current approval while old history survives; direct forbidden SQL inserts fail as well as API attempts.
- **Automated/manual:** extend review/comment/project integration tests for contradictory decisions, request replay, reviewer removal, reopen-pin race, concurrent publication and legacy migration; staging two-client round and designer denial.
- **Rollout/rollback:** deploy new status as “unconfigured” for legacy data, enable new round creation after compatibility checks. Old code may display decisions but must not silently bypass completion rules; rollback to read-only new-round writes if necessary rather than destructive schema rollback.

**Phase 4 gate:** required-reviewer snapshots, aggregate state, open-pin blocking, legacy compatibility and concurrency tests pass locally and in authorized staging. Confirm the customer-facing approval policy before enabling round creation.

### Phase 5 — Reliable essential notifications

#### RR-012 — Durable mail outbox and invitation delivery

- **Type / priority / effort:** New feature / P1 / L, split into the checkpoints below. **Dependencies/config:** RR-002, RR-003, RR-005, RR-006; configured transactional mail transport/sender domain, controlled test inbox and authorized worker schedule. Reuse the configured sender where possible; no mandatory paid queue.
- **Current/evidence:** `src/features/sharing/owner-links.tsx` explicitly tells owners to copy/send; invitation database stores only a token hash. No mail transport/outbox exists in schema/dependencies.
- **Problem/outcome:** invitations must reach intended recipients without coupling email success to membership actions.
- **Scope/modules:** proposed server-only `src/features/notifications/`, transport adapter and bounded dispatcher using PostgreSQL outbox. Checkpoint A: durable intent/lease/backoff/idempotency tests. Checkpoint B: invitation send/replacement state and failure UI. Mail is sent after the core transaction commits; no browser direct transport access. Manual copy remains available.
- **Data compatibility:** additive outbox and delivery-attempt metadata, private grants/RLS and bounded retention. A hash cannot recover an invitation token: persist the minimum encrypted delivery secret with a separate operator-configured server encryption key, short TTL and deletion after terminal send/expiry. Never store/log plaintext capability URLs. Design key rotation/retry behavior before migration. No general-purpose secret vault service.
- **Acceptance:** core invitation exists despite SMTP failure; pending/failed/delivered state is honest; expired/revoked/replaced job does not send; leased concurrent workers do not intentionally duplicate sends; provider timeout ambiguity uses provider idempotency if available and is documented—do not promise exactly-once external delivery. Recipients and project authorization are rechecked at dispatch.
- **Automated/manual:** proposed outbox/transport tests with fake mail, sharing integration race tests; staging inbox only, timeout/retry/key-rotation/duplicate enqueue and expiry cases; no full link in logs/analytics.
- **Rollout/rollback:** deploy encryption config/outbox disabled, migrate, verify, enable worker; email-off falls back to manual sharing and leaves core actions usable. Keep encrypted pending jobs readable until drained/expired; never discard keys before that.

#### RR-013 — Explicit review request and event notifications

- **Type / priority / effort:** New feature / P1 / M. **Dependencies/config:** RR-012 and RR-015 for the required-reviewer/round contract. The approved round service is reused without a parallel notification-side approval model.
- **Current/evidence:** upload publication changes current version immediately; `src/lib/data/activity.ts` records events but does not deliver mail; decisions/comments already have stable IDs.
- **Problem/outcome:** clients need a clear request to review a specific version; collaborators need actionable updates without spam or private-content leaks.
- **Scope/modules:** Request review action for owner/assigned designer; notify selected required clients for the exact round/version. Notify authorized collaborators of new client feedback/replies and relevant reviewer decisions; suppress self-notifications and deduplicate by source event/recipient/type. Plain minimal emails link to authenticated routes; no full comment body/private image by default. Essential-event preferences: per-user email toggle, invitation/account mail excluded from optional mute. Scheduled reminders/digests deferred.
- **Data compatibility:** outbox source-event references and minimal user preference records if needed. Existing events are not mass-emailed on migration. Re-requesting an unchanged active round must not duplicate obligations or burst sends.
- **Acceptance:** upload alone does not trigger misleading “please approve”; request-review targets correct version/recipients; removed member receives no queued notification; email failures do not undo comments/decisions/rounds; links return to exact authorized work after Auth.
- **Automated/manual:** activity/comments/reviews integration and proposed notification recipient/dedupe tests; staging client inbox, opt-out, revoked access between queue/send and new-version race.
- **Rollout/rollback:** enable event types separately after invitation transport; pause notifications without losing committed business state; preserve round records on rollback.

**Phase 5 gate:** durable invitation delivery and review-event notifications pass recipient, deduplication, retry and SMTP-failure tests in controlled inboxes. No real recipient mail is sent as a test. Reminders are not a release dependency.

### Phase 6 — Completion and final delivery

#### RR-016 — Explicit completion and reopening

- **Type / priority / effort:** New feature / P1 / M. **Dependencies/config:** RR-015; approval/completion decision confirmation.
- **Current/evidence:** `Project.archivedAt` is the only project lifecycle timestamp; archive preserves data but is not a client-approved completion. Mutation paths are in `src/lib/data/{uploads,comments,reviews,projects,sharing}.ts` and SQL policies/functions.
- **Problem/outcome:** distinguish work in progress from a stable final outcome with a traceable reopen path.
- **Scope/modules:** owner-only complete/reopen with reason and audit; atomic immutable completion manifest of all current visible deliverables and qualifying review rounds. Enforce completed-project write restriction across application and DB boundaries, including uploads/finalization, comments/resolution, decisions and round changes. Access revocation and share revocation remain possible; invitations/new assignments require reopening. Archive stays independent. No automatic completion after the first approval.
- **Data compatibility:** additive completion/reopen records and project lifecycle pointer; current projects remain open, archives stay archived. Completion snapshots retain references and actor/reviewer names without relying on today's assignment list.
- **Acceptance:** empty/unconfigured/conflicting/open-feedback project cannot complete; only owner can complete/reopen; concurrent publication/decision/remove cannot produce a mixed-version manifest; pending upload cannot finalize after completion; reopening preserves old manifest; archived project must be restored before lifecycle mutation.
- **Automated/manual:** project/upload/review/comment integration tests and direct RLS checks; staging complete→download→reopen→new revision→fresh review. Test old application path attempts against new DB rules.
- **Rollout/rollback:** feature-gate completion until all writers understand state; add DB enforcement before enabling UI; rollback keeps completed projects read only and manifests intact. No mass backfill of “completed” status.

#### RR-017 — Approved-original download and delivery manifest

- **Type / priority / effort:** Core workflow feature / P1 / M. **Dependencies/config:** RR-016, RR-007.
- **Current/evidence:** private `/app/[workspaceId]/projects/[projectId]/assets/[assetId]/file` can sign an original for 60 seconds; UI primarily renders transformed previews. No approved delivery listing/manifest.
- **Problem/outcome:** customer can retrieve the actual approved bytes rather than screenshot a preview or guess the final version.
- **Scope/modules:** completion delivery page/list, per-file download, immutable manifest with version/checksum/MIME/size and approval summary references; clear distinction between current draft and completed delivery. Reuse authorized signing with safe attachment names/headers; no user-supplied object keys, permanent URLs or originals in JSON. No ZIP yet. Document that originals retain uploaded metadata and are not scrubbed preview files.
- **Data compatibility:** reuse completion snapshot and existing contentHash/objectKey; no historical-file rewrite. Missing Storage bytes produce actionable failure, never replacement with a different version.
- **Acceptance:** downloaded bytes match approved original checksum; all roles need current project access; removed/foreign users cannot list/sign; signed URLs expire and are not stored in exported manifest; old completion remains distinguishable after reopening; safe Unicode/long filename behavior.
- **Automated/manual:** storage service tests, delivery authorization/manifest tests and browser download of JPG/PNG/WebP; check original dimensions/EXIF orientation versus preview without changing pin geometry.
- **Rollout/rollback:** publish downloads only when manifest resolves; UI rollback leaves current files and completion history intact. An already issued signed URL remains valid for its bounded lifetime, as documented.

#### RR-018 — Approval summary export

- **Type / priority / effort:** Core workflow feature / P1 / S. **Dependencies/config:** RR-017.
- **Current/evidence:** `decision-panel.tsx` shows reviewer decisions, but no printable completion summary/export endpoint exists.
- **Problem/outcome:** agency/client can retain a clear final decision record outside the app.
- **Scope/modules:** authenticated printable HTML summary and JSON manifest from the frozen completion; title, snapshot time, asset/version/hash, required reviewer outcomes, notes within intended recipient permissions, completion/reopen provenance and UTC/local labels. Browser Print to PDF is the default; no headless PDF dependency or invented legal signature.
- **Data compatibility:** no required new table beyond completion snapshot; do not expose emails, internal keys, private drafts or bearer tokens by default. Escape all user text.
- **Acceptance:** summary matches snapshot despite later assignment/profile/current-version changes; exact version/decision dates present; unauthorized export fails; long notes print legibly; no credential/signed URL in HTML or JSON.
- **Automated/manual:** snapshot/export escaping and authorization tests; browser print preview on desktop/mobile with multi-asset/multi-client fixture and reopened project.
- **Rollout/rollback:** read-only export route and content version field; previous exports are immutable external copies. Disable export UI if formatting fails; never mutate approval records to fix presentation.

**Phase 6 gate:** complete, download exact approved originals, export accurate printable/JSON summary, reopen and review a new version. All mutation barriers and race cases pass. ZIP is not required.

### Phase 7 — Release and restoration evidence

#### RR-020 — Clean-install, role journeys, restore and release dossier

- **Type / priority / effort:** Verification + documentation / P0 release gate / M. **Dependencies/config:** RR-001–RR-013, RR-015–RR-018; optional tasks excluded. Isolated local test DB, disposable staging Supabase/Storage/Auth, controlled mailbox, encrypted backup location and explicit operator permission for test-environment writes.
- **Current/evidence:** local suites, `scripts/test-browser.mjs`, `scripts/rehearse-migrations.ts`, `docs/{RUNBOOK,RELEASE}.md`, `DEMO_SETUP.md` exist; docs do not establish a current backup restoration or new-release browser acceptance.
- **Problem/outcome:** a buyer receives a tested installation and recovery path, not only a passing unit suite.
- **Scope/modules:** finish existing critical browser journeys and CI; update setup/config/operations/demo docs for actual release; rehearse additive migrations from baseline and clean install; backup database/Auth/config and Storage originals, restore into a different isolated target and verify hashes/RLS/identities. No automatic production migration/deploy, no source repository backup containing secrets.
- **Data compatibility:** validate every new migration with legacy records and a fresh DB; no reset of an existing user environment. Synthetic fixture ownership recorded; restore scripts cannot accept owner production target silently.
- **Acceptance:** Owner creates/invites; Designer uploads/revises; Client verifies/accesses/comments/requests changes/approves; final package minimum download/summary works. Cross-tenant/project denial, no OWNER escalation, expired/revoked share/invite, accepted access removal, upload/approval/complete races and demo isolation pass. Full restore preserves Auth access, exact original bytes and approval snapshots. All commands/results/env/commit recorded; manual checks list actual viewport/device and limitations.
- **Automated/manual:** relevant unit/integration suites, lint, TypeScript, Prisma validation, build; new and baseline staging E2E, clean buyer origin install, SMTP failures, scheduler retries, original/summary downloads and restored-project access. Confirm production-preview/test separation and no secrets in logs/export/analytics.
- **Rollout/rollback:** owner receives ordered config→backup→migration→compatible code→verification checklist and rollback constraints. Do not roll old mutating code across new completion/security rules. If a gate fails, do not label release verified; record blocking evidence and leave deployment untouched.

**Phase 7 gate:** all first-release tasks verified in the ledger, clean buyer install and isolated restore accepted, known limitations documented, operator approves any later production release separately. Local success alone never closes this gate.

### Later enhancements — selected separately after the first release

#### RR-014 — Previous-feedback checklist (later enhancement)

- **Type / priority / effort:** New feature / P2 / M. **Dependencies/config:** RR-011, RR-015; not a blocker for first release.
- **Current/evidence:** comments belong to one version in `src/lib/data/comments.ts`; previous versions are read only and V2 does not inherit V1 pins.
- **Problem/outcome:** designers need to explain which old feedback a revision addresses without rewriting history.
- **Scope/modules:** proposed immutable addressed-in-version references plus concise designer note; show previous feedback checklist next to new revision; keep original pin/version and client wording. No automatic resolution migration, AI interpretation or pin-coordinate copying across different artwork.
- **Data compatibility:** additive source-thread/target-version relation constrained to same asset/project/tenant; creator/actor snapshots. Preserve deleted/hidden-source tombstone if later deletion is enabled.
- **Acceptance:** link only authorized same-asset historical root thread to a newer version; retry does not duplicate; original discussion remains intact; client can inspect claimed fix without it counting as approval; unauthorized cross-scope IDs fail.
- **Automated/manual:** local comments/reviews RLS tests and staging V1-to-V2 checklist journey with changed dimensions.
- **Rollout/rollback:** read-only historical compatibility; disabling UI does not erase references. No automatic backfill of addressed claims.

#### RR-019 — Bounded delivery ZIP (later enhancement)

- **Type / priority / effort:** New optional feature / P2 / M. **Dependencies/config:** RR-017, RR-018; material packaging limits decision; measured host memory/time/response limits and private temporary object retention.
- **Current/evidence:** uploads allow 10 MB originals while previews are capped at 3 MiB in `src/features/uploads/preview.ts`; routes use Node runtime and some 60-second budgets. In-memory multi-file response is not established as safe.
- **Problem/outcome:** convenient multi-file handoff without timing out or exhausting the server.
- **Scope/modules:** checkpoint A, measure representative package workload in isolated staging and record ADR. Default to asynchronous bounded package job producing a private artifact with expiry, authenticated download, size/file-count limits and cleanup; only use direct streaming if supported and proven. Assess whether a worker service is necessary before adding dependencies. Individual downloads remain the fallback; no unbounded ZIP in a function response.
- **Data compatibility:** proposed delivery-job metadata, artifact expiry and cleanup integration; keys server-derived, tied to completion ID and owner tenant. Source originals never deleted with an expired package.
- **Acceptance:** documented max package succeeds within measured budget; oversize rejected early; retry/cancel/revoked access/expired artifact safe; package contains only manifest versions with safe names; no original signed URLs embedded.
- **Automated/manual:** job/storage failure tests, ZIP integrity/path traversal and checksum tests; staged timeout/large-package measurement and artifact cleanup. No blanket performance claim.
- **Rollout/rollback:** opt-in after metrics; disable new generation while honoring/expiring safe existing artifacts. Retain individual downloads throughout.

#### RR-021 — Safe owner-initiated asset removal and eventual purge

- **Type / priority / effort:** Optional feature / P2 / L. **Dependencies/config:** RR-006, RR-007, RR-016, RR-020; owner-approved retention/grace period and backup policy. Not required for first release if retention/storage limits are explicit.
- **Current/evidence:** `src/lib/data/projects.ts` offers archive, not hard delete; READY originals are retained; asset/current-version/history and completion references need preservation.
- **Problem/outcome:** reclaim storage deliberately without destroying signed-off evidence or leaking revoked objects.
- **Scope/modules:** owner-only soft removal, impact preview, restore during grace period, privileged durable purge only when no retained completion/legal-retention reference; revoke affected capabilities; reconcile bytes only after actual object deletion; audit actor and tombstone. No bucket-wide delete, cascade-first SQL purge or automatic archive expiry.
- **Data compatibility:** additive tombstone/purge records, restrictive access filters, protected completion references. Decide retained artifacts/history before writing migration. Existing assets remain visible; do not backfill removal based on archive.
- **Acceptance:** unrelated tenant/files survive; repeated delete/restore/purge is idempotent; retained approved source cannot purge; failed Storage delete stays queued/accounted; signing races and outstanding short URLs documented; soft restore recovers references within policy.
- **Automated/manual:** direct RLS and storage-lifecycle integration tests including partial failures, completion references, current-pointer consistency and race cases; isolated backup/restore drill before enabling purge.
- **Rollout/rollback:** soft removal first, delayed purge disabled until acceptance; turn purge off immediately on inconsistency; irreversible byte deletion requires a verified backup and separate operator authorization. No destructive down migration.

**Later-enhancement gate:** each optional task has its own authorization, tests and migration/runtime evidence; it cannot reopen or weaken an accepted core security contract. Optional scope is not part of the first-release phase gates.

## Implementation module map

These are likely touchpoints, not authorization to edit all files in a task. New paths are explicitly proposed; use current routing conventions after inspecting the installed Next.js documentation.

| Task   | Existing modules to inspect/reuse                                                                                                           | Proposed additions, only if required                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| RR-001 | `src/lib/config/`, `.env.example`, `README.md`, `docs/RELEASE.md`, `docs/RUNBOOK.md`, `scripts/check-database.ts`, `src/app/layout.tsx`     | Validated install configuration helper inside `src/lib/config/`                                                          |
| RR-002 | `scripts/test-browser.mjs`, `scripts/test-integration.ts`, `src/lib/auth/failure.ts`, mutation failure handlers                             | `.github/workflows/verify.yml`, `src/lib/server/diagnostics.ts`                                                          |
| RR-003 | `src/lib/auth/`, `src/app/auth/[operation]/route.ts`, `src/app/auth/callback/route.ts`, `src/components/auth/auth-form.tsx`, invitation SQL | `src/app/auth/verify/route.ts`, `src/app/verify-email/page.tsx`, additive proof migration if needed                      |
| RR-004 | Auth cookie/origin/rate-limit helpers and form styles                                                                                       | `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`, dedicated recovery server handlers                |
| RR-005 | `src/lib/data/sharing.ts`, `src/lib/data/projects.ts`, `src/features/sharing/owner-links.tsx`, project invitation route                     | Access-removal UI/service within current project modules; new migration only for justified history metadata              |
| RR-006 | `src/features/uploads/cleanup.ts`, `src/features/maintenance/handler.ts`, maintenance route, `scripts/cleanup-uploads.ts`, `vercel.json`    | Lease/retry migration and operator queue-status command                                                                  |
| RR-007 | `src/lib/data/uploads.ts`, upload service/cleanup, Prisma schema, project/workspace server services                                         | `src/lib/data/usage.ts`, owner usage panel, additive accounting migration                                                |
| RR-008 | `src/features/uploads/{upload-panel.tsx,service.ts}`, `src/lib/data/uploads.ts`, existing uploads route                                     | Authorized status operation in the existing uploads route convention                                                     |
| RR-009 | `src/lib/data/{bootstrap,onboarding}.ts`, `src/lib/server/workspaces.ts`, `/app` and project pages, invitation acceptance                   | First-project checklist within existing project UI                                                                       |
| RR-010 | `prisma/schema.prisma`, `src/lib/data/projects.ts`, project forms/actions/validation, directory page                                        | Additive project-metadata migration; contextual summary component                                                        |
| RR-011 | `src/features/comments/review-workspace.tsx`, reviews controls/decision panel, `src/app/globals.css`, logout flow                           | Scoped draft helper and focused browser cases                                                                            |
| RR-015 | `src/lib/data/reviews.ts`, comments/uploads/project writers, review UI, SQL role policies/triggers                                          | `src/features/reviews/status.ts`, review-round service/model/migration                                                   |
| RR-012 | Sharing services/routes/UI, maintenance dispatch boundary, Auth SMTP configuration docs                                                     | `src/features/notifications/`, private outbox/migration, transport adapter/dispatcher                                    |
| RR-013 | Review round service, comments/reviews/activity writers, version controls                                                                   | Notification event/recipient policy and preference controls within notification feature                                  |
| RR-016 | Project/upload/comment/review/sharing services and SQL mutation constraints                                                                 | `src/lib/data/completion.ts`, completion/reopen actions, snapshot migration                                              |
| RR-017 | Existing private file route, Storage signing, project page, completion service                                                              | `src/app/app/[workspaceId]/projects/[projectId]/delivery/page.tsx` and authorized delivery data/manifest handler         |
| RR-018 | Delivery page/service, completion snapshot                                                                                                  | Printable summary and manifest response under the same authorized delivery route                                         |
| RR-020 | Existing tests/scripts, setup/release/demo docs, all new migrations                                                                         | Release evidence record in the status ledger; restore tooling only if existing tools cannot cover the verified procedure |
| RR-014 | Comments/reviews services/UI and RLS                                                                                                        | Addressed-thread reference migration and checklist component                                                             |
| RR-019 | Delivery/Storage/maintenance services                                                                                                       | `src/features/delivery/` bounded package job, private artifact metadata/worker                                           |
| RR-021 | Asset/version relations, upload cleanup/accounting, completion/share services                                                               | Tombstone/purge lifecycle migration and owner impact/restore UI                                                          |

## 5. Execution order, dependencies and release boundaries

Suggested sequence:

1. RR-001 → RR-002.
2. RR-003 → RR-004 and RR-005.
3. RR-006 → RR-007 → RR-008.
4. RR-009 → RR-010 → RR-011.
5. RR-015 checkpoint A (data/service) → checkpoint B (UI/status); then RR-012 checkpoint A (outbox) → checkpoint B (invitation delivery) → RR-013 (review notifications). Do not invent a temporary notification-side approval model.
6. RR-016 → RR-017 → RR-018.
7. RR-020 closes release evidence. Tests and staging checks occur within every task, not deferred to RR-020.

**First release:** RR-001–RR-013, RR-015–RR-018, RR-020. ZIP is not the minimum delivery contract. A controlled internal pilot may test earlier phase gates but must not be marketed as the completed release.

**Later:** RR-014, RR-019, RR-021. Keep these not started until selected; do not mark them blocked merely because intentionally deferred.

| Evaluated suggestion                          | Decision and reason                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduled reminders/digests                   | Defer until essential notifications have measured delivery and opt-out behavior. Manual Request review is enough initially.                                                                                                                                                         |
| Comment edit/delete                           | Defer editable text controls. Keep append-only comments/replies and existing resolution for accountability. Later require author-only time-bounded edit history/tombstones, explicit owner moderation and completed-project restrictions; never silently rewrite approval evidence. |
| General workspace member removal/role changes | Defer beyond explicit project removal. One workspace role is intentional; owner transfer and cross-project role conversion require separate policy.                                                                                                                                 |
| Verified guest review                         | Defer. Requires scoped write identity, expiry, attribution and abuse protection; not equivalent to the current read-only share.                                                                                                                                                     |
| Overlay/pixel diff                            | Useful static-design differentiation after reliable approval/delivery; existing side-by-side comparison stays.                                                                                                                                                                      |
| Agency branding/templates                     | Later source-product value; first make origins/config portable. No per-tenant theme engine.                                                                                                                                                                                         |
| Bulk upload                                   | Later convenience after usage/partial-failure accounting; no first-release dependency.                                                                                                                                                                                              |
| PDF                                           | Later format expansion; page coordinates, conversion limits and version comparison need separate design.                                                                                                                                                                            |
| Video/Figma integrations                      | Defer; they materially expand processing, permissions and external-service maintenance.                                                                                                                                                                                             |
| Billing/plans/platform admin                  | Out of the source/self-hosted first release. Reassess only if intentionally operating a hosted SaaS.                                                                                                                                                                                |
| Broad realtime rewrite                        | Reject for this release. Focus refresh/stale handling and notifications address the immediate problem.                                                                                                                                                                              |

## 6. Implementation-agent prompt template

```text
Implement Review Room roadmap task(s): <RR-IDs>.

1. Read AGENTS.md, docs/PRODUCT-ROADMAP.md and docs/IMPLEMENTATION-STATUS.md.
   Inspect git status/diff, relevant current routes/services/schema/migrations/tests,
   and installed Next.js docs before code edits. Preserve unrelated work.
2. Confirm task dependencies, phase gate and material decisions/configuration.
   A roadmap task is not permission to write to production, send real emails,
   provision Auth users, deploy, commit or push. Use isolated fixtures only when
   explicitly authorized. If a dependency is missing, do independent safe work
   and report the precise block; do not invent a substitute role/security model.
3. Briefly state current code evidence, exact task scope and acceptance checks.
   Implement only selected IDs, using existing architecture/components.
   Label proposed paths/models concretely. Do not refactor unrelated areas,
   add unnecessary dependencies, or edit applied migrations.
4. Protect server-side authorization, RLS, tenant boundaries, private storage,
   immutable versions, public-demo guards and old-data compatibility. Document
   any new migration, config/manual setting and rollout/rollback constraints.
5. Run relevant focused automated tests and manual checks. Distinguish unit,
   local database, staged browser and deployed checks. Do not run fixture-writing
   scripts against production. Never log secrets or real private content.
6. Update IMPLEMENTATION-STATUS with honest status, commands/results, actual
   target class, commit/working-tree context, manual evidence and remaining gaps.
   Code or test-file presence alone = implemented-unverified, not verified.
   Close a phase gate only when its required evidence exists.
7. Summarize changed files, user behavior, validation, compatibility/risks and
   remaining manual setup. Do not commit/push/deploy; give a commit message only
   if requested. Stop after selected tasks; do not start later scope implicitly.
```
