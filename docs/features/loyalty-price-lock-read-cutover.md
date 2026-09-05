# A6.11 — Compatible Loyalty price-lock history reads

This slice moves only `GET /api/v1/my/price-locks` behind an optional Loyalty
read boundary. The public route, response envelope and newest-first history are
unchanged. The flag is disabled by default; Core remains the fallback and the
sole writer for price-lock creation, cancellation, fee ledger entries and
booking-time lock claims.

Loyalty exposes an owner-bound internal history projection containing every
status, with a hard 1000-row limit and no inventory join. The authenticated
backend supplies the owner assertion, validates the exact bounded response and
hydrates the existing `flight` object from Core inventory. A Loyalty or network
availability failure uses the existing Core read. Malformed or foreign-owner
data is rejected with a sanitized 503 rather than trusted or silently mixed.

## Rollback

Set `LOYALTY_PRICE_LOCK_READ_ENABLED=false` in the backend environment. The
next request uses the current Core query. No database rollback, data copy or
dual-write is involved. Do not enable the flag in UAT until the restricted
reader credential and representative all-status history parity are reviewed.

## Acceptance

- [x] Internal history is owner-bound, newest-first, all-status and bounded —
  `loyalty-service/test/loyalty.e2e-spec.ts`.
- [x] Disabled, success, empty, unavailable, malformed, oversized and
  foreign-owner client behavior is covered —
  `backend/src/modules/booking-engine/loyalty-price-lock.client.spec.ts`.
- [x] Remote history preserves the public flight enrichment and Core fallback —
  `backend/src/modules/booking-engine/price-lock.service.spec.ts` and
  `backend/test/purchase-extras.e2e-spec.ts`.
- [x] Create, cancel and booking-consumption paths remain Core-only — focused
  price-lock regression tests in `backend/test/purchase-extras.e2e-spec.ts`.
- [x] No migration, new grant, public route, writer or deployment change.
- [ ] UAT credential review, representative parity and owner-approved flag
  transition remain separate release gates.

## Local verification — 2026-09-05

- 13 Backend unit cases pass for the client and Core hydration/fallback.
- The complete Backend unit suite passes: 621 cases across 127 suites.
- 16 Backend purchase-extras E2E cases pass with `TZ=UTC`, including public
  401/403 authorization coverage.
- 2 Loyalty unit and 29 PostgreSQL E2E cases pass, including all-status
  history, ownership, overflow and rejected writes.
- Backend and Loyalty typecheck, build and scoped/full service lint pass.
