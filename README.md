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
```

## Structure

- `src/app`: routes, layouts and global styles.
- `src/components`: prototype screens and source-owned UI primitives.
- `src/lib/server`: verified-user data access; `src/lib/data` enforces server permissions and transaction-scoped RLS.
- `prisma`: app-schema migrations and guarded, deterministic local fixtures.
- `supabase`: versioned access-hardening and private bucket SQL, separate from Prisma.
- `tests`: configuration safety and real PostgreSQL integration checks.

Visit `/signup` or `/login` for real Auth and `/app` for your workspaces. The private app supports projects, validated image uploads, version-bound comments/replies, immutable version history, side-by-side comparison and individual assigned-client review decisions. Historical versions are read only; new versions require fresh client review. Owners can also create email-bound project invitations and expiring read-only version links. The general Activity feed remains a later step. Google Fonts has system fallbacks; sample artwork is local CSS. Font hosting must be revisited before private client content ships.

- [Roadmap](docs/ROADMAP.md)
- [Progress and verification](docs/PROGRESS.md)
- [Scope, roles and routes](docs/DECISIONS.md)
- [Setup and operations](docs/RUNBOOK.md)
