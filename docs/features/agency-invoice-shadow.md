# A6.7 — Optional invoice-detail shadow comparison

Extend A6.6, do not create another service or public route. The existing backend
CLI becomes `<agency-uuid> [page] [invoice-uuid]`; supply a page (usually 1) when
selecting a detail. Without the final argument, existing profile/page behavior,
two HTTP requests and report shape stay unchanged. Disabled mode still performs
no DB/HTTP work, even with absent/invalid arguments.

When enabled, validate all sample IDs before connections. An explicit empty or
invalid invoice ID fails closed. Fetch profile, page and selected detail with
the same trusted agency assertion/request ID and shared two-second deadline.
Each response retains the 64 KiB limit and redirect rejection. Detail success
must contain only the documented invoice projection with the exact requested ID;
wrong IDs, unexpected fields, noncanonical money, invalid timestamps or unsafe
404 shapes produce UNAVAILABLE. Safe NOT_FOUND means no owned invoice; it does
not reveal whether a foreign invoice exists. If the profile is absent, all
three remote responses must be NOT_FOUND.

The local ORM detail query filters agencyId AND invoice id inside each existing
READ ONLY / REPEATABLE READ snapshot and does not rely on the selected page.
Comparison retains MATCH / MISMATCH / INCONCLUSIVE / UNAVAILABLE, with only
status and request ID in output. Exact one-rial drift and detail-only changes
must be detected. Same exit codes and limitations as A6.6: point-in-time samples,
not a full-portal parity certificate, financial authorization or public cutover.
No new grants, migrations, dependencies, routes, frontend or deployment work.

Backend change checklist:

- [x] Read comparator, ORM projection, CLI, existing invoice route and tests.
- [x] Document API/DB impact before code; reuse existing Agency boundary.
- [x] Scope: four backend shadow files, Agency E2E/README, API/schema/plan/docs.
- [x] Prove optional/disabled compatibility and invalid-ID rejection before IO.
- [x] Prove exact ID/IRR/UTC validation, missing/foreign handling, detail-only drift
  and concurrent changes in `agency-shadow.spec.ts`.
- [x] Prove built CLI -> real HTTP -> restricted database for owned, paid,
  outside-page, foreign, absent and missing-profile cases with no writes.
- [x] Run affected regression suites, lint/typecheck/build and unchanged OpenAPI.
- [x] Owner authorized publication and merge; no deployment.
- [x] PR #36 merged as `b5568e5`; CI `33901667740` and CodeQL `33901667781`
  passed, including all four backend E2E shards. No deployment performed.

## Local evidence — 2026-09-04

Node 22.15.0 / PostgreSQL 18.2. Before implementation, the new built-CLI test
for an explicitly invalid invoice UUID failed: the old command ignored the
argument and returned exit 0 instead of the required exit 1. The updated
command rejects both an empty argument and a malformed UUID.

After implementation:

- Backend comparator Jest run (`agency-shadow loyalty-shadow`): 41 Agency and
  13 Loyalty cases pass (54 total), including 14 new detail cases.
- Agency `npm run test:e2e`: all 59 cases pass in three suites, including eight
  new built-CLI cases. Real HTTP uses a restricted reader against `blujet_test`;
  existing per-test fixture snapshots verify no business-row writes.
- Agency `npm test`: both config tests pass. Total: 115 relevant passing tests,
  not a full monolith regression run.
- Backend `npm run build`, `npm run typecheck` and read-only ESLint on the four
  affected TypeScript files with `--max-warnings=0` pass. Agency `lint:check`
  and `typecheck` pass. TypeScript formatting and `git diff --check` pass.
- Neither `docs/openapi.json` nor `agency-service/docs/openapi.json` changed.
  No migration, grants, dependency or public contract changes were made.
- Read-only post-test inspection found zero temporary Agency roles and zero
  synthetic Agency users. No production database or server was touched.

Owner authorized publishing `codex/agency-invoice-shadow` and merging after
successful GitHub/PostgreSQL 16 CI; CI and merge evidence will be recorded on
the pull request. Server deployment remains unauthorized. Docker is unavailable locally
and was not exercised. Operational sampling, complete portal parity, public
integration and deployment remain separate gates; this slice does not claim
that the entire Agency migration is complete.
