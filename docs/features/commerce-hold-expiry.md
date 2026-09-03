# Commerce B3.1 — durable booking-hold expiry

Scope: materialize the approved 15-minute booking hold in the existing NestJS
Core and prove the expiry/payment race in PostgreSQL. This slice adds no public
endpoint, PSP callback, refund automation, Nira integration or ticket-number
stock. Those are separate B3/B5 gates and must not be inferred here.

Backend acceptance:

- [x] API and DB contracts preceded implementation; public `/api/v1` booking
      paths, DTOs and response envelopes remain unchanged — reviewed diff and
      `booking.controller.spec.ts`.
- [x] A due `HELD` booking becomes `EXPIRED` in a bounded worker batch and its
      seats remain available through the existing inventory rules —
      `booking-engine.e2e-spec.ts: an expired HELD booking...`.
- [x] A future hold and every non-`HELD` booking are untouched —
      `booking-engine.e2e-spec.ts: two expiry workers...` and the status guard
      in `booking-hold-expiry.worker.spec.ts`.
- [x] Expiry and one `HOLD_EXPIRED` lifecycle event commit atomically —
      `booking-hold-expiry.worker.spec.ts: expires a locked due batch...` plus
      the database-backed lazy-expiry assertion.
- [x] Re-running the worker or running two replicas does not create a second
      transition event — `booking-engine.e2e-spec.ts: two expiry workers...`.
- [x] Payment and expiry serialize on the Booking row; an expired booking
      cannot become `PAID` or `TICKETED` — `booking-engine.e2e-spec.ts: does not
      issue a ticket if the hold expires during verification`.
- [x] Worker restart is safe because due work and lifecycle evidence live in
      PostgreSQL; Redis state is irrelevant — database-backed two-worker/re-run
      E2E above; no cache dependency exists in the worker.
- [x] Invalid polling configuration falls back safely, test environments do
      not start a background timer, and shutdown owns timer cleanup —
      `booking-hold-expiry.worker.spec.ts` and
      `env.validation.booking-expiry.spec.ts`.
- [x] Migration is additive, entity metadata matches PostgreSQL, and rollback
      guidance preserves lifecycle evidence — migration down/up exercise and
      `schema-parity.e2e-spec.ts`.
- [x] Verification passed locally: 115 unit suites / 453 tests, 42 focused E2E
      tests, backend typecheck, Nest build and read-only scoped ESLint.

Operational boundary: `BOOKING_EXPIRY_WORKER_ENABLED=false` is a polling
rollback switch, not permission to extend holds. Authorized reads still
materialize expired rows and all inventory queries continue to ignore past-TTL
holds. A capture confirmed after expiry stays quarantined for reconciliation;
this worker neither retries a bank call nor marks money refunded.

Local evidence is from PostgreSQL 18.2 on `blujet_test`; it does not replace CI
on PostgreSQL 16 or environment UAT. The existing `pg` concurrent-query
deprecation warning appeared during E2E and did not fail tests. No GitHub
publication, server migration or deployment occurred in this slice.
