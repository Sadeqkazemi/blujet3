# A6.8 — Compatible portal invoice reads

Owner approved preparing public integration with the flag default off, testing
it enabled locally, and preserving the existing API. No deployment/activation.
Scope is GET /api/v1/agency-portal/invoices only, not profile or other portal reads.

Backend AGENCY_INVOICES_READ_ENABLED=false retains the existing Core read.
Enabling requires a UTC Node runtime (`TZ=UTC`); startup rejects non-UTC mode.
Legacy TypeORM interprets timestamp-without-time-zone in the host timezone, so
this prerequisite prevents a silent date shift on switching readers. Do not
change a live runtime timezone without an approved parity rehearsal.
When true, authenticated AGENCY identity and the normalized request ID go to
GET /internal/v1/agencies/:agencyId/portal-invoices. Never forward client tenant
headers. Existing local profile and temporary-UAT checks remain before HTTP.
Payments and every writer continue through Core, irrespective of this flag.

Agency AGENCY_PORTAL_INVOICES_ENABLED=false disables the compatibility route
(503). Enabled reads one READ ONLY / REPEATABLE READ snapshot, filtering the
owner; returns the existing flat invoice array, exact IRR strings and UTC dates,
including agencyId, bookingId, issuedById and nullable descriptionFa. No joins.
Existing minimized endpoints retain their exact contracts and grants.

The compatibility reader additionally needs SELECT on bookingId, issuedById,
descriptionFa in agency.agency_invoices. Readiness and the offline verifier
check this expanded projection only when the service flag is true. Old minimal
credentials remain valid with the flag off. No automatic grants or migrations.
Free text remains confidential and must not enter logs; its existing portal
visibility is preserved, not expanded to another tenant or minimized route.

The internal reader limits a snapshot to 1000 invoices and 1 MiB of encoded
data. It returns 503 rather than a partial list above either bound. Backend
uses a two-second total HTTP/body deadline, no redirects/retries/cache, strict
shape/ownership/money/date/status validation and a 1 MiB response cap.
Network/timeout, 5xx and size-limit failures fall back to the existing complete
Core read after the same authorization checks. 4xx, redirects or malformed/
cross-tenant responses fail closed with sanitized 503, without legacy fallback.
Logs contain only reason and request ID, never records, URLs or credentials.
Equal issue timestamps have no ordering guarantee (same existing contract).

Rollback: disable the backend flag first; no schema/data rollback is required.
Revoke the three additional grants only after disabling the service flag and
all compatibility readers. Representative parity, production grants and actual
activation require separate approval. This does not complete the entire portal
extraction; large-list fallback deliberately retains the legacy read path.

Backend change checklist:

- [x] Inspect existing portal, invoice entity, Agency routes/DTOs and sibling client.
- [x] Document API/DB contracts before implementation.
- [x] Scope: Agency compatibility route/config/verifier/health/tests/OpenAPI;
  backend invoice client/portal integration/config/tests; CI and documentation.
- [x] Prove missing behavior before implementation: the compatibility HTTP test
  expected 200 and received 404 before the new route existed.
- [x] Implement disabled/enabled paths with no financial writer changes.
- [x] Prove real HTTP/database parity, ownership, errors and rollback in
  `agency-service/test/agency.e2e-spec.ts`, `reader-verification.e2e-spec.ts`,
  backend `agency-invoice.client.spec.ts` and `agency-portal.e2e-spec.ts`.
- [x] Run focused tests, regressions, lint/typecheck/build and OpenAPI export.
- [ ] Publication and merge require separate approval; no deployment.

## Local evidence — 2026-09-04

Node 22.15.0, PostgreSQL 18.2, isolated `blujet_test` only. Final passing suites:

- 28 invoice-client cases plus 41 Agency shadow and 13 Loyalty shadow cases
  (82 total): strict wire/tenant checks, no HTTP when disabled, correlation,
  4xx/redirect rejection, network/5xx/oversize fallback, stalled headers/body,
  malformed JSON, duplicate/order checks, configuration and non-UTC rejection.
- 10 neighboring agency-seat unit regressions pass.
- 64 Agency E2E tests in three suites: real restricted SQL/HTTP; a built backend
  client and the real legacy TypeORM entity read return the same complete fixture
  array under UTC. Own/foreign, empty/missing, paid and large-IRR cases pass.
  1001-row and oversized-text snapshots return 503, not partial success. Readiness
  and built verifier distinguish minimal/expanded grants; rollback restores them.
- All 34 backend portal E2E tests pass under `TZ=UTC`, including the new enabled
  public route test (session tenant overrides forged header, no legacy read on
  success, fail-closed foreign/401 responses, availability fallback and disabled
  rollback). Existing payment/credit, ownership and temporary-account regressions
  remain green. Agency's 2 configuration tests also pass.

Total: 192 relevant passing tests; this is not a full monolith regression run.
Both Nest builds/typechecks pass; Agency lint and scoped backend ESLint pass
with zero warnings. Public OpenAPI remains unchanged; internal OpenAPI adds one
typed read route and is repeatable byte-for-byte. CI YAML parses and the Agency
job selects client/config/portal changes and runs client tests before E2E.
Whitespace review uses `git -c core.whitespace=cr-at-eol diff --check` to preserve
the existing CRLF portal test file without unrelated line-ending changes.

The first broad parity test revealed a host-timezone issue: Node's legacy `pg`
parser on the Tehran Windows host shifted raw timestamp-without-time-zone values
by 3.5 hours. Fixture expectations now come from the explicit UTC fixture values,
and the separate built-client test additionally compares the real TypeORM read
under UTC. Enabled configuration rejects non-UTC runtimes; disabled behavior is
unchanged. No global parser, historical timestamps or other API were rewritten.

Post-test inspection found zero temporary Agency roles and zero synthetic Agency
boundary users. Existing shared seed data is not deleted. No production grants,
database writes, server configuration or deployment was performed. Fresh GitHub
The owner authorized publication and merge after successful GitHub CI and
CodeQL; final run and merge evidence is recorded on the PR. Operational
parity/credential review remains an activation gate. Docker was unavailable
locally; browser QA was not performed (no frontend files changed). No deployment
is part of this publication.
