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
