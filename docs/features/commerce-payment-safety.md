# Commerce B2.1 — preflight and durable payment quarantine

Scope: internal payment safety in the existing NestJS Core. B2 as a whole is
not complete: PSP callbacks, automated reconciliation/recovery/refund and
promo-capacity reservations across a network call are later slices. No real
gateway, Nira integration, publication or deployment is authorized.

Backend change:

- [x] Read booking controller/service/DTO/entities, promo and reconciliation tests.
- [x] Update API/DB contract before code; continue the approved execution roadmap.
- [x] Sibling patterns: B1 request binding, booking/wallet row locks and existing
  PaymentReconciliation; no new architectural layer or dependency.
- [x] Touched areas: booking service, payment/promo helpers, gateway failure type,
  payment entities + one migration, metadata registration, tests and docs.
- [x] Implement and run typecheck/build/read-only scoped lint.
- [x] `booking-engine.e2e-spec.ts`: invalid promo never calls gateway (red → green).
- [x] `booking-engine.e2e-spec.ts`: request, verify, capture and ledger use final IRR total.
- [x] `booking-engine.e2e-spec.ts`: durable attempt precedes dispatch; concurrent requests call gateway once.
- [x] `booking-engine.e2e-spec.ts`: same-key concurrent payment replays the completed result.
- [x] `booking-engine.e2e-spec.ts`: timeout/lost response blocks new-key retry and wallet fallback.
- [x] `booking-engine.e2e-spec.ts`: changed payload under completed key is rejected (red → green).
- [x] `booking-engine.e2e-spec.ts`: expired hold after verification never issues tickets.
- [x] `phase13e-pnr-lifecycle-reconciliation.e2e-spec.ts`: failed fulfillment keeps PENDING evidence; manual resolve remains authorized.
- [x] Unit specs: request canonicalization, zero/large IRR and promo validation/caps.
- [x] Existing booking/agency/repricing suites: 400/401/403/404, ownership and last-seat guards.
- [x] `schema-parity.e2e-spec.ts` + migration checks: additive SQL and metadata match.
- [ ] CI on PostgreSQL 16 and staging UAT after separate publication approval.

Rollout gates: drain all old payment writers; apply expand migration; start only
compatible writers. A process loss in REQUESTING is deliberately fail-closed:
neither a timeout nor an old lease authorizes another charge. No automatic
clear/retry endpoint is supplied without an independently verified PSP outcome.
UNKNOWN records may have no capture reference and therefore are not yet in the
legacy capture-only reconciliation API. They require the next recovery/ops slice
before production rollout. VERIFIED records do appear in that existing queue.

Only a GatewayNotDispatchedError emitted by the local adapter before dispatch
permits FAILED. `verify.ok === false` is conservatively UNKNOWN, not assurance
that no debit occurred. Never show a customer an unsupported “no money taken”.

Local tests use `blujet_test` and simulated gateway failures. They do not certify
a PSP, production payment readiness, or safe rollback to an unaware old writer.

Local evidence on 2026-09-03: all 113 backend unit suites (447 tests), 120
payment/booking/agency/repricing E2E tests, TypeScript typecheck, Nest build and
read-only ESLint over every changed TypeScript file passed. The additive B1/B2.1
migrations and schema parity were exercised only against `blujet_test`; CI on
PostgreSQL 16, staging UAT and any external PSP certification remain open.
