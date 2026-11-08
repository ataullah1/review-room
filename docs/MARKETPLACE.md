# Review Room — marketplace handoff

Prepared 7 November 2026. This is listing copy and a submission checklist, not a claim that a marketplace reviewer has approved the current source. Official seller checklist: https://vibe96.com/sell. Read the current seller agreement before accepting support/update obligations or setting a price.

## Listing copy

**Title:** Review Room — Visual Feedback & Client Approval

**Short description:** Review static designs with pinned feedback, version history and client approvals. Built for freelancers, studios and creative teams.

**Description:** Review Room keeps design conversations attached to the work. Owners organize projects and assign designers and clients. Designers upload immutable image revisions; clients pin comments, inspect comparisons and request changes or approve the current work. Required-reviewer rounds make sign-off explicit. A completed project preserves the exact approved originals and a version-specific delivery record, with controlled reopening when work resumes.

The source includes a responsive public homepage, an isolated signup-free walkthrough and real authenticated workspaces. Private Storage, transaction-scoped RLS, server authorization and durable usage limits separate customer work. This is self-hosted source code, not a managed subscription or a billing platform.

**Audience:** freelancers and small agencies reviewing brand identities, packaging, editorial artwork and other static visual deliverables with clients.

**Source features:**

- Email/password and optional Google Auth, verification-aware onboarding, password recovery and cookie sessions.
- OWNER / DESIGNER / CLIENT memberships; assigned-project visibility and explicit project access removal.
- JPG/PNG/static WebP originals, private image access, pinned comments/replies and version comparison.
- Immutable previous-feedback revision notes; a note is not a client approval.
- Required-client rounds, changes requests, unresolved-feedback blocking, completion/reopening history.
- Approved-original downloads, printable approval summary and JSON delivery manifest.
- Project brief/deadline, activity/unread position, draft recovery and upload retry/status.
- Expiring/revocable read-only shares and email-bound invitations; manual link delivery works without app mail.
- Optional durable notification transport, configured separately from Supabase Auth SMTP.
- Owner soft removal with an impact preview and 30-day restore; original bytes and approved deliveries remain retained.

**Conditional features — disclose rather than advertise as universally enabled:** Google needs buyer OAuth configuration; Auth mail needs SMTP. App notifications default OFF until sender/transport configuration. ZIP generation defaults OFF until isolated hosted workload checks and separate private bucket configuration (20 originals / 100 MiB maximum; provider limits can be lower). Permanent purge is unavailable. Public reviewer fixtures are seller-backend-specific; buyer installations do not adopt those identities.

**Not included:** billing/subscriptions, PDF/video review, Figma integration, legal electronic signatures, native mobile apps, anonymous writes to real customer projects, unrestricted ZIP packaging or storage reclamation by soft removal.

## Technical details

| Item                      | Current source                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| App                       | Next.js 16.4.2 App Router, React 19.3.1, TypeScript 6                                                   |
| UI                        | Tailwind 4, CSS Modules, Lucide, source-owned components                                                |
| Auth / storage            | Supabase Auth + @supabase/ssr; private Supabase Storage                                                 |
| Database                  | PostgreSQL, Prisma 7.10.1, pg adapter, versioned `app` schema                                           |
| Roles                     | OWNER, DESIGNER, CLIENT; no separate platform-admin role                                                |
| Source counts             | 16 `page.tsx` files, 26 route-handler files, 28 migrations, 31 application tables with RLS              |
| Runtime                   | Node 22.x (minimum 22.18), pnpm 11.21.0                                                                 |
| Supported production host | Vercel; Git import and CLI deployment methods documented                                                |
| Setup                     | `HowToSetup.md`; secrets stay out of the source archive                                                 |
| Background work           | Bounded maintenance cron, durable cleanup/mail/package records; no paid queue dependency                |
| External costs            | Buyer-owned Supabase, Vercel and optional email provider; usage/plan dependent, not bundled in purchase |

Two deployment **methods** are documented on Vercel. Do not describe generic VPS/Docker signup as supported: the trusted-IP rule intentionally rejects that production topology. If the marketplace requires two distinct hosting platforms rather than two methods, clarify this scope with the reviewer before submission; do not claim an unimplemented platform.

Vercel Hobby is limited to personal/non-commercial use under its published terms; buyers operating commercially must choose an appropriate plan: https://vercel.com/docs/plans/hobby. No hosting purchase or plan upgrade has been performed.

## Reviewer entry and media

- Live URL: https://rreviewroom.vercel.app
- Real multi-role login: https://rreviewroom.vercel.app/login
- Signup-free walkthrough: https://rreviewroom.vercel.app/demo
- Repository: https://github.com/ataullah1/review-room
- Intentional public credentials are shown on the live login page and documented in `DEMO_SETUP.md`. They are limited sample accounts, never admin/service credentials.

`pnpm marketplace:capture` writes five **1920 × 1080 PNGs** to ignored `.local/release/media/` using the real local production UI with intercepted fictional guest-demo responses. Captures do not contain real customer data and do not prove the latest authenticated hosted workflows. The runner also exercises homepage hover/focus interactions, designer reply/resolve, client decisions and a 320px no-overflow check.

| File                        | Caption                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `01-landing.png`            | Product overview with an interactive visual review preview  |
| `02-pinned-feedback.png`    | Version-bound image pin, client feedback and designer reply |
| `03-version-comparison.png` | Side-by-side immutable sample revisions                     |
| `04-client-review.png`      | Client review and decision on a fictional sample design     |
| `05-designer-workspace.png` | Designer walkthrough with a second creative concept         |

Source artwork redistribution was confirmed by the owner on 7 November 2026. Font/upstream notices are retained. The application remains under the existing MIT `LICENSE`; no agreement was accepted or relicensing performed. Review how the marketplace's standard license applies before signing.

## Build the buyer archive

```sh
pnpm release:notices
pnpm exec prettier --write THIRD_PARTY_NOTICES.md
pnpm release:package
```

Packaging needs Python 3 locally, not in production. For version 1.0.2 the output is `.local/vibe96/review-room-1.0.2/review-room-1.0.2-source.zip` and `source-manifest.json` with per-file hashes/archive checksum. It captures **current uncommitted files**, excludes Git history, actual environments, `.local`, keys/certificates, generated Prisma/client/build output and dependencies. It refuses known local secret values, server-key signatures, private keys and symlinks. This is not a complete Git-history secret audit; prefer the clean archive over uploading the existing `.git` history without a separate review.

The separate media directory is not embedded in the source ZIP; upload its five PNGs to the listing media fields. No commit/push, deployment, provisioning or marketplace upload is done by the packaging command. Regenerate after source changes so archive, live demo and submitted version match.

## Release gates — do not mark complete from local code checks

| Gate                          | Evidence / next action                                                                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buyer docs and source package | Prepared locally; setup/runtime/deployment limitations are explicit                                                                                                                             |
| Assets/notices                | Owner artwork permission recorded; upstream/font notices retained                                                                                                                               |
| Media                         | Five correctly sized PNGs captured locally; provenance recorded                                                                                                                                 |
| Dependency audit              | Patched fast-uri 3.1.9 in lockfile; final audit receipt in local release folder                                                                                                                 |
| Current public demo           | Real OWNER/DESIGNER/CLIENT sign-in/out and assigned project/image/history visibility passed; public GET smoke 17/17 passed                                                                      |
| New live release              | **Pending:** Vercel dashboard still showed commit `92f2827` (20 October); current source's new schema is absent live                                                                            |
| Production migrations         | **Pending:** last inventory had 14 applied; source now has 26. Coordinate 015–026 and matching code; do not deploy code first or migrate old invitation writers in isolation                    |
| Hosted latest-role journey    | **Pending after matching release:** upload, feedback, required approvals, complete/reopen and approved-original delivery                                                                        |
| Mail                          | Resend transport/sender and encryption key saved as Production-only Vercel Secrets on 8 November; MAIL_ENABLED=false. Supabase SMTP and controlled inbox delivery remain pending. No email sent |
| Recovery                      | Encrypted DB/Auth/Storage export exists locally; full isolated restore remains unverified                                                                                                       |
| ZIP                           | OFF until maximum-size hosted measurement/private-bucket acceptance; not a minimum release blocker if disclosed                                                                                 |
| Seller submission             | Owner selects price/license/support obligations, uploads reviewed archive/media and accepts the agreement; no automated submission                                                              |

Do not claim marketplace audit score, verified security, email inbox placement, complete restore, maximum ZIP performance or approval of this release without the corresponding evidence. No customer/revenue/testimonial claims are provided here.

## Handoff update — 8 November 2026

- Sender selected by owner: `Review Room <reviews@answerdesk.bhorsa.com>`. Supplied Sending-access Resend key was retained only in ignored private configuration and the authorized Vercel Production project, never this document/archive. Resend denied domain-list API permission as expected for a sending-only key; it is not a domain-verification or inbox-delivery receipt.
- Vercel UI confirmed five `MAIL_*` variables plus `DELIVERY_ZIP_ENABLED` and `PRODUCTION_SUPABASE_PROJECT_REF` saved as **Secret / Production only**. `MAIL_ENABLED` and ZIP remain false. Vercel explicitly requires a new deployment for changes to take effect; none was triggered.
- Read-only live Auth settings: email and Google enabled, **Confirm email still OFF**. Keep the old running application's compatibility until coordinated migration/code release; switch to the verification-aware confirmation policy only with that release and working SMTP.
- Build, TypeScript, lint and formatting passed. Focused configuration/diagnostic/demo unit checks: 40 passed across four files. Latest production dependency audit reports 0 low/moderate/high/critical findings after the fast-uri patch; this is a point-in-time advisory result, not a security certification. Local validation ran under Node 26.7; supported production target is Node 22.x and the hosting build remains a separate gate.
- Removed only the accidentally staged pnpm cache index from the Git index (bytes retained); added `.pnpm-store` ignores. All application source staging was preserved; no commit/push performed.

### Exact operator release sequence

1. Finish Auth SMTP with the selected verified sender and a controlled-inbox check; SMTP is separate from the saved application-mail API variables. Keep confirmation compatible with the old running code until the coordinated release.
2. Review the prepared source and migrations 015–026. In a planned release window, take a current backup/recovery point, apply reviewed production migrations through the existing session/direct URL, then publish the matching source. Do not run local fixture/seed/reset scripts against production. The owner controls commit/push; this preparation does neither.
3. Change Confirm email to ON for the new verification-aware flow only after matching code/schema and SMTP are in place. Verify signup confirmation, recovery and an invitation with controlled identities; do not mass-reset existing accounts.
4. Validate latest-source role workflow on isolated synthetic content before enabling app mail. Saved `MAIL_ENABLED=false` can be enabled deliberately after the controlled provider/inbox test; ZIP stays OFF pending its own measurement.
5. Regenerate the clean source ZIP/media if source changed, ensure the live demo matches, then upload to Vibe96. Seller chooses price and accepts the current agreement; no automated acceptance/submission.

Suggested owner commit message: `feat: complete review workflows and prepare marketplace release`.

### Sender verification

The Resend dashboard showed `answerdesk.bhorsa.com` as **Verified** on 8 November. This confirms the selected domain status, not delivery/inbox placement. Supabase Auth SMTP was inspected and is OFF; its password/configuration save remains an operator credential handoff. Production application mail variables are saved but still disabled and require a matching deployment before use.

## Controlled acceptance update — 8 November 2026

- Owner reports Auth SMTP saved. Actual application transport check was accepted by Resend and receipt in the owner's controlled inbox was confirmed. No signup/recovery callback acceptance is claimed; those wait for the new code/schema release. Mail stays OFF meanwhile.
- Local restore succeeded for app/Auth/Storage SQL plus all 13 original files, with recovered migration/version metadata and restricted-role checks. Temporary copies were removed. A hosted Supabase/provider restore remains unverified; do not mark that broader gate complete from this local result.
- Owner is preparing the matching source commit. Production migration and deployment have not run; do not push/deploy the new application before coordinating the pending migrations. Marketplace submission remains explicitly outside this continuation's scope.
