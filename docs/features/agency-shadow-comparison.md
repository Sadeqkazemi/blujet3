# A6.6 — Agency offline shadow comparison

Continue the A6.4 representative-parity gate with the existing Loyalty offline
comparator pattern. Scope: minimized profile plus one explicitly selected
invoice page (1..1000, ten rows); not the complete portal or invoice-detail API.
No public routing, financial writer, tenant identity or UAT compatibility change.

The backend CLI takes an explicit agency UUID and optional page (default 1).
AGENCY_SHADOW_ENABLED defaults false: return DISABLED without initializing a
database or calling HTTP. When enabled, validate the flag, service origin,
credential (at least 32 characters), UUID and page before any connection.
AGENCY_SERVICE_URL accepts only an HTTP(S) origin with no userinfo, path, query
or fragment. AGENCY_INTERNAL_TOKEN authenticates the service request; the
explicit operator-selected agency ID becomes the trusted X-Agency-Id assertion.
This diagnostic tool is not an end-user authentication/authorization endpoint.

Read a minimized local snapshot, request the remote profile and selected page,
then read another local snapshot. If local snapshots differ, report INCONCLUSIVE;
if stable and equal to remote, MATCH; otherwise MISMATCH. A matched absent
profile requires safe NOT_FOUND responses on both remote routes. An existing
empty profile is distinct from a missing one. Preserve exact decimal IRR and
total strings, UTC timestamps and issuedAt DESC/id DESC page order; do not sort
away remote ordering bugs. Reject unexpected fields, owners, malformed amounts,
timestamps, pagination metadata, duplicate IDs, oversized bodies and redirects.
HTTP has a shared two-second deadline and 64 KiB per-response bound. Exceptions
report UNAVAILABLE, never records, SQL, URLs, credentials or agency identifiers.

CLI exit codes: DISABLED/MATCH 0, MISMATCH/INCONCLUSIVE/UNAVAILABLE 2; invalid
configuration or initialization/cleanup failure 1 with sanitized UNAVAILABLE.
Output is one JSON line (npm can add its standard script banner). Local reads
use the existing TypeORM metadata with restricted SELECT credentials and
read-only transactions; runtime routes do not import this tool. Observed
equality is point-in-time evidence, not a transaction spanning HTTP: transient
changes that revert between snapshots cannot be ruled out. No automatic cutover.

Backend change checklist:
- [x] Inspect Agency controller/service/DTO/entities, fixtures and Loyalty sibling.
- [x] Document API/DB contract before code; preserve Core as sole writer.
- [x] Scope files: backend comparator/local projection/CLI/tests/env/package,
  Agency HTTP tests, CI and documentation. No frontend or migration changes.
- [x] Prove disabled, config validation, exact match, drift and concurrent change:
  `backend/src/modules/agency-shadow/agency-shadow.spec.ts`.
- [x] Prove malformed/foreign/PII responses, timeout, redirects and safe reports:
  the same 27-case comparator suite.
- [x] Prove built backend CLI -> real Agency HTTP -> restricted PostgreSQL,
  both tenants, empty/missing profiles, pagination, exact IRR and rollback.
  `agency-service/test/agency.e2e-spec.ts` adds eight built-CLI cases and checks
  fixture snapshots remain unchanged after every test.
- [x] Run unit/E2E, lint/typecheck/build, unchanged OpenAPI and CI configuration checks.
- [ ] Obtain separate publication/CI/merge approval; no deployment.

## Local evidence — 2026-09-04

Node 22.15.0 / PostgreSQL 18.2. Backend Nest build, typecheck and zero-warning
read-only ESLint on all four new TypeScript files pass. The Agency package's
lint/typecheck and two config tests pass. The backend comparator suite has
27 passing cases, and the unchanged Loyalty comparator contributes 13 passing
regressions. All 51 Agency E2E cases pass, including eight new built-CLI cases;
the final sequential rerun also passes. Total: 93 relevant tests, not a full
monolith regression run. Both committed OpenAPI artifacts remain unchanged.

Before implementation, all eight new CLI cases failed because the built command
was absent. The first unit run later exposed a test-fixture issue: structuredClone
created host-realm prototypes that Node's strict equality distinguished from
Jest-realm JSON objects despite identical fields. An isolated VM reproduction
confirmed that mechanism; replacing only the fixture cloning with typed object
copies fixed the tests without weakening production comparison.

CI YAML parsing and checks confirm backend build/comparator tests precede Agency
E2E, and future agency-shadow/config changes select the Agency job. No workflow
is bypassed. Post-test inspection found zero temporary Agency roles and zero
synthetic Agency users. No production data, permissions or deployment changed.
GitHub/PostgreSQL 16 evidence awaits publication approval; Docker execution and
representative operational sampling remain separate. No commit/push/merge yet.
