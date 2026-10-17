# Review Room decisions

## Scope and architecture

- One Next.js App Router application and repository. Frontend and server responsibilities stay separate. PostgreSQL, Prisma and private Supabase Storage are configured in Step 1; Supabase Auth application flows follow in Step 2.
- Step 0 includes only the minimum Next.js setup needed for static screens. Step 1 remains incomplete until database, migrations, seed, environment setup and quality configuration are verified.
- English interface; warm neutral workspace, restrained sage accent, image-first review canvas. Sample artwork is original CSS typography and shapes, with no external client assets.
- Initial screens: project list, desktop asset review and responsive mobile comment drawer.
- All current people, projects, comments, counts and artwork are explicitly sample data. Prototype filters, version selection, zoom, thread selection and resolve toggles only affect local component state. No saved approval, upload, authentication or invitations.

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

- Create the Activity model and transactional event writer when the first domain event needs it. Step 8 adds the feed and unread markers.
- READY storage objects must be immutable. Upload permission must not allow overwriting a finalized object; verify this before implementing uploads.
- Version publish order follows successful serialized finalization, not upload initiation. A retry must not republish an older finalized version as current.
- Model upload sessions, guest demo sessions and per-project/user read markers when those steps begin.
- Before member management ships, define owner transfer, last-owner protection, removal and immediate permission revocation. Already-issued signed URLs remain usable until expiry.
- Demo requires session creation throttling, write caps, resource ceilings and scheduled scoped cleanup, beyond individual comment quotas.

## Routes

- `/`: static prototype entry; future public landing page.
- Prototype project/review navigation currently lives in local UI state. It does not claim real authenticated routes.
- Future public: `/login`, `/auth/callback`, `/demo`, `/share/[token]`, `/invite/[token]`.
- Future signed in: `/app/[workspaceId]/projects`, `/app/[workspaceId]/projects/[projectId]`, `/app/[workspaceId]/projects/[projectId]/assets/[assetId]`.

## Backlog

MVP: verified identity, assigned projects, private image upload, persistent normalized pins and threads, immutable versions, per-client decisions, invitations, expiring read-only shares, activity, isolated demo, verification and deployment preparation.

Later: video/PDF, AI summaries, billing, realtime presence, email delivery, visual diffs, custom domains and mobile applications.

## Open verification

The 30–60 second comprehension check needs a human walkthrough. Real-device and keyboard/browser checks must be recorded when performed. No automatic publication, production changes or external communications.

## Step 1 foundation

- User confirmed the local prototype renders and requested the next step. Browser/real-phone verification remains recorded separately.
- Dedicated local PostgreSQL 18 cluster on port 55432; development and integration-test databases are separate from existing system databases. Hosted development Supabase migrations and private storage provisioning were completed and verified on 17 October 2026.
- Prisma 7.10.1 CLI/client/adapter are pinned together; TypeScript 6.0.3 is selected because the current typescript-eslint parser rejects TypeScript 7. ESLint 10 is supported by Next.js 16.4.2's documented configuration, although bundled third-party plugins have older peer ranges. Lint and production build pass with these versions.
- Prisma owns only `app`; initial tables are private with RLS enabled and PUBLIC schema/table grants revoked. Browser grants and storage setup are separately versioned in `supabase/`. Authorization is not implemented yet.
- Project assignment has composite foreign keys to both the project and workspace membership, preventing a forged workspace association at the database level. This is a structural invariant, not a replacement for route/mutation permission tests in Step 2.
- Tailwind v4 utilities and shadcn aliases/composition primitives are configured while retaining existing styles. The current custom reset is preserved to avoid a visual redesign.
- Seed uses fixed IDs/timestamps and local-only guards. Fake Auth accounts are never inserted into Supabase internal tables.
