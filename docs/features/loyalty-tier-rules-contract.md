# A6.17 — Real tier-rules compatibility contract

Test-only follow-up to A6.13: compare the built Core ClubService and its real
HTTP client with Loyalty running on a column-scoped PostgreSQL reader. Public
APIs, business thresholds, writers, production grants and flags are unchanged.

Backend change:
- [x] Read Club controller/service, tier-rule entity/DTO and existing tests.
- [x] Confirm existing API and DB contracts (A6.13).
- [x] Follow the A6.16 cross-process contract/probe shape.
- [x] Limit files to two test helpers/suites and API/schema/feature/PLAN docs.
- [x] Implement and run real HTTP/PostgreSQL acceptance tests (8 cases).
- [x] Typecheck/build both packages, complete Loyalty lint and focused Backend
  client/config lint; no new dependencies or Backend runtime changes.

Acceptance (test/tier-rules-contract.e2e-spec.ts):
- [x] Compare exact thresholds, millisecond UTC timestamps, oldest rule,
  Persian updater label and computed preview; require actual remote delivery.
- [x] Compare null updater and zero card threshold without changing defaults.
- [x] Prove rollback through either flag and stopped listener.
- [x] Reject wrong service identity without silently falling back.
- [x] Lost column grant fails readiness and restores the complete Core read.
- [x] Prove Identity reads and writes are denied to the Loyalty reader.
- [x] Compare rule-table snapshots before/after each test; remove only the
  generated rule UUIDs and temporary login from an explicitly named _test DB.

Existing HTTP authorization/validation and Core-only PATCH regressions remain
in backend/test/club.e2e-spec.ts. This suite is not production parity evidence
or permission to enable a flag, publish, merge or deploy.

The suite uses two generated rule rows dated before the seeded rule and fails
early if older rules already exist. Only its own UUIDs are updated/deleted;
the complete rule-table snapshot must equal its original state after cleanup.
The existing seeded commercial manager is read, never edited. Tests run
sequentially with other database suites. The probe is typechecked before its
transpile-only child process executes built Core code; reports contain only
status and counters, never row data, credentials or user identifiers.

- [ ] GitHub CI/PostgreSQL 16 evidence after separately approved publication.

Local regression evidence (2026-09-05): all 63 Loyalty E2E cases across six
suites and 16 Loyalty unit cases pass; all 8 Backend tier-rules client cases
pass. The complete Backend Club HTTP suite also passes (26/26), including
role guards, validation and Core-only PATCH. No temporary
`loyalty_tiers_test_*` login remains after cleanup. Total: 113 relevant cases;
the 8 new cases are included in, not additional to, the 63 Loyalty E2E cases.
