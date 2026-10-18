# Review Room decisions

## Scope and architecture

- One Next.js App Router application and repository. Frontend and server responsibilities stay separate; Supabase Auth, private Storage and Prisma/PostgreSQL serve the implemented review workflow. See [architecture](ARCHITECTURE.md) for the current request paths.
- English interface; warm neutral workspace, restrained sage accent, image-first review canvas. Public sample artwork uses six owner-supplied WebP images across three fictional concepts.
- Project list, desktop asset review and responsive mobile comment drawer.
- Private workspaces persist real project data. The public demo uses isolated guest records and fictional sample artwork.

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
- READY storage objects must be immutable. Upload permission must not allow overwriting a finalized object.
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
