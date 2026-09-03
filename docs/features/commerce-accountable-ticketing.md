# Commerce B3.2 — accountable e-ticket issuance

Scope: replace every new random or missing passenger e-ticket with one shared,
transactional Core allocator while preserving current `/api/v1` contracts.
This slice does not invent production stock, an operator authority, EMD rules,
Nira messages or PSP recovery policy.

Backend acceptance:

- [x] API and DB contracts precede implementation; no public route, DTO,
      successful envelope or IRR representation changes
      (`booking-engine.e2e-spec.ts`, `schema-parity.e2e-spec.ts`).
- [x] Public gateway, wallet and points payment, agency allotment sale, manual
      staff issuance and managerial-lock finalization use the same ticketing
      service in their existing local transaction (`booking-engine.e2e-spec.ts`,
      `agency-portal.e2e-spec.ts`, `reservation.e2e-spec.ts`,
      `phase13-managerial-lock-governance.e2e-spec.ts`).
- [x] One passenger receives exactly one immutable ticket document and retry
      returns the same document number without advancing stock
      (`ticketing.e2e-spec.ts`).
- [x] Concurrent allocations lock stock and cannot duplicate a serial or
      oversubscribe a range (`ticketing.e2e-spec.ts`).
- [x] A multi-passenger issuance with insufficient stock changes nothing and
      returns `503 TICKET_STOCK_UNAVAILABLE` (`ticketing.e2e-spec.ts`).
- [x] Gateway issuance checks stock before dispatch; a post-capture failure
      retains the existing payment-attempt/reconciliation evidence
      (`booking-engine.e2e-spec.ts`).
- [x] Legacy numbers are backfilled as `QUARANTINED`, never certified as
      accountable stock (`ticket-document-migration.e2e-spec.ts`,
      `ticketing.e2e-spec.ts`).
- [x] Production migrations create no stock; non-production seed data is
      explicitly sandbox-labelled and production seed protection remains
      (`ticket-document-migration.e2e-spec.ts`, `seed.ts`).
- [x] Additive migration, down/up rehearsal, entity/schema parity, focused
      PostgreSQL E2E, unit tests, typecheck, build and lint pass
      (`ticket-document-migration.e2e-spec.ts`, `schema-parity.e2e-spec.ts`,
      `ticketing.service.spec.ts`, `ticketing.e2e-spec.ts`).
- [x] No Git merge, server migration or deploy occurred; release remains a
      separate owner approval gate (working-tree and branch verification).

Deferred inputs/gates:

- Airline numeric accounting code, approved ticket/EMD ranges and the role or
  external authority permitted to load/quarantine stock.
- EMD-A/EMD-S catalogues, coupon lifecycle, exchange/void/refund policy.
- PSP callback/late-capture compensation and Nira/DCS vendor contract.
