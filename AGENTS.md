<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Reviewer demo environment

- Read `DEMO_SETUP.md` before changing multi-role reviewer setup. Personas map to the existing OWNER, DESIGNER and CLIENT memberships; the registry is not another authorization system.
- `demo:seed-existing` is restricted to the owner-authorized three manually created demo accounts. Verify their empty personal workspaces and exact backend confirmation; do not create Auth users, touch unrelated data, reset broadly or deploy.
- Preserve restrictive demo RLS, structural/credential protections and durable quotas. Verify both application authorization and direct restricted-role reads/writes with the guarded local PostgreSQL tests.
- Only intentionally public demo emails/passwords may reach login cards. Private Auth/admin keys, DB URLs and signing secrets must stay server-side.
- Report local fixture/browser checks separately from real hosted Auth/Storage acceptance. Keep builds, provisioning, deployment and operator restore as separate actions.

## Buyer codebase guide

- Read `HowToSetup.md` for clean installation, supported hosting, Auth configuration and guarded checks. One Next.js App Router application provides UI/server routes; no separate backend process.
- `src/lib/data/` owns transactional domain operations. Every authenticated request uses verified identity, explicit authorization and `withUserDatabase`'s transaction-local `review_room_user` role. Never replace it with owner/BYPASSRLS reads for customer routes.
- `src/features/` contains focused UI/services; `src/lib/auth/` contains cookies, verification/recovery and durable quotas; `src/lib/storage/` issues narrow private capabilities. `prisma/migrations/` is the schema authority; add migrations rather than rewriting released history.
- Current source: 26 migrations / 30 RLS application tables. Optional ZIP is OFF until hosted measurement. Soft removal retains original bytes/approved evidence; no permanent purge worker exists.
- `pnpm build` generates Prisma and builds only. Migrations, demo provisioning, live mail, deployment and marketplace submission are separate operator actions. Never use local fixtures/reset against hosted customer data.
- `pnpm release:package` creates an ignored, secret-screened source ZIP from current files; it does not commit/push or deploy. Keep licenses and `.env.example`; exclude actual environments, keys, private backups, generated clients and caches.
