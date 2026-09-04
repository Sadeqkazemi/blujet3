# A6.4 — Agency read-only boundary

Owner approved preparing the independent read-only agency service, without
deployment. This first slice exposes minimized profile and invoice projections;
it is not a replacement for all current portal endpoints.

The current agency identity is `agency.agency_profiles.userId`, also referenced
as `agencyId` by invoices. Preserve this one-account-per-agency model; no new
agency ID, human subusers, schema migration or business writer is introduced.

Internal HTTP requires a separate service token and `X-Agency-Id` matching the
path. The header is a trusted backend assertion derived from an authenticated
AGENCY session, never a client-selectable tenant. The service checks this before
reading any tenant row. It has no access to identity, orders, inventory or
payments. Compromised trusted service credentials remain a separate threat;
header matching does not cryptographically attest the end user's session.

GET `/internal/v1/agencies/:agencyId/profile` returns only agencyId, city, tier,
joinedAt and suspendedAt. GET `.../invoices?page=1` returns ten items per page,
total as a decimal string, page and pageSize (10); page must be 1..1000. Sorting
is issuedAt DESC then id DESC. GET `.../invoices/:invoiceId` returns one owned
invoice. Invoice fields: id, invoiceNo, amountIrr (exact decimal IRR string),
status, issuedAt, dueAt, paidAt. No issuer identity, booking/passenger details,
free-text description, contacts, address, license or manager identity crosses
this boundary. Foreign invoice and absent invoice both return the same 404.
Lists require an existing profile; an existing profile with no invoices gets
an honest empty page. Reads use a single read-only repeatable-read transaction.

Read-only suspended-profile metadata remains available to a trusted caller;
it is not a login, purchase, credit or Partner API authorization decision.
Temporary UAT identities without real profiles receive 404 here. Existing
backend UAT compatibility and all public routes remain unchanged.

No public routing/cutover flag is added: there is no public caller yet. Core
retains invoice creation/payment, credit, ledger, sales and reservation writes.
Health/readiness contain no secrets. Runtime grants are column-scoped SELECT,
with read-only connection/transaction settings as defense in depth. Production
provisioning requires separate review/approval; the package grants nothing.

Backend change checklist:
- [x] Read current portal/controller/profile/invoice entities and relevant tests.
- [x] Document contract and DB ownership first; reuse Loyalty service shape.
- [x] Scope files: agency-service, optional local Compose, CI, API/schema/plan.
- [x] Implement service and typed API/error/health contracts.
- [x] Real PostgreSQL tests: success, 401/403/400/404, two-tenant isolation,
  exact IRR, pagination, suspended profile, PII omission and rejected writes.
- [x] Test restricted reader login and sanitize readiness/driver failures.
- [x] Lint/typecheck/build and generated internal OpenAPI.
- [x] Owner authorized publication and merge; PR #33 merged as `e516fe9`
  after all GitHub CI/PostgreSQL 16 Agency tests and CodeQL passed.
- [ ] Production credentials, parity, public integration and deployment later.

## Local acceptance evidence — 2026-09-04

Node 22 / PostgreSQL 18.2: 15 real-database HTTP tests in
`agency-service/test/agency.e2e-spec.ts` and 2 configuration tests in
`agency-service/src/config.spec.ts` pass. Lint, typecheck and build pass;
`openapi:export` is repeatable byte-for-byte and all five GET operations have
typed successful responses. Internal routes have typed 400/401/403/404/500
responses and the documented service-identity scheme.
The existing Loyalty regression suites also pass unchanged: 2 unit tests and
28 E2E tests, including the built-backend shadow contract. Total exercised:
47 tests across Agency and Loyalty, not a full monolith regression run.

Traceability to the E2E suite:

- Service identity and tenant assertions: `requires service identity on every
  data route`, `rejects missing or mismatched tenant assertions on every route`.
- Validation: `validates UUIDs, page bounds and unknown query fields`.
- Profile minimization/correlation: `returns only the owned minimized profile
  with UTC and request correlation`.
- Invoice pagination/IRR/ownership: `paginates ten owned invoices deterministically
  with tenant-scoped totals`, `preserves exact IRR beyond JS safe integer and
  never returns issuer/booking/free text`, `uses the same 404 for foreign and
  nonexistent invoices`, `reads the second tenant only with its own trusted assertion`.
- Empty/missing/suspended profile: `returns honest empty pages but rejects absent
  profiles`, `reports suspension without changing existing read behavior or Partner API status`.
- No writers: `has no write routes`, `denies writes and sensitive/cross-domain
  reads even with session read-only disabled`; afterEach compares fixture snapshots.
- Safe readiness/errors/schema: the final three E2E tests exercise these contracts.

Post-test inspection found zero temporary agency reader roles and zero synthetic
agency users left behind. CI/optional Compose YAML parses, the new CI job is
included in the required gate, and the optional service has no published port.
No new dependency versions were introduced: package/lock dependencies match
Loyalty. Initial offline npm install lacked cached packages; fetching those
locked packages completed installation. Existing dependency deprecation notices
were not addressed by changing versions in this slice.

Publication evidence: PR #33 merged as `e516fe9`; GitHub CI run `33888103867`
and CodeQL run `33888103904` passed, including Agency on PostgreSQL 16. Docker
image execution remains unverified locally because Docker is unavailable.
No production grant, production schema change or deployment was performed.
