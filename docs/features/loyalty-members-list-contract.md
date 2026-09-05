# A6.15 — Real members-list cutover contract

Exercise the built Core ClubService and LoyaltyMembersListClient against a real
Loyalty HTTP listener backed by a temporary column-scoped PostgreSQL reader.
Compare the existing Core TypeORM result with the enabled cutover result using
stable synthetic fixtures. This closes the mocked-transport gap in A6.14.

The Core probe uses a read-only connection to an explicitly named `_test`
database. Only fixture setup/cleanup uses a writer. The Loyalty application
receives neither the PII key nor permissions on national-ID or Identity data.
Probe output contains comparison status and transport counters, never member
values, SQL, credentials or query text. No new public API, runtime flag,
migration or deployment is introduced.

Acceptance in `loyalty-service/test/members-list-contract.e2e-spec.ts`:

- [x] Enabled real HTTP results equal Core fields, UTC dates, ordering, filters
  and unfiltered KPIs; transport counters prevent a silent fallback passing.
- [x] Empty results remain equal with unfiltered KPIs.
- [x] SITE_ADMIN and Persian/Latin exact national-ID searches bypass HTTP.
- [x] Disabled projection, missing reader privileges and stopped listener
  preserve Core results through availability fallback.
- [x] Invalid service identity fails closed, with sanitized output.
- [x] Reader verification/readiness enforce exact grants; fixtures do not
  change during reads and all temporary fixtures/grants/roles are cleaned.
- [x] Focused E2E (9 cases), full Loyalty E2E (47 cases), unit (9 cases),
  lint, typecheck and build pass locally. The Core probe imports the existing
  Backend build; CI already builds Backend before checking Loyalty.

Local evidence (2026-09-05): Node 22 / PostgreSQL 18.2, four E2E suites passed.
The full E2E run took about 90 seconds. CI with PostgreSQL 16 is pending
publication; no GitHub checks for this slice are claimed yet.

This is synthetic CI evidence, not representative production parity or
authorization to enable service flags. Activation and deployment remain separate.
