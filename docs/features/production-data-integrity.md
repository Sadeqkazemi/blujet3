# Production data integrity and operational golden path

Status: implementation in progress (2026-08-05)

## Goal

The production site must never present seeded/demo values as airline data and
must never report a successful OTP or payment when the real provider is not
configured. Deterministic fixtures remain allowed only inside automated tests
and development databases.

## Acceptance criteria

- [x] `SEED_ON_START=true` is rejected when `NODE_ENV=production`; the demo
  seed cannot be executed accidentally by the production container.
- [x] Production does not fall back to the log-only SMS provider. Missing or
  disabled Kavenegar configuration produces a failed send and an actionable
  server log.
- [x] Production does not bind the synchronous sandbox payment gateway. Until
  a certified PSP adapter is configured, payment attempts fail closed instead
  of issuing a ticket.
- [x] The home page renders route, destination, announcement, and promotion
  data only when returned by the public CMS API. API failure or an empty CMS
  response never reveals hard-coded prices, discounts, deadlines, or weather
  notices.
- [ ] Flight results, flight details, seat availability, passengers, booking,
  payment, PNR, ticket, and refund are read from or persisted to the database;
  no UI fallback manufactures operational records.
- [x] Test-only endpoints return 404 in production and automated fixtures are
  confined to `NODE_ENV=test` databases.
- [x] A production-data audit command identifies known seed fingerprints and
  is dry-run by default. Destructive cleanup requires an explicit confirmation
  token and a verified backup.
- [x] The repeatable UAT gate covers public search through ticket/refund plus
  staff, agency, finance, and IT visibility, and refuses remote mutation unless
  explicitly enabled.

## Release gate

Real passenger sales remain **NO-GO** until all of these are true:

1. HTTPS is enabled on a real domain and secure cookies are enabled.
2. Kavenegar is enabled with a valid key and a real delivery test passes.
3. A certified Shetab/PSP gateway implements request, redirect, callback,
   verify, idempotency, reconciliation, and reversal.
4. The production database is backed up, audited, and cleared of demo rows.
5. The golden path passes against a staging database with production-equivalent
   configuration, followed by a non-financial production smoke test.

## Cleanup safety

The current seed script mixes reference configuration (permissions, airports,
security policy) with demo users, flights, bookings, passengers, invoices, and
content. Therefore blindly deleting every row created by that script can make
the application unusable. Cleanup must first report exact fingerprints and
counts. A full reset is allowed only for a confirmed UAT-only database after a
backup; otherwise records must be reviewed and removed selectively.

## Verification on 2026-08-05

- Backend lint: passed with no errors (16 pre-existing test warnings).
- Frontend lint: passed with no errors (22 pre-existing warnings).
- Backend unit tests: 22 suites, 83 tests passed.
- Frontend unit tests: 108 files, 523 tests passed. The interaction timeout was
  raised from five to ten seconds so the full suite is stable under parallel
  load; the previously timed-out contact and careers tests also passed alone.
- Backend and frontend production builds: passed. The frontend retains its
  existing large-chunk warning.
- The UAT manifest resolves 17 backend E2E specs, 10 browser journeys, and six
  role/business flows. Database-backed execution is still required on a
  PostgreSQL/Docker-capable staging host before the unchecked acceptance
  criterion can be closed.

No production database rows were deleted during this change. That operation
requires a verified backup reference and a reviewed dry-run report.

The read-only browser audit of `http://202.133.90.31/` on 2026-08-05 confirmed
that the currently deployed (older) release still displays fixed route prices,
discount/deadline cards, a weather announcement, and mock image labels. The
local implementation removes those fallbacks, but the live finding remains
open until this branch is reviewed, published, and deployed.
