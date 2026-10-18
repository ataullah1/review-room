# Review Room — Visual Review and Client Approval

Independent concept project. Draft for portfolio use after the release checklist passes; not a commissioned client engagement. Do not invent customers, testimonials, revenue, usage metrics or performance results.

**Short description:** An image review workspace with pinned feedback, version comparison and client approvals.

**Live application:** https://rreviewroom.vercel.app

**Interactive demo:** https://rreviewroom.vercel.app/demo — the route must be available after the pending release; it returned 404 on the older deployment inspected on 18 October 2026.

**Repository:** https://github.com/ataullah1/review-room

## Case-study draft

Creative review becomes difficult when feedback, image versions and approval decisions are scattered across messages. Review Room explores a focused alternative: place a comment on an image detail, discuss it in a thread, compare an immutable revision, and record each assigned client's decision on that specific version.

My role covers the product interface and full-stack implementation, developed with AI-assisted tooling. The interface uses an English review workflow with an image canvas, normalized pins, threaded replies, a mobile feedback drawer and explicit current/historical version controls. Original fictional demo artwork illustrates the workflow without exposing private client work.

The application uses Next.js/React/TypeScript, Supabase Auth and private Storage, and Prisma/PostgreSQL. Email/password and Google OAuth use server-verified identities and cookie-based sessions. An owner can see all projects in their workspace; designers and clients see assigned projects. Server authorization is paired with PostgreSQL RLS and non-bypass request roles. Private image requests recheck access; the browser-facing Data API has no app-table grants.

Pins store ratios within the displayed image instead of screen pixels, so resizing and zooming can map feedback back to the same detail. New versions have separate comments and decisions; a previous approval does not become approval of a revision. Client decisions are individual version decisions, not a fabricated universal project sign-off. Upload validation decodes actual bytes, rejects invalid/animated/oversized images, preserves immutable originals and serves bounded, metadata-free previews to the review UI. New portrait uploads record EXIF-oriented geometry.

Invitations are email-bound and project-scoped. Anonymous shares expose a fixed image version and read-only feedback through expiring, revocable capabilities. Tokens are exchanged out of URL fragments into path-scoped HttpOnly cookies. A separate 24-hour guest demo allows Designer/Client view switching within isolated sample data, with durable quotas and confirmed reset; it cannot upload, invite or access real workspaces. Project activity and independent per-user unread markers complete the review loop.

The verification work includes unit and local PostgreSQL permission/concurrency tests, headless browser review journeys, responsive viewport checks and an empty-database migration rehearsal. Release configuration adds production/Preview isolation, same-origin fonts, indexing exclusions and authenticated bounded cleanup. These checks are evidence of the behaviors exercised; they are not a security certification or a load benchmark.

**Limits to state honestly:** no physical-device test or completed final-domain Google consent was performed by the agent; the prepared release still needs Dashboard variables/CA, Auth URLs and a new deployment. No production throughput, backup restoration, cron execution, paid customer outcome or email-delivery claim is established. Preview images are generated per request, so server decode/Storage cost still needs hosted measurement. Branding/logo/favicon work is deferred.

## 60–90 second walkthrough storyboard

| Time   | Screen/action                                     | Suggested narration                                                                                        |
| ------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 0–10s  | Landing → Try demo                                | “Review Room keeps image feedback, revisions and client decisions in one place.”                           |
| 10–25s | Sample design → pin → thread/reply                | “Feedback stays attached to the detail it describes, with a conversation beside it.”                       |
| 25–40s | Version selector → side-by-side comparison        | “Each revision keeps its own discussion. Previous approval does not silently carry forward.”               |
| 40–55s | Switch demo Client view → request changes/approve | “Assigned clients can leave a decision on the current version. This demo switch affects sample data only.” |
| 55–70s | Mobile drawer / read-only share                   | “The same review works on smaller screens, while shared links stay read only and version scoped.”          |
| 70–85s | Reset confirmation → overview                     | “Visitors can explore their own temporary demo without changing anyone else's work.”                       |

Record only after these controls work on the final deployment. Use the original fictional sample assets, hide developer tooling and never show secret keys, bearer links, private comments or real account information. No video has been recorded by this task.

## Screenshot checklist

1. Public landing at desktop width with Try demo.
2. Demo canvas with one visible pin and its thread.
3. Version comparison with two visibly different originals.
4. Client decision state on the current sample version.
5. Mobile feedback view at 390px.
6. Optional architecture figure explaining Auth → server authorization → request-role RLS → private file access.

Use truthful captions such as “Independent concept”, “Original sample artwork” and “Individual client decisions”. Avoid “enterprise ready”, “fully secure”, made-up conversion numbers or implying the sample designs came from paying clients. Existing development screenshots are verification artifacts, not a finished marketing asset pack.
