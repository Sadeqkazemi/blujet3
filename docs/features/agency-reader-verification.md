# A6.5 — Agency reader permission verification

Continue the documented A6.4 provisioning gate, reusing the Loyalty A6.2
catalog verifier shape. No public API, tenant identity, writer, schema, gateway,
dependency or deployment change. The offline command uses AGENCY_DATABASE_URL
without a service token and never opens an HTTP listener.

The acceptance boundary is a point-in-time catalog check in the connected
database. PASS requires exact profile/invoice SELECT columns (including owner
predicates), schema USAGE, no elevated or inheriting role, no memberships,
ownership, CREATE, non-approved reads, writes, sequence access or executable
user-schema SECURITY DEFINER routines. PUBLIC privileges count. Application
read-only settings alone cannot turn an overprivileged account into PASS.
This is not a guarantee about other databases, future grants, tenant RLS,
trusted caller compromise, or arbitrary extension-code capabilities.

Output contains only status and named boolean checks: PASS/0, FAIL/2 or
UNAVAILABLE/1. Missing/invalid configuration and driver errors are sanitized.
No business rows, names, SQL or credentials may appear in output. Verification
reads catalogs inside a READ ONLY / REPEATABLE READ transaction; no provisioning
or probing writes are performed by the CLI itself.

Backend change checklist:
- [x] Read Agency controller/service/DTO, restricted-login HTTP tests and grants.
- [x] Document API/DB impact first; reuse Loyalty verifier and test conventions.
- [x] Scope: Agency verifier/CLI/tests/package script, README, API/schema/plan.
- [x] Prove exact grants PASS and each privilege violation FAIL on PostgreSQL:
  `reader-verification.e2e-spec.ts` (24 cases).
- [x] Prove CLI exit codes and safe output, including connection failure:
  `reader-cli.e2e-spec.ts` (3 cases) and the verifier suite's CLI PASS/FAIL case.
- [x] Prove HTTP projections still work using restricted credentials:
  `agency.e2e-spec.ts` (16 cases, including the new catalog gate check).
- [x] Run full Agency unit/E2E, lint/typecheck/build and OpenAPI no-drift check.
- [x] Owner authorized publication; PR #34 merged as `b361082` after Agency
  PostgreSQL 16 CI and CodeQL passed; no deployment.

Permission tests use generated roles and disposable objects in an explicitly
named `_test` database, with exact cleanup; they do not alter PUBLIC privileges
on existing objects or provision production users. Existing A6.4 tests remain
the evidence for HTTP 401/403/400/404, tenant isolation, data minimization and
denied writes with session read-only disabled.

## Local evidence — 2026-09-04

Node 22.15.0 / PostgreSQL 18.2: `npm run build`, `npm run lint:check`,
`npm run typecheck`, `npm test` (2 config tests), `npm run test:e2e`
(43 tests), `npm run openapi:export` and the OpenAPI no-diff check passed.
45 tests total; this is not a full monolith regression run. Initial CLI tests
failed because the command was absent, then passed after implementation.

Permission cases independently exercise missing amount/owner/profile columns,
schema USAGE, excess profile/invoice PII/free-text reads, foreign-domain reads,
column/table writes, schema/database CREATE, role flags/membership, disposable
sequence ownership/access, PUBLIC table SELECT and direct/PUBLIC SECURITY
DEFINER execution. Test cleanup left zero generated Agency roles, relations
or routines in the local test database. Existing HTTP fixtures remain unchanged
after every request; no business writer or schema migration changed.

The existing Agency CI job builds before running all E2E files. Publication
evidence: CI `33897589968` and CodeQL `33897590247` passed; PR #34 merged as
`b361082`. Docker execution and production role verification remain unperformed.
No production provisioning or deployment was performed in A6.5.
