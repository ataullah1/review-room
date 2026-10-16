# Review Room Progress

## Step status

- [x] Step 0 Scope and screens — user confirmed UI renders and authorized Step 1; remaining manual coverage recorded below
- [ ] Step 1 Repository and foundation — local foundation verified; hosted Supabase private bucket pending
- [ ] Step 2 Identity and permissions
- [ ] Step 3 Projects
- [ ] Step 4 Private upload
- [ ] Step 5 Image comments
- [ ] Step 6 Versions and approval
- [ ] Step 7 Invitation and share links
- [ ] Step 8 Activity
- [ ] Step 9 Isolated demo
- [ ] Step 10 Verification and polish
- [ ] Step 11 Deployment and portfolio

## Current session — 16 October 2026, Step 1

- User accepted the rendered prototype and requested the next step. User explicitly chose local setup because no development Supabase project exists yet.
- Local completion: Prisma 7.10.1 CLI/client/pg adapter; server-only reusable database client; app-only schema; initial versioned migration; deterministic seed; dedicated development/test databases; local cluster lifecycle scripts; environment placeholders and validation; Tailwind v4 utilities/tokens and shadcn composition primitive; ESLint, Prettier and Vitest scripts; setup/runbook documentation.
- Database models: UserProfile, Workspace, Membership, Project, ProjectMember. Composite foreign keys bind assignment to both the project workspace and a real workspace membership. These constraints do not replace Step 2 authorization.
- Fixtures: 2 workspaces, 5 profiles, 5 memberships, 2 projects and 2 explicit project assignments. Includes outsider and unassigned-user fixtures. No Supabase Auth accounts or passwords were created.
- Local cluster: PostgreSQL 18.6 at 127.0.0.1:55432, data under ignored `.local/postgres`; left running for development. Existing system PostgreSQL and existing `.env` files are preserved. `pnpm db:local:stop` stops only the owned cluster.

### Verification performed

- `pnpm install`: succeeded after explicitly allowing Prisma/engines, esbuild and unrs-resolver build scripts in pnpm configuration. Stable Prisma is pinned because npm's latest CLI tag points to a prerelease.
- `pnpm db:validate`: passed.
- `prisma migrate deploy`: initial migration applied successfully to both fresh dedicated development and test databases.
- `pnpm db:seed`: passed; repeated execution retained deterministic fixtures without duplication.
- `pnpm db:check`: connected through the pg adapter and found 2 workspaces.
- `prisma migrate status`: up to date. `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: no difference.
- `supabase/001_application_access.sql`: executed successfully on the owned local database (PUBLIC revokes/RLS path). Supabase's anon/authenticated-role branch is not verified on a hosted project yet.
- `pnpm lint`: passed with zero warnings. TypeScript 7 was rejected by the ESLint parser, so TypeScript was pinned to compatible 6.0.3; current lint/build pass. ESLint 10 works with the documented Next.js configuration, though bundled third-party plugin peer ranges still produce install-time peer warnings.
- `pnpm typecheck`: passed after correcting environment-input and child-process environment types.
- `pnpm test`: 13 passed (configuration and local fixture target safety, including connection-query overrides).
- `pnpm test:integration`: 5 passed against real PostgreSQL (idempotent seed, membership uniqueness, cross-workspace FK rejection, UTC/unassigned fixtures, RLS/PUBLIC schema defaults).
- `pnpm format:check`: passed.
- `pnpm build`: passed.
- Fresh-source reproduction: copied maintained source/configuration without node_modules, .env or generated client to a temporary directory; `pnpm install --frozen-lockfile --offline`, `pnpm typecheck`, and `pnpm build` all passed. This verifies reproduction from the cached dependency store, not a cold internet download. Temporary copy removed after verification.
- Production HTTP smoke on temporary port 3100: HTTP 200 with sample heading, prototype label and shared button rendered. Temporary server stopped afterward.
- `.env`, local cluster data and generated Prisma client are ignored by Git.

### Remaining limits and next task

- Hosted development Supabase project, private bucket and browser-role grants still require account setup; SQL and exact instructions are in RUNBOOK.md. Step 1 remains unchecked until those checks pass. User approved completing the available local work first.
- No authentication, permission-enforcing data access helpers, real upload, persisted comment or approval is implemented. Static UI deliberately does not read private fixtures.
- No browser visual/interaction, real-device or timed 30–60 second comprehension check was performed by the agent. User confirmed the UI opens; that does not establish full interaction or device coverage.
- No push, deployment, production migration or external communication occurred.
- Commit: changes remain local; no commit created.
- Next: create/configure a development-only Supabase project using RUNBOOK.md, verify private bucket/access settings, then implement Step 2 verified identity and authorization. Never put credentials in chat or docs.

## Previous session — Step 0

- Created the static project list, desktop review canvas and mobile comment drawer, original sample artwork, scope/role/route decisions and roadmap/progress documentation.
- Prototype interactions include filters, version selection, pin selection, zoom/fit and temporary resolve toggles. All displayed data is explicitly sample data.
- User confirmed the UI rendered and asked to advance. Broader browser/device checks remain unverified.

## Supabase configuration check — 16 October 2026

- Development project URL, publishable key and server secret key are now configured in ignored `.env`; no values are recorded here.
- Read-only API probes: publishable key HTTP 200, secret-key bucket listing HTTP 200; email sign-in enabled and email verification required.
- Corrected URL encoding of special characters in database passwords, restored transaction/session pooler ports and `schema=app` parameters. Both runtime and migration connections passed read-only PostgreSQL queries afterward.
- Remote `app` schema, Workspace table and Prisma migration table do not exist yet. No remote migrations were executed during this check.
- `review-room-private` bucket does not exist yet. No bucket or remote data was created/changed during this check.
- Step 1 remains pending remote migrations, application access hardening and private bucket provisioning/verification.

## Completion rule

Mark a step complete only after its roadmap acceptance checks pass, recording user-authorized scope adjustments. Record checks not performed. Never put credentials, tokens, signed URLs or private client content in this file.
