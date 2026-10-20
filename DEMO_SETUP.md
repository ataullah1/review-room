# Reviewer demo

Review Room uses three real, manually created Supabase Auth accounts on the existing backend. No separate demo deployment or backend is required.

| Persona       | Workspace role | Public email      | Public password |
| ------------- | -------------- | ----------------- | --------------- |
| Creator Demo  | OWNER          | demo@admin.com    | 0123456789      |
| Designer Demo | DESIGNER       | demo@designer.com | 0123456789      |
| Client Demo   | CLIENT         | demo@client.com   | 0123456789      |

Only these intentionally public credentials appear on `/login`. Try fills the existing login form; the user submits normal authentication. Private admin keys and database credentials stay server-side.

Login opens `/app`, the existing workspace chooser. Select **Olive Café — Demo Studio**, then a project. Existing empty personal workspaces are retained for compatibility with older deployed login code, but hidden from demo users in the new chooser.

## Projects and assets

- **Olive Café — Brand Identity:** Designer and Client assigned. Two designs, each with V1/V2; pinned client feedback, designer replies, resolved historical threads, current approval and an unresolved menu change request.
- **Forma — Packaging Study:** Designer and Client assigned. A packaging design with V1/V2.
- **Studio Notes — Editorial Direction:** Creator only. An editorial cover with V1/V2, demonstrating unassigned-project restrictions.

Creator sees all three projects. Designer and Client each see two. The shared workspace ID is `93031605-ee3f-4e44-9ebb-22091c6da628`. Eight image versions use original Olive artwork and existing owner-supplied demo images. See `public/reviewer-demo/LICENSE.md` and `public/demo/LICENSE.md` for asset notes. `pnpm demo:assets` regenerates only the four original Olive images.

## Setup and updates

All three confirmed Auth users must already exist with the passwords above. The seed script never creates Auth users or changes passwords. It refuses accounts with unrelated memberships or non-empty personal workspaces.

Use the existing ignored `.env`: `DIRECT_URL`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `SUPABASE_STORAGE_BUCKET=review-room-private`. Database TLS needs the full CA PEM in `SUPABASE_DB_CA_CERT`, or the public certificate file at ignored `.local/supabase-prod-ca-2021.crt`. Storage must remain private. No additional Vercel demo variables are required. Optional `REVIEWER_DEMO_ENABLED=false` hides the public credential cards.

```sh
# Read-only dependency and account audit
pnpm demo:seed-existing --check

# Explicitly seed/update only the owner-authorized demo accounts
REVIEWER_DEMO_EXISTING_CONFIRM=pwzwrknnzkdagfcjnqkr pnpm demo:seed-existing
```

The command checks backend identity, accounts/passwords, empty compatibility workspaces, Auth schema, migration history, private bucket and artwork. It saves a demo-only audit snapshot under ignored `.local/`, applies the protection migration if missing, verifies immutable Storage object hashes and installs missing records transactionally. Existing feedback, approvals, versions and current selections are preserved during normal re-runs and baseline expansion. Conflicts fail instead of overwriting data. It never commits, deploys or changes Dashboard settings.

Supabase must already use the app's normal Auth setup: Authentication → Hooks → Before User Created → `app.before_user_created`; Authentication → URL Configuration must use the deployed Site URL and `/auth/callback`. If immediate ordinary signup is offered, Authentication → Sign In / Providers → Email → Confirm email must be OFF. These settings are manual; seeding does not change them.

## Permissions and limits

Existing Membership, ProjectMember, server authorization and RLS remain authoritative. Additional restrictive policies isolate the public accounts from unrelated tenants, including accidentally granted memberships. The registry identifies protected accounts; it does not introduce new roles.

Public users can navigate the real app and perform permitted review/upload actions. Workspace/project structural changes, invitations and sharing are read only. Credential/email/phone changes, account deletion and MFA enrollment are blocked to protect subsequent reviewers. Browser roles cannot edit registry/quota data or gain administrative privileges.

Durable quotas allow 100 successful mutations and 4 upload reservations per account per UTC day, subject to existing role permissions. The workspace is capped at 18 image versions, 200 comments/replies and 100 review decisions. Existing upload size/format/pixel limits remain. Failed transactions roll back quota consumption. Review changes are shared until operator restoration; do not enter private information.

## Restore

Normal seeding preserves reviewer work. To explicitly reset only the shared sample content, temporarily take the demo out of public use and run:

```sh
REVIEWER_DEMO_EXISTING_CONFIRM=pwzwrknnzkdagfcjnqkr \
REVIEWER_DEMO_RESTORE_CONFIRM=93031605-ee3f-4e44-9ebb-22091c6da628 \
pnpm demo:seed-existing --restore
```

Restore verifies account/workspace ownership, removes only projects/content and verified extra Storage objects under the exact demo prefixes, clears demo quotas and reinstalls the baseline. Auth users, profiles, workspace, registry and credential guards remain. Other tenants are untouched. Never use a broad database reset or Storage deletion.

For public password rotation, an operator temporarily enables `allowAuthChanges` for one registered identity, changes that password through the Supabase admin API, immediately disables the flag, updates the intentional public credential constant and republishes. Application users cannot enable this flag.

## Verification and publication

`pnpm demo:verify` uses normal hosted sign-in, checks project permissions, feedback authors, V1/V2 images, review entry and logout. It uses an explicit `/app/` return path for compatibility with the old deployed login; the default `/app` redirect is covered by authentication tests. Optional `--exercise-review` writes bounded demo feedback, replies and client decisions and checks persistence after logout/login. It never creates users.

Local integration tests use only the dedicated loopback PostgreSQL test database. They cover incremental/idempotent seeds, original role preservation, empty-workspace compatibility, direct RLS denial, real review actions, durable quotas, Auth/MFA guards and scoped restore. These fixtures do not constitute hosted Auth acceptance.

Source changes must be published by the owner. Until the new redirect is deployed, open the existing live login with `?next=/app/` to reach the workspace chooser. This repository never deploys automatically.
