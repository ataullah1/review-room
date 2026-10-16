# Review Room Development Roadmap

বাংলা implementation guide এবং English Codex prompts।

# Review Room Development Roadmap

Md Ataullah এর জন্য ধাপে ধাপে implementation guide
প্রস্তুত ১৬ অক্টোবর ২০২৬

## কী বানাবেন
Creative agency ও client এর জন্য একটি image review application। Designer design upload করবে; client ছবির নির্দিষ্ট জায়গায় comment করবে; নতুন version তুলনা করে approve বা changes চাইবে। English product interface এবং প্রস্তুত demo থাকবে, যাতে বিদেশি client সরাসরি ব্যবহার করে কাজ বুঝতে পারেন।

## প্রথম version এর সীমানা
- Image review only: JPG, PNG এবং static WebP।
- Workspace, assigned project access, private upload, pinned comment এবং replies।
- Version history, side by side comparison এবং version অনুযায়ী approval।
- Project invitation, expiring read only review link এবং activity feed।
- Resettable demo, responsive UI, গুরুত্বপূর্ণ tests এবং live deployment।

## এখন বানাবেন না
Video বা PDF annotation, live website capture, unrestricted iframe, AI summary, subscription billing, custom domains, mobile app এবং realtime multiplayer cursor পরের version এর জন্য রাখুন। এগুলো portfolio launch আটকাবে না।

## সময় এবং কাজের নিয়ম
AI সহায়তায় প্রতিদিন ৪ থেকে ৬ ঘণ্টা কাজের ভিত্তিতে ১৮ থেকে ২৫ focused working day পরিকল্পনা করুন। এটি estimate; প্রথমবার invitation, storage বা permission debug করলে সময় বাড়তে পারে। সপ্তাহে ছয় দিন কাজ করলে প্রায় ৩ থেকে ৫ সপ্তাহ। আগের ১৫ থেকে ২১ দিনের rough estimate এর তুলনায় এই পরিকল্পনায় demo এবং security যাচাইয়ের জন্য বেশি জায়গা আছে।

একটি ধাপের acceptance checks পাস না করলে পরের ধাপে যাবেন না। প্রতিটি ধাপ শেষে commit এবং docs/PROGRESS.md update করবেন। এই document এর Markdown copy repository এর docs/ROADMAP.md হিসেবে রাখতে পারবেন।

## প্রথম সফল milestone
Designer A একটি image upload করবে। Project এ assigned Client B login করে ছবিতে feedback দেবে। Refresh এর পরও comment থাকবে; অন্য workspace এর User C ছবিটি বা comment দেখতে পারবে না।

# 1 Technology and Architecture

## স্থির technology নির্বাচন
| অংশ | সিদ্ধান্ত |
| Application | Next.js App Router এবং TypeScript |
| UI | Tailwind CSS, shadcn/ui, Lucide icons |
| Data | Supabase PostgreSQL এবং Prisma |
| Identity | Supabase Auth এবং official SSR integration |
| Files | Supabase Storage private bucket |
| Validation | Zod schemas এবং server validation |
| Motion | Motion শুধু প্রয়োজনীয় transitions এ |
| Tests | Vitest এবং Playwright |
| Hosting | Vercel এবং Supabase |

Repository নতুন হলে শুরুতে current stable compatible versions verify করে exact packageManager ও lockfile commit করুন। প্রতিটি step এ dependency upgrade করবেন না। বিদ্যমান project হলে আগে compatibility দেখুন।

## Request কীভাবে চলবে
Browser UI থেকে Server Action বা Route Handler এ request যাবে। Server প্রথমে trusted auth দিয়ে user যাচাই করবে, তারপর workspace membership ও project permission যাচাই করবে। এরপর Prisma দিয়ে database read বা write করবে। File এর জন্য permission যাচাই করে short lived signed URL বা upload capability দেবে।

## গুরুত্বপূর্ণ architecture সিদ্ধান্ত
Prisma ব্যবহার করলে Supabase Auth user স্বয়ংক্রিয়ভাবে database request এর RLS context হয়ে যায় না। এই version এ application authorization server data access layer এ থাকবে। Application tables এর browser Data API access বন্ধ বা যথাযথ restricted grants/RLS দিয়ে বন্ধ রাখতে হবে। Browser সরাসরি Prisma বা database credential পাবে না।

Storage bucket private থাকবে। Server privileged storage client ব্যবহার করলে application permission check বাধ্যতামূলক। Auth refresh handling framework version অনুযায়ী official guide থেকে করুন; পুরোনো middleware snippet কপি করবেন না।

## Folder এর দায়িত্ব
- app: routes, layouts এবং page composition।
- features: projects, reviews, comments, approvals, invitations।
- lib: auth, db, authorization, storage এবং validation।
- prisma: application schema, migrations এবং development seed।
- supabase: storage policy ও grants এর versioned SQL।
- tests: permissions, integration এবং browser journeys।
- docs: ROADMAP.md, PROGRESS.md, DECISIONS.md, RUNBOOK.md।

# 2 Screens and Interaction Design

## Product এর প্রধান অভিজ্ঞতা
Review page এ image canvas হবে প্রধান জায়গা। বাম দিকে asset/version navigation; ডান দিকে selected comment thread। বড় chart বা metric card দিয়ে মূল কাজ আড়াল করবেন না। Product এর copy English হবে।

| Screen | মূল কাজ |
| Landing | কীভাবে review হয় এবং Try Demo |
| Login and callback | Sign in এবং safe return destination |
| Workspace projects | Assigned project list এবং create project |
| Project detail | Assets, people, activity এবং invite |
| Asset review | Image, pins, threads এবং current version |
| Version comparison | পুরোনো ও নতুন image পাশাপাশি দেখা |
| Read only share | একটি নির্দিষ্ট version দেখা |
| Settings | Workspace name এবং member management |

## Route পরিকল্পনা
Public: /, /login, /auth/callback, /demo, /share/[token]।
Signed in: /app/[workspaceId]/projects এবং /app/[workspaceId]/projects/[projectId]।
Review: /app/[workspaceId]/projects/[projectId]/assets/[assetId]।
Invitation: /invite/[token]। Token opaque হবে; route এ role বা user ID বদলে access পাওয়া যাবে না।

## UI specification
- Light neutral canvas, dark readable text এবং একটি restrained accent colour।
- Empty, loading, uploading, failed এবং permission denied state design করুন।
- Comment pin এ number, selected state ও resolved indicator রাখুন।
- Mobile এ image এবং comment drawer ব্যবহার করুন; desktop layout ছোট করে চাপাবেন না।
- Keyboard দিয়ে comment list ও actions ব্যবহারযোগ্য রাখুন। Selected image position keyboard controls দিয়ে সমন্বয়ের বিকল্প দিন।
- Zoom drag কে comment click হিসেবে ধরবেন না। Pointer gesture threshold নির্ধারণ করুন।
- Reduced motion preference মানুন; animation approval বা comment save আটকাবে না।

## Design প্রস্তুতির acceptance
Static sample data দিয়ে একজন visitor ৩০ থেকে ৬০ সেকেন্ডে upload, comment এবং approval কোথায় বুঝতে পারবেন। AI কে পুরো interface বানানোর আগে project list, review workspace এবং mobile comment drawer এর তিনটি screen তৈরি করতে দিন।

# 3 Data Model and Invariants

## Application entities
| Entity | প্রধান fields এবং relation |
| UserProfile | id equals verified Auth user ID, displayName |
| Workspace | id, name, createdAt |
| Membership | workspaceId, userId, role; unique pair |
| Project | workspaceId, name, archivedAt |
| ProjectMember | projectId, userId; unique pair |
| Asset | projectId, title, currentVersionId |
| AssetVersion | assetId, versionNumber, objectKey, dimensions, creatorId |
| Comment | versionId, authorId, parentId, xRatio, yRatio, body, resolvedAt |
| Approval | versionId, reviewerId, decision, note, createdAt |
| Invitation | projectId, email, role, tokenHash, expiresAt, acceptedAt |
| ShareLink | versionId, tokenHash, expiresAt, revokedAt |
| Activity | projectId, actorId, type, resourceId, createdAt |

## Model rules
- Workspace owner এর Membership role OWNER। অন্য role DESIGNER বা CLIENT। ProjectMember না হলে designer/client project দেখতে পারবে না।
- AssetVersion এ fileSize, mimeType, width, height এবং READY/PENDING/FAILED status রাখুন। READY version ছাড়া currentVersionId সেট করা যাবে না।
- Unique assetId plus versionNumber; duplicate request এর জন্য scoped idempotency key রাখুন।
- Comment coordinates 0 থেকে 1 এর মধ্যে। Replies এ coordinates null; reply parent একই version এর root comment হতে হবে।
- Approval decision APPROVED বা CHANGES_REQUESTED। প্রতি version/reviewer এর latest decision একবার রাখুন এবং Activity তে পরিবর্তনের history রাখুন।
- Owner বা designer approval দিতে পারবে না; assigned CLIENT reviewer দেবে। এক reviewer এর approval পুরো project এর final sign off বোঝাবে না।
- নতুন version এ পুরোনো comment বা approval কপি হবে না। Asset আবার review প্রয়োজন দেখাবে।
- currentVersionId অবশ্যই একই asset এর READY version কে নির্দেশ করবে। Server transaction এ এই invariant যাচাই করুন।
- UTC তে timestamp রাখুন; interface এ user locale অনুযায়ী দেখান।

## Migration ownership
Prisma application table migrations এর দায়িত্ব নেবে। Supabase এর auth/storage internal schema Prisma দিয়ে alter করবেন না। Storage policy ও restricted grants আলাদা versioned SQL এ রাখুন; order RUNBOOK এ লিখুন।

Membership এবং project access query, version list, root comment list ও activity pagination এর জন্য প্রয়োজনীয় indexes দিন। শুধু UI তে record লুকিয়ে tenant isolation হয়েছে ধরে নেবেন না।

# 4 Access and Review Rules

## Role matrix
| কাজ | Owner | Assigned designer | Assigned client | Share visitor |
| Workspace settings and members | Yes | No | No | No |
| Project and asset view | All in workspace | Assigned only | Assigned only | One version |
| Create project and assign people | Yes | No | No | No |
| Upload asset or new version | Yes | Yes | No | No |
| Comment and reply | Yes | Yes | Yes | No |
| Resolve or reopen root thread | Yes | Yes | No | No |
| Approve or request changes | No | No | Current version | No |
| Invite and create share links | Yes | No | No | No |

Unassigned designer এবং client সব project route, mutation এবং file request এ denied হবে। Share visitor comment, upload, approval বা project navigation পাবে না।

## Server helper contracts
requireUser, requireWorkspaceMember, requireProjectAccess এবং requireProjectRole বানান। Nested IDs এর relation যাচাই করুন; শুধু একটি workspaceId দিয়ে unrelated assetId পড়বেন না। HTML UI, Server Action এবং API সব entry point এ একই নিয়ম চলবে।

## Invitation rules
Owner একটি project এর জন্য DESIGNER বা CLIENT invite করতে পারবে। একই workspace এ অন্য role থাকা user এর role silently change করবেন না। Verified matching email ছাড়া invitation accept নয়। Accept transaction idempotent হবে; expired বা consumed token নতুন permission দেবে না। Owner role invite দিয়ে দেওয়া যাবে না।

## Approval rules
Client current READY version এ decision দিতে পারবে। Request এর expectedCurrentVersionId transaction এ মিলবে। এর মধ্যে designer নতুন version publish করলে stale approval reject করে refresh করতে বলুন। Approval record এবং activity event একই database transaction এ লিখুন। Double click এ duplicate event তৈরি হবে না।

## Share rules
Share link একটি immutable version এর জন্য read only capability। Random high entropy token বানিয়ে database এ hash রাখুন। মেয়াদ, revoke এবং rate limit রাখুন। প্রতিটি signed file URL ৬০ সেকেন্ডের মতো ছোট মেয়াদের হবে। Link revoke নতুন access বন্ধ করবে; আগে issued URL তার expiry পর্যন্ত চলতে পারে, downloaded copy ফিরিয়ে নেওয়া যায় না।

# 5 Scope and Repository Setup

## Step 0 Scope and screens
সময় ১ দিন। Dependency নেই।
- এই document repository এর docs/ROADMAP.md এ রাখুন।
- docs/PROGRESS.md এ step, status, completed checks ও next task রাখুন।
- Scope, role matrix এবং decision rules docs/DECISIONS.md এ স্থির করুন।
- তিনটি screen এর static prototype বানান; sample data স্পষ্টভাবে demo হিসেবে চিহ্নিত করুন।
- demo application কে portfolio থেকে আলাদা repository রাখুন।

Done যখন: user flow পরিষ্কার এবং backlog এ MVP ও Later আলাদা। Static UI কে completed backend হিসেবে দেখানো হয়নি।

Codex prompt
Read docs/ROADMAP.md. Complete Step 0 only. Create the product scope, role matrix, route plan, progress tracker and three static UI screens. Use English interface copy. Clearly label sample data. Do not implement auth, uploads or unrelated features. Report design decisions and remaining questions.

## Step 1 Repository and local foundation
সময় ১ দিন। Dependency Step 0।
- Current stable compatible Next.js, TypeScript, Tailwind ও UI packages verify করে pin করুন।
- pnpm packageManager, lockfile, formatting এবং lint configuration রাখুন।
- development database এবং private storage bucket আলাদা করে তৈরি করুন। Production data ব্যবহার নয়।
- Prisma connect করুন; development migrations ও deterministic seed দিন।
- env example এ placeholder দিন। Real values কখনো commit বা log করবেন না।
- test, typecheck, lint ও build script বাস্তবে project অনুযায়ী configure করুন।

Done যখন: fresh checkout থেকে documented setup দিয়ে application চালু হয়; database migration এবং seed চলে; typecheck ও build পাস।

Codex prompt
Complete Step 1 only. Inspect official setup documentation for the selected package versions. Configure the repository, environment placeholders, Prisma database access, migrations, seed and quality scripts. Keep Supabase auth/storage schemas outside Prisma migration ownership. Run the available checks and document exact setup steps. Do not deploy or push.

আপনার review: dependency কেন লাগছে বুঝুন; unnecessary package বাদ দিন। Setup ব্যর্থ থাকলে screen polish নিয়ে এগোবেন না।

# 6 Identity and Permissions

সময় ২ থেকে ৩ দিন। Dependency Step 1।

## কী বানাবেন
- Supabase Auth দিয়ে email/password sign in, sign up এবং sign out। Public sign up এ email verification প্রয়োজন।
- Official SSR setup অনুযায়ী cookies, auth callback এবং session refresh।
- Auth user এর সঙ্গে idempotent UserProfile তৈরি।
- Verified new user এর জন্য একটি workspace তৈরি এবং OWNER membership এক transaction এ। Abuse ঠেকাতে creation cap রাখুন।
- Protected application routes এবং server authorization helper।
- Workspace owner, assigned designer, assigned client এবং outsider এর test fixtures।

## Implementation rules
getSession এর returned user কে একমাত্র authorization proof ধরবেন না। Current official integration অনুযায়ী server verified claims বা user ব্যবহার করুন। UI redirect মূল security boundary নয়; database access এবং mutations এ permission check করুন।

Workspace bootstrap repeat হলে duplicate workspace তৈরি হবে না। Callback return destination শুধু allowed internal path হবে। Secret key বা database URL browser bundle এ যাবে না। Server file private cache ব্যবহার করতে পারলেও user response shared public cache এ রাখবেন না।

## Acceptance checks
- Logged out অবস্থায় private page ও action blocked।
- Forged workspace ID দিয়ে read/write denied।
- Designer workspace settings বদলাতে পারে না।
- Sign out এর পর নতুন authenticated request denied; prior signed file URL এর expiry আলাদা।
- Repeat callback বা bootstrap request duplicate profile/owner membership তৈরি করে না।

## Codex prompt
Complete Step 2 only using the official Supabase SSR guide for our framework version. Implement identity, workspace bootstrap and server authorization helpers. Enforce the roadmap role matrix at data access boundaries. Restrict direct browser access to application tables. Add focused tests for outsider access, repeated bootstrap and rejected role escalation. Do not create a second authentication system or expose privileged keys.

## আপনার শেখার লক্ষ্য
Authentication বলে user কে; authorization বলে user কোন record বা action ব্যবহার করতে পারবে। একটি resource ID পাওয়া permission পাওয়ার সমান নয়। এই পার্থক্য code দেখে ব্যাখ্যা করতে পারলে পরের step এ যান।

# 7 Projects and Upload

## Step 3 Project foundation
সময় ১ দিন। Dependency Step 2।
- Owner project তৈরি করবে; name validation এবং archived state থাকবে।
- ProjectMember দিয়ে designer/client assign করুন। এই ধাপে seeded users দিয়ে পরীক্ষা করা যাবে।
- Assigned project list, detail এবং empty state বানান।
- Server pagination এবং scoped search দিন; archive history মুছবে না।

Done যখন: owner সব workspace project দেখে; অন্য role শুধু assigned project দেখে; অন্য workspace এর ID দিয়ে access ব্যর্থ।

Codex prompt
Complete Step 3 only. Implement project creation, explicit project membership, scoped listing and archive behavior. Use the existing permission helpers. Seed a second workspace and test cross-workspace and unassigned-member access. Keep archive non-destructive.

## Step 4 Private asset upload
সময় ২ দিন। Dependency Step 3।
- JPG/PNG/static WebP; একটি file প্রতি upload; সর্বোচ্চ ১০ MB, ২০ MP এবং প্রতি side ৮১৯২ px। Server এ bytes ও dimensions verify করুন; client validation শুধু early feedback।
- Owner বা assigned designer upload শুরু করতে পারবে। Server generated scoped object key ও short lived upload permission ব্যবহার করুন।
- UI progress, cancel/failure এবং retry state রাখুন। Signed upload flow হলে server processing finalize এর আগে শুধু PENDING record হবে।
- Uploaded bytes decode করে format/dimensions পরীক্ষা; invalid হলে reject ও cleanup। Animation থাকলে reject করুন এবং স্পষ্ট error দিন।
- Immutable AssetVersion তৈরি করুন; READY হলে currentVersionId update করুন। DB transaction এবং storage upload atomic নয়, তাই incomplete file cleanup লিখুন।
- Read access permission যাচাই করে short lived signed download URL দিন।

Done যখন: client upload করতে পারে না; fake extension rejected; oversize image rejected; refresh এ saved image থাকে; failed upload READY নয়। Asset file URL public নয়।

Codex prompt
Complete Step 4 only. Build a private signed-upload and server-finalize flow with authoritative byte/type/dimension validation. Store immutable object keys and PENDING/READY/FAILED state. Add cleanup for failed or abandoned uploads. Do not proxy large image bodies through Server Actions. Verify hosting request limits and keep privileged storage operations server-only behind project permission checks.

# 8 Image Comments

সময় ৩ দিন। Dependency Step 4।

## কী বানাবেন
- Image canvas এ Fit ও সীমিত zoom control।
- ছবির মধ্যে click করলে draft pin এবং comment editor খুলবে।
- Root comment numbered pin হবে; thread sidebar এ reply থাকবে।
- Save এর পর database এর canonical result দেখান। Request failed হলে draft রাখুন এবং retry দিন।
- Owner/designer thread resolve/reopen করতে পারবে; client reply করতে পারবে।
- নিজস্ব comment ছোট grace period এ edit করার মতো বাড়তি নিয়ম এখন দরকার নেই; initial version এ immutable comment body ও reply রাখুন।

## Coordinate calculation
Displayed image content rectangle থেকে xRatio = (pointerX - imageLeft) / imageWidth এবং yRatio = (pointerY - imageTop) / imageHeight। Letterbox, padding বা outer canvas কে image rectangle ধরবেন না। Zoom/pan transform থাকলে inverse coordinate mapping ব্যবহার করুন। Clamp করে 0 থেকে 1 range রাখুন।

Render এর সময় ratio দিয়ে একই image content এর relative position বের করুন। Window resize, phone orientation বা zoom বদলালেও pin এর target বদলাবে না। আলাদা aspect ratio এর নতুন version এ পুরোনো pin project করবেন না।

## Acceptance checks
- চার corner ও centre এ pin দিয়ে resize/zoom এর পর জায়গা মিলিয়ে দেখুন।
- Image এর বাইরের click pin তৈরি করে না; pan drag comment নয়।
- Refresh এর পর thread এবং pin অক্ষত।
- Reply parent অন্য version এর হলে server reject করে।
- Unassigned user direct mutation দিয়েও comment করতে পারে না।
- Comment content plain text হিসেবে render; HTML execute নয়।

## Codex prompt
Complete Step 5 only. Implement version-bound image pins, root threads, replies and resolve/reopen using normalized image coordinates. Handle zoom, letterboxing and drag-versus-click correctly. Persist through the existing authorized server layer. Add focused coordinate tests and a browser flow proving persistence and denied outsider writes. Include an accessible alternative to pointer-only pin placement.

এই ধাপ শেষ হলে প্রথম successful milestone পূরণ হবে। একটি ছোট walkthrough record করুন এবং commit দিন।

# 9 Versions and Approval

সময় ২ দিন। Dependency Step 5।

## Version workflow
- Asset এর নতুন image একটি নতুন immutable version হবে; আগের file replace নয়।
- Version switcher এ number, uploader এবং timestamp দেখান।
- দুটি version পাশাপাশি দেখান; each pane এর নিজস্ব aspect ratio ও Fit control থাকবে।
- Old version এর comments readable থাকবে; editing এবং approval শুধু current version এ।
- Version publish হলে নতুন version review required দেখাবে। পূর্বের approval পুরোনো version এই থাকবে।

## Approval workflow
Assigned CLIENT reviewer Approve বা Request Changes করতে পারবে। Request Changes এ একটি note প্রয়োজন। Owner/designer approval decision দিতে পারবে না। Approval change history Activity তে থাকবে; latest decision reviewer অনুযায়ী দেখান।

Asset.currentVersionId lock বা সমতুল্য transactional compare ব্যবহার করুন। Approval request এ expectedCurrentVersionId থাকবে। Concurrent version publish এবং approval এর মধ্যে একটি consistent ordering থাকবে; stale version কে current approval হিসেবে দেখানো যাবে না।

## Acceptance checks
- Version 1 approved; Version 2 upload হলে Version 2 unreviewed।
- Version 1 pin Version 2 তে চলে যায় না।
- Client পুরোনো tab থেকে approval দিলে refresh instruction পায়।
- Double click বা request retry duplicate decision/activity তৈরি করে না।
- Designer নিজের design approve করতে পারে না।
- দুই reviewer এর decision আলাদা থাকে; UI কে approve করেছে তা দেখায়।

## Codex prompt
Complete Step 6 only. Implement immutable version upload, version-specific threads, side-by-side comparison and assigned-client decisions. Enforce current-version checks transactionally and make retried submissions idempotent. Keep prior decisions in history without carrying them to a new version. Add concurrency tests for an approval racing a new-version publish. Do not claim whole-project sign-off from one reviewer.

এই step এ slider comparison, visual diff algorithm বা automatic change detection যোগ করবেন না। পাশাপাশি comparison যথেষ্ট।

# 10 Sharing and Activity

## Step 7 Invitation and read only sharing
সময় ২ দিন। Dependency Step 6।
- Owner email ও project role দিয়ে invitation link তৈরি করবে। Initial version এ Copy invitation থাকবে; email delivery আলাদা পরের কাজ।
- High entropy token server generate করবে; database এ শুধু hash, expiry ও acceptance state। Default invitation expiry ৭ দিন।
- Verified matching email দিয়ে accept; ProjectMember এবং Membership এক transaction এ upsert। Expired, reused বা conflicting role এ পরিষ্কার message।
- Owner current বা historical version এর read only share link বানাবে। Default expiry ২৪ ঘণ্টা; revoke করা যাবে।
- Share visitor শুধু সেই version এবং comments দেখতে পারবে; write, approve বা private navigation নয়। Token logs, analytics বা third-party script এ যাবে না। Referrer policy এবং noindex দিন।

Done যখন: wrong email rejected; double acceptance safe; revoked link নতুন file URL দিতে পারে না; CLIENT invite থেকে OWNER permission হয় না।

Codex prompt
Complete Step 7 only. Implement copyable project invitation links with verified-email matching and atomic acceptance. Implement version-scoped expiring read-only share capabilities with hashed tokens and revocation. Share access must not authorize writes or navigation to unrelated records. Rate-limit token endpoints, redact tokens from logs and prevent indexing. Test expired, revoked, reused and wrong-email cases.

## Step 8 Activity and in app notifications
সময় ১ দিন। Dependency Step 7।
- Upload ready, comment created, resolved, approval changed এবং invite accepted events রাখুন।
- Activity feed time order এ pagination সহ দেখান। User content বা token event payload তে অকারণে রাখবেন না।
- Unread activity নির্ধারণে project/user lastReadAt রাখুন।
- Initial version এ explicit refresh এবং focus এ refresh যথেষ্ট। Live websocket presence পরে।
- Business write এবং Activity write একই database transaction এ করুন। Retried operation duplicate event করবে না।

Done যখন: নতুন comment বা approval সংশ্লিষ্ট project activity তে আসে, অন্য project এ নয়; reload এর পর unread state consistent।

Codex prompt
Complete Step 8 only. Add a scoped activity feed and per-user last-read marker. Create events transactionally with domain writes and preserve idempotency. Use refresh-on-focus rather than adding a realtime subsystem. Verify no cross-project notification leakage.

# 11 Public Demo

সময় ১ থেকে ২ দিন। Dependency Step 8।

## Demo তে কী দেখাবেন
Landing page এ Try Demo দিলে login বাধা ছাড়াই seeded project খুলবে। তিনটি sample design, দুই version, কিছু comments এবং একটি pending review থাকবে। প্রতিটি asset আপনার নিজের বা licensed হবে। বাস্তব client এর private কাজ ব্যবহার নয়।

## Demo isolation
Shared public password বা একই mutable workspace সব visitor কে দেবেন না। Server signed guest session এর অধীনে visitor অনুযায়ী isolated demo workspace তৈরি করুন। Expiry ধরুন ২৪ ঘণ্টা। Initial demo তে user upload এবং external invitations বন্ধ থাকবে; শুধু seeded assets এ interaction হবে।

Visitor Designer এবং Client view toggle করে workflow দেখতে পারবে। এই toggle শুধু isolated demo session এর জন্য server validated হবে। Normal application এ client-supplied role কখনো authorization হিসেবে নেবেন না। Public demo endpoint আলাদা থাকবে এবং real workspace ID গ্রহণ করবে না।

## Quota and reset
- প্রতি session সর্বোচ্চ ২০ comment এবং নির্ধারিত demo actions cap।
- Visitor অন্য guest এর state দেখতে পারবে না।
- Reset Demo শুধু নিজের demo content reset করবে; confirmation এবং pending state রাখুন।
- Expired session এর DB records ও temporary storage cleanup idempotent job দিয়ে করুন।
- Cleanup production workspace ধরতে না পারে এমন explicit demo marker এবং scope test রাখুন।
- External email, payment বা webhook demo থেকে যাবে না।

## Acceptance checks
দুটি আলাদা browser session এ একই seeded project দেখালেও একজনের comment অন্যজনে দেখা যায় না। Designer/Client switch real workspace permission বদলায় না। Reload এ session টিকে থাকে; expired হলে fresh demo তৈরি হয়।

## Codex prompt
Complete Step 9 only. Add an isolated, expiring guest demo with seeded licensed assets and server-validated Designer/Client views. Do not reuse a shared mutable account or relax production authorization. Disable demo uploads and external invitations, cap writes, and add safe idempotent cleanup. Test two independent sessions, demo reset and rejection of real workspace IDs.

Demo architecture জটিল হয়ে গেলে read only walkthrough আগে launch করতে পারেন, কিন্তু interactive demo অসম্পূর্ণ থাকলে তা working demo হিসেবে দাবি করবেন না।

# 12 Verification and Polish

সময় ২ দিন। Dependency Step 9।

## মূল test matrix
| ক্ষেত্র | যে আচরণ পাস করতে হবে |
| Isolation | Outsider বা unassigned user read/write/file access পায় না |
| Upload | Invalid bytes, oversize ও abandoned upload safe থাকে |
| Pins | Resize, zoom এবং letterbox এ target সঠিক |
| Versions | নতুন version এ old comments/approval বহন হয় না |
| Approval | Stale এবং duplicate request safe |
| Invitation | Wrong email, expired এবং repeated accept safe |
| Share | Version scoped; revoked/expired blocked; writes denied |
| Demo | Visitor isolation, quota এবং cleanup scope সঠিক |

## Browser journeys
- Owner creates project, assigns designer/client; designer uploads; client comments; designer replies and resolves।
- Designer uploads version 2; client compares and requests changes; পরে approve করে।
- Guest share link দেখে; expiry/revoke এর পর নতুন access ব্যর্থ।
- Mobile user drawer খুলে comment পড়ে, pin select করে এবং decision দেয়।

## Quality review
360, 390, 768 ও 1440 px width এ দেখুন। অন্তত একটি real phone এ upload/review পরীক্ষা করুন। Keyboard navigation, focus indicator, form labels ও contrast দেখুন। Loading, upload failure, expired session, signed URL expiry এবং empty project state পরীক্ষা করুন।

Large original image প্রতিবার full resolution এ UI তে দেবেন না; safe preview derivative ব্যবহার করুন। Signed URL expire হলে authorized refresh করুন। Private content cache বা logs এ leak হচ্ছে কি না দেখুন।

## Codex prompt
Complete Step 10 only. Run permission, upload, coordinates, version, invitation, share and demo tests from the roadmap. Exercise critical browser journeys and representative viewport sizes. Fix actual failures, then rerun the affected checks and production build. Do not claim real-device, email or browser checks that were not performed. Document remaining limits and avoid brittle screenshot-only tests.

Checks চালানোর exact commands repository scripts থেকে নিন। উদাহরণ: pnpm lint, pnpm typecheck, pnpm test, pnpm test:e2e এবং pnpm build। Missing script থাকলে প্রথমে configure ও document করুন।

# 13 Deployment and Portfolio

সময় ১ থেকে ২ দিন। Dependency Step 10।

## Deployment preparation
- Development এবং production environment আলাদা রাখুন। Preview কে production database write access দেবেন না।
- Auth redirect URL, production app URL, database connections এবং private bucket configuration যাচাই করুন।
- Runtime connection pooling ও migration connection selected Prisma version অনুযায়ী official guide থেকে নিন।
- Staging এ migration rehearsal এবং smoke test করুন। Production এ development seed বা migrate reset চলবে না।
- Backup/restore capability এবং প্রয়োজনে manual backup রাখুন; feature availability plan অনুযায়ী verify করুন। Destructive migration এ backup ও forward-fix plan প্রয়োজন।
- App rollback এর সঙ্গে database automatically rollback হয় না; backward compatible migrations রাখুন।
- Log তে request ID, operation ও safe error রাখুন; token, signed URL ও comment content নয়।

## Search and access
Public landing page এর metadata, canonical ও sitemap রাখুন। Private app, invitation, share এবং demo routes search index থেকে বাদ দিন। noindex permission এর বিকল্প নয়। Share page এ third-party analytics নয়।

## Final live smoke test
Login, project access, image upload, comments, current-version decision, share expiry এবং demo isolation পরীক্ষা করুন। Private file URL public নয় নিশ্চিত করুন। Hosting timeout/body limit এর সঙ্গে upload flow মিলান।

## Portfolio package
- Title: Review Room Visual Review and Client Approval।
- Description: An image review workspace with pinned feedback, version comparison and client approvals।
- Live Demo, ৬০ থেকে ৯০ সেকেন্ড walkthrough এবং case study।
- Case study তে সমস্যা, নিজের ভূমিকা, UI decisions, coordinate mapping, permission model এবং tested limits লিখুন।
- Independent concept project হিসেবে চিহ্নিত করুন। Fake client, revenue, user count বা testimonial নয়।

## Codex prompt
Complete Step 11 preparation. Produce deployment configuration notes, migration order, backup and recovery runbook, SEO exclusions and release smoke checklist. Build the portfolio case-study draft from implemented facts only. Do not push, deploy, run production migrations or send invitations automatically. List exact remaining user-run steps and missing environment configuration without exposing secrets.

Hosting এবং storage plan এর current quotas/pricing launch এর আগে যাচাই করুন। Free hosting মানেই unlimited upload নয়।

# 14 Codex Working Instructions

## প্রথম session এর master prompt
I am building Review Room, a portfolio-grade image review application for creative agencies and clients. Read docs/ROADMAP.md in full and inspect repository instructions before changing code. Follow its scope, role matrix, data invariants and step dependencies. Work on the requested step only. Preserve completed behavior. Do not silently add AI, billing, video review, realtime presence or new infrastructure.

Before coding, list the acceptance criteria and affected files briefly. Implement the step, run relevant checks, and update docs/PROGRESS.md with completed work, evidence, limitations and the next step. Keep credentials private. Never weaken authorization to make a demo work. Do not push, deploy, modify production data or contact external recipients. Explain important implementation choices in plain language.

## প্রতিদিনের start prompt
Read docs/ROADMAP.md and docs/PROGRESS.md. Inspect the current repository and identify the first unfinished step. Summarize the current state without assuming prior chat memory. Complete only Step N using its acceptance checks. If a prerequisite is broken, fix it before proceeding and record the reason.

## Feature review prompt
Review the changes against Step N and the role matrix. Look specifically for cross-workspace access, forged nested IDs, insecure file access, duplicate writes and incomplete failure handling. Fix concrete defects within scope. Run meaningful tests and report what remains unverified. Avoid broad refactors or unrelated dependency changes.

## Bug fixing prompt
Reproduce this observed behavior: [steps and actual result]. Expected behavior: [result]. Find the root cause in the existing flow, add a focused regression check when useful, make the smallest coherent fix and rerun relevant checks. Do not mask the error or replace real data with mocked success.

## প্রতিদিন আপনার পাঁচটি কাজ
- নতুন code দিয়ে অন্তত একটি flow নিজে ব্যবহার করুন।
- AI কে জিজ্ঞেস করুন permission check কোথায় এবং কীভাবে কাজ করছে।
- Happy path ছাড়াও একটি invalid বা denied action পরীক্ষা করুন।
- Passing checks এবং remaining limits লিখে রাখুন।
- Working change commit করে পরের task লিখে দিন।

Session শেষে report format: completed step, changed files, checks run, known limits, next task। শুধু AI এর “done” লেখা দেখে ধাপ complete করবেন না।

# 15 Checklist and Technical References

## Master completion checklist
- Step 0 Scope, screens এবং decisions স্থির।
- Step 1 Fresh setup, migrations, seed এবং build চলে।
- Step 2 Verified identity এবং tenant permission checks পাস।
- Step 3 Assigned project visibility সঠিক।
- Step 4 Private upload ও finalize validation পাস।
- Step 5 Persistent pins, threads এবং resolve কাজ করে।
- Step 6 Version comparison ও current-version approval পাস।
- Step 7 Invitation ও expiring read only share পাস।
- Step 8 Scoped activity ও unread marker কাজ করে।
- Step 9 Isolated demo ও cleanup পাস।
- Step 10 Critical tests, mobile ও failure states checked।
- Step 11 Deployment smoke test ও portfolio package প্রস্তুত।

## সময়ের হিসাব
ধাপগুলোর estimate মোট ১৮ থেকে ২৫ কর্মদিবস। দিনে ৪ থেকে ৬ ঘণ্টা ধরে প্রায় ৭২ থেকে ১৫০ ঘণ্টার planning envelope। কাজের মান, শেখা ও debugging অনুযায়ী বদলাবে। Deadline চাইলে lower estimate কে প্রতিশ্রুতি না দিয়ে upper estimate এর সঙ্গে calendar buffer রাখুন।

## Official implementation references
নিচের নথি ১৬ অক্টোবর ২০২৬ এ research করা হয়েছে। Implementation এর সময় selected version অনুযায়ী আবার মিলিয়ে নিন। এগুলো architecture guidance; এই project এর code audit নয়।

Next.js Authentication
https://nextjs.org/docs/app/guides/authentication
Server entry point এ authorization এবং shared data access layer এর guidance।

Supabase Server Side Auth
https://supabase.com/docs/guides/auth/server-side/creating-a-client
SSR cookies, verified claims ও framework integration।

Supabase Prisma Integration
https://supabase.com/docs/guides/database/prisma
Prisma connection ও database setup।

Supabase Storage Access Control
https://supabase.com/docs/guides/storage/security/access-control
Storage policies এবং private access।

Supabase Private Buckets
https://supabase.com/docs/guides/storage/buckets/fundamentals
Private bucket access ও limited-time signed URLs।

Next.js Production Checklist
https://nextjs.org/docs/app/guides/production-checklist
Production configuration, secrets ও security review।
