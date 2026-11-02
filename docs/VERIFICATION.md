# Review Room — Verification Harness & Diagnostic Runbook

This runbook documents the verification harness boundaries, test suites, guard mechanisms, and redacted diagnostic correlation events.

## 1. Test Command Inventory

Review Room organizes automated verification into three distinct isolation classes:

| Class            | Commands                                                                                       | Target & Prerequisites                                                                                  | Guards & Denial Behaviors                                                                                                                                                                                          |
| :--------------- | :--------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Safe / Unit**  | `pnpm test`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm format:check`<br>`pnpm check`          | In-memory / mocked dependencies. No database connection, network calls, or secrets required.            | Runs anywhere, including CI runners and read-only sandboxes. Cannot mutate data.                                                                                                                                   |
| **Local-Write**  | `pnpm db:local:start`<br>`pnpm test:integration`<br>`pnpm db:rehearse`<br>`pnpm db:local:stop` | Dedicated local loopback PostgreSQL cluster on port **55432** (`review_room_test` DB).                  | Guarded by `assertLocalDatabase()`. Strictly refuses port 5432, remote hosts, or non-loopback databases before any connection or migration.                                                                        |
| **Hosted-Write** | `pnpm test:browser`                                                                            | Separate, disposable non-production Supabase staging project (`HOSTED_TEST_PROJECT_REF`, `DIRECT_URL`). | Guarded by `assertHostedTestTarget()`. Refuses production or preview backend before connecting or creating fixtures. Cleans up only its own tracked fixtures upon completion or interruption (`SIGINT`/`SIGTERM`). |

## 2. Redacted Mutation Diagnostics

All core server mutations (`projects`, `uploads`, `comments`, `reviews`, `sharing`, `auth`, `maintenance`) use unified, redacted failure handling via `src/lib/server/diagnostics.ts` and `src/lib/auth/failure.ts`:

- **Client Errors (4xx):**
  - Validation errors (`ZodError`), permission denials (`AccessError`), and declared upload errors (`UploadError`) return user-facing messages without server logging or correlation IDs.
- **Server Errors (5xx):**
  - Unexpected errors generate a cryptographically random UUID (`requestId`).
  - Safe, non-sensitive structured logs are emitted:
    ```json
    {
      "event": "mutation_failure",
      "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "domain": "projects",
      "operation": "create",
      "stage": "mutate_project",
      "reason": "database_connection"
    }
    ```
  - The UI receives a friendly generic message with an 8-character reference token:
    `"Could not save your changes. Please refresh and try again. (Reference: 3fa85f64)"`
  - **Redaction Guarantee:**
    - Raw Prisma errors, database URLs, query payloads, user passwords, tokens, comments, and mail bodies are strictly excluded from logs and client responses.
    - Error reasons are classified into fixed enumerated categories: `database_credentials`, `database_access`, `database_schema`, `database_capacity`, `database_connection`, `database_tls`, `storage_failure`, etc.

## 3. Fixture Interruption & Cleanup Safety

In `scripts/test-browser.mjs`:

- Fixtures are strictly scoped to unique random UUIDs for `workspaceId`, `projectId`, `assetId`, `versionId`, and users.
- Storage objects are tracked in a dedicated set (`objects`).
- Signal handlers for `SIGINT` (Ctrl+C) and `SIGTERM` invoke `cleanupTrackedFixtures()`.
- Cleanup removes only the tracked staging objects, workspaces, user profiles, and test Auth accounts. Unrelated tenant data is untouched.

## 4. Continuous Integration (CI)

The GitHub Actions workflow (`.github/workflows/ci.yml`) executes on every push and pull request to `main`:

1. `pnpm db:validate` — verifies Prisma schema consistency.
2. `pnpm db:generate` — generates the Prisma client.
3. `pnpm lint` — enforces strict ESLint rules (`--max-warnings=0`).
4. `pnpm typecheck` — non-incremental TypeScript verification.
5. `pnpm format:check` — verifies Prettier code style.
6. `pnpm test` — runs 17+ unit test suites in an isolated, network-free environment.

CI runs without access to production database URLs or secrets and never invokes live demo seeding.
