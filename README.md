# Review Room

An image review workspace for creative teams and clients. Frontend and authorized backend share one Next.js application.

**Current stage:** static UI plus a local PostgreSQL/Prisma foundation. Projects, artwork and comments shown in the UI are sample data. Private pages are not connected to the database until authentication and authorization ship in Step 2.

## Local development

Use Node.js 22.18+, pnpm 11.21.0 and PostgreSQL 18 tools on PATH.

```sh
pnpm install --frozen-lockfile
pnpm db:local:start
pnpm db:deploy
pnpm db:seed
pnpm db:check
pnpm dev
```

Open http://localhost:3000. Select a project to view sample image pins and versions. On mobile, **View comments** opens the drawer. UI changes are temporary.

The local database script creates its own cluster on port **55432** and preserves existing `.env` files and other databases. Stop it with `pnpm db:local:stop`. See the [development runbook](docs/RUNBOOK.md) for setup details and the pending Supabase private bucket configuration.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm format:check
pnpm build
```

## Structure

- `src/app`: routes, layouts and global styles.
- `src/components`: prototype screens and source-owned UI primitives.
- `src/lib/server`: server-only database access; authorization arrives in Step 2.
- `prisma`: app-schema migrations and guarded, deterministic local fixtures.
- `supabase`: versioned access-hardening and private bucket SQL, separate from Prisma.
- `tests`: configuration safety and real PostgreSQL integration checks.

No real upload, persistent comment, sign-in or approval is implemented yet. Google Fonts has system fallbacks; sample artwork is local CSS. Font hosting must be revisited before private client content ships.

- [Roadmap](docs/ROADMAP.md)
- [Progress and verification](docs/PROGRESS.md)
- [Scope, roles and routes](docs/DECISIONS.md)
- [Setup and operations](docs/RUNBOOK.md)
