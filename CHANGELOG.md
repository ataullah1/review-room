# Changelog

## Unreleased — marketplace preparation (7 November 2026)

This is the source's release-candidate record, not a claim that the live demo has already been upgraded.

- Verification-aware signup/invitation identity and session-bound password recovery.
- Explicit project access removal, project name/brief/deadline editing and invitation-aware onboarding.
- Durable cleanup leases/backoff, workspace storage accounting, upload status/retry recovery and scoped comment draft recovery.
- Required-client review rounds, immutable completion/reopen snapshots, approved-original downloads and approval summary/manifest export.
- Optional encrypted notification outbox with retries and recipient authorization; provider setup remains external.
- Immutable previous-feedback revision notes; owner soft removal/30-day restore preserving approved originals.
- Opt-in bounded private ZIP jobs, cancellation, expiry and artifact cleanup; disabled pending hosted measurement.
- Buyer setup, reusable source packaging, marketplace media export and third-party notices.

Known release gates: matching live schema/code, hosted three-role acceptance, SMTP/controlled inbox setup, full isolated recovery rehearsal, marketplace review and seller submission. Permanent purge is not available. Source migrations: 26; application tables: 30 with RLS. No production migration, deployment or marketplace submission is implied by this changelog.
