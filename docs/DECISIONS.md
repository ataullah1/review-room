# Review Room decisions

## Scope and architecture

- One Next.js App Router application and repository. Frontend and server responsibilities stay separate; Supabase Auth, private Storage and Prisma/PostgreSQL serve the implemented review workflow. See [architecture](ARCHITECTURE.md) for the current request paths.
- English interface; warm neutral workspace, restrained sage accent, image-first review canvas. Sample artwork is original CSS typography and shapes, with no external client assets.
- Initial screens: project list, desktop asset review and responsive mobile comment drawer.
- Private workspaces persist real project data. The public demo uses isolated guest records and original fictional artwork. The unused Step 0 prototype component was removed after the implemented routes replaced it; its earlier behavior remains in Git history.

## Roles

| Action                                   | Owner                | Assigned designer | Assigned client | Share visitor       |
| ---------------------------------------- | -------------------- | ----------------- | --------------- | ------------------- |
| View project                             | All within workspace | Assigned          | Assigned        | Shared version only |
| Create project / assign / invite / share | Yes                  | No                | No              | No                  |
| Upload version                           | Yes                  | Yes               | No              | No                  |
| Comment / reply on current version       | Yes                  | Yes               | Yes             | No                  |
| Resolve / reopen current thread          | Yes                  | Yes               | No              | No                  |
| Decide on current version                | No                   | No                | Yes             | No                  |
| Manage workspace                         | Yes                  | No                | No              | No                  |

Historical versions are read only, including replies and resolve actions. Share links expose only the selected version and its threads. Never trust a role, workspace ID or nested resource ID supplied by the browser without server verification.

## Implementation clarifications

- Activity events are written in the same transaction as their domain change; the feed keeps per-user unread high-water marks.
- READY storage objects must be immutable. Upload permission must not allow overwriting a finalized object; verify this before implementing uploads.
- Version publish order follows successful serialized finalization, not upload initiation. A retry must not republish an older finalized version as current.
- Upload sessions, guest demo sessions and per-project/user read markers have separate persistence and permission rules.
- Before member management ships, define owner transfer, last-owner protection, removal and immediate permission revocation. Already-issued signed URLs remain usable until expiry.
- Demo requires session creation throttling, write caps, resource ceilings and scheduled scoped cleanup, beyond individual comment quotas.

## Routes

- `/`: public landing page; `/login` and `/signup`: Auth entry.
- `/auth/google` and `/auth/callback`: Google/PKCE flow; `/auth/[operation]`: same-origin Auth mutations.
- `/demo`: isolated guest review UI, with session/state handlers below that path.
- `/share` and `/invite`: fragment-token entry. Scoped cookies then authorize `/share/view/[shareId]` and `/invite/accept`; raw tokens are not route segments.
- `/app`: workspace redirect; `/app/[workspaceId]/projects`, `/app/[workspaceId]/projects/[projectId]`, `/app/[workspaceId]/projects/[projectId]/assets/[assetId]`: signed-in project and review routes.

## Backlog

Implemented MVP: verified identity, assigned projects, private image upload, persistent normalized pins and threads, immutable versions, per-client decisions, invitations, expiring read-only shares, activity, isolated demo and deployment configuration.

Later: video/PDF, AI summaries, billing, realtime presence, email delivery, visual diffs, custom domains and mobile applications.

## Open verification

The public release passed 17 anonymous automated checks. The owner reports completing the live release checklist; those reports are separate from agent-run checks. No load benchmark or production restore rehearsal is established. Historical implementation records below describe what was known at each step; references to the old development Supabase project must not be used to authorize current production fixtures. See [progress](PROGRESS.md) for the latest record.

## Step 1 foundation

- User confirmed the local prototype renders and requested the next step. Browser/real-phone verification remains recorded separately.
- Dedicated local PostgreSQL 18 cluster on port 55432; development and integration-test databases are separate from existing system databases. Hosted development Supabase migrations and private storage provisioning were completed and verified on 17 October 2026.
- Prisma 7.10.1 CLI/client/adapter are pinned together; TypeScript 6.0.3 is selected because the current typescript-eslint parser rejects TypeScript 7. ESLint 10 is supported by Next.js 16.4.2's documented configuration, although bundled third-party plugins have older peer ranges. Lint and production build pass with these versions.
- Prisma owns only `app`; initial tables are private with RLS enabled and PUBLIC schema/table grants revoked. Browser grants and storage setup are separately versioned in `supabase/`. Authorization is not implemented yet.
- Project assignment has composite foreign keys to both the project and workspace membership, preventing a forged workspace association at the database level. This is a structural invariant, not a replacement for route/mutation permission tests in Step 2.
- Tailwind v4 utilities and shadcn aliases/composition primitives are configured while retaining existing styles. The current custom reset is preserved to avoid a visual redesign.
- Seed uses fixed IDs/timestamps and local-only guards. Fake Auth accounts are never inserted into Supabase internal tables.

## Step 2 — identity and permission decisions (17 October 2026)

- Explicit user scope overrides the roadmap's original email-verification requirement: email/password signup assumes **Confirm email OFF** and immediately signs in. Supabase Auth still verifies the server-side session identity; this does not establish ownership of the email inbox.
- Use pinned @supabase/ssr and supabase-js, per-request server clients and cookie storage. No browser Auth SDK is needed for the current forms; all Auth writes pass through same-origin server handlers. Session cookies are HttpOnly, SameSite=Lax, and Secure in production.
- Next.js 16 proxy verifies/refreshes with getClaims, forwarding cookies to both request and response. Each data access independently calls getUser against the Auth server. No authorization decision trusts getSession or user-supplied roles. Private responses are not shared-cacheable.
- Verified Auth IDs bootstrap UserProfile, one Workspace with a unique createdById, and OWNER membership in one database transaction. A per-user advisory transaction lock serializes retries across instances. Account creation and application bootstrap span two systems; if bootstrap fails after Auth succeeds, login or Finish workspace setup safely retries it.
- Application operations run inside withUserDatabase: transaction-local non-login/non-owner/NOBYPASSRLS role review_room_user, UTC timezone, and verified subject context. RLS enforces the same workspace/project rules as server helpers, including on queries that accidentally omit a tenant filter. Context is cleared by transaction completion.
- Security-definer membership predicates are limited to fixed, schema-qualified checks with a locked search_path and restricted EXECUTE grants, avoiding recursive policies. Browser roles remain denied direct app schema/Data API access.
- Only application tables/functions/roles are migrated. Supabase auth/storage internals are not migrated or seeded. Step 1 is retained; one additive Step 2 migration is added.
- Signup attempts use PostgreSQL atomic fixed-window counters: 5 per hour and 20 per UTC day. No in-memory counters or additional paid services. The server takes IP only from x-vercel-forwarded-for when VERCEL=1; malformed/missing headers and unsupported production hosts fail closed. Untrusted forwarded-for/real-ip/body IP fields are ignored. Local development uses one shared quota identity, not a client-provided IP.
- Stable server-only SIGNUP_RATE_LIMIT_SECRET HMACs the normalized IP. Only derived hashes, counters and expirations are persisted. No raw IP is stored/logged by this implementation. Provider/platform logging is outside this application limiter. Expired counters/permits are removed on subsequent signup attempts.
- Supabase's own rate limits stay enabled. A one-use, email-bound, five-minute permit plus the free Postgres Before User Created hook prevents calling the provider signup endpoint to bypass the app's durable limiter **once that hook is enabled in Dashboard**. Permits are generated only after consuming quota; the hook has only SELECT/DELETE access to permit rows and never trusts metadata as a role. No request role or browser can mint/consume permits directly.
- Public signup checks live email-provider settings before account creation, so a confirmation-setting mismatch fails without intentionally sending mail or claiming immediate sign-in. Dashboard settings are never claimed changed by code unless actually changed and verified.
