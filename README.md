# Review Room

An image review workspace for creative teams and clients. Frontend and authorized backend share one Next.js application.

**Current stage:** Step 2 Auth implementation — email/password forms, cookie refresh, real protected workspace pages, server authorization/RLS and durable signup protection. The root page remains a sample prototype. Immediate public signup requires the Dashboard email-confirmation and signup-hook settings documented in the [runbook](docs/RUNBOOK.md).

## Local development

Use Node.js 22.18+, pnpm 11.21.0 and PostgreSQL 18 tools on PATH. The commands below assume the local database URLs from `.env.example`; if `.env` points to hosted Supabase, keep those settings and follow the hosted setup in the runbook instead of running the local fixture seed.

```sh
pnpm install --frozen-lockfile
pnpm db:local:start
pnpm db:deploy
pnpm db:seed
pnpm db:check
pnpm dev
```

Open http://localhost:3000. Select a project to view sample image pins and versions. On mobile, **View comments** opens the drawer. UI changes are temporary.

The local database script creates its own cluster on port **55432** and preserves existing `.env` files and other databases. Stop it with `pnpm db:local:stop`. See the [development runbook](docs/RUNBOOK.md) for setup details and the verified Supabase development setup. Run `pnpm supabase:check` for a read-only live configuration check once your own development credentials are configured.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm format:check
pnpm build
# Hosted development configuration, when configured:
pnpm supabase:check
# Optional: requires a separate non-production Supabase test project and pnpm dev (macOS Chrome):
pnpm test:browser
```

## Structure

- `src/app`: routes, layouts and global styles.
- `src/components`: prototype screens and source-owned UI primitives.
- `src/lib/server`: verified-user data access; `src/lib/data` enforces server permissions and transaction-scoped RLS.
- `prisma`: app-schema migrations and guarded, deterministic local fixtures.
- `supabase`: versioned access-hardening and private bucket SQL, separate from Prisma.
- `tests`: configuration safety and real PostgreSQL integration checks.

Visit `/signup` or `/login` for real Auth and `/app` for your workspaces. The private app supports projects, validated image uploads, version-bound comments/replies, immutable version history, side-by-side comparison and individual assigned-client review decisions. Private UI images use bounded, metadata-free WebP previews while originals remain immutable. Historical versions are read only; new versions require fresh client review. Owners can also create email-bound project invitations and expiring read-only version links. Project activity shows uploads, feedback, decisions and accepted invitations, with per-user unread state and refresh on focus. Visit `/demo` without login for three original sample designs, version comparison, pinned comments and Designer/Client views. Each signed guest session has isolated data, a 24-hour expiry, reset confirmation and durable write quotas; demo uploads and invitations are disabled. Run `pnpm demo:cleanup` to remove expired demo records. DM Sans and Manrope are self-hosted with system fallbacks; demo artwork is original local SVG.

- [Roadmap](docs/ROADMAP.md)
- [Progress and verification](docs/PROGRESS.md)
- [Scope, roles and routes](docs/DECISIONS.md)
- [Setup and operations](docs/RUNBOOK.md)

## Release

Production URL: https://rreviewroom.vercel.app. The existing Supabase project now serves production; do not run hosted fixture tests against it. See [release setup and manual Dashboard steps](docs/RELEASE.md), [portfolio draft](docs/PORTFOLIO.md) and [progress](docs/PROGRESS.md).

`pnpm release:smoke` sends anonymous GETs only to check the deployed release. `pnpm db:rehearse` applies all migrations to a new temporary **local** database and removes only that database. Neither command seeds or migrates production. Set the documented Production environment variables, including the database CA and cron secret, before pushing to the connected production branch. Saving local `.env` does not update Vercel.
