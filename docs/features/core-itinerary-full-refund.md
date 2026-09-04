# Core itinerary full refund — B3.3a

Scope: the first safe post-ticket servicing slice. It implements only a full
Core-itinerary refund from already approved trusted evidence. It does not
invent a PSP response, a void window, partial-extra allocation, exchange fare
rules, EMD catalogues or Nira behavior.

## Acceptance checklist

- [x] Internal-token-protected full-order quote is owner scoped and writes no
      refund, ledger or lifecycle row (`core-itinerary.e2e-spec.ts`).
- [x] Quote reconciles every coupon fare/tax plus segment extras to the exact
      order total and applies the persisted penalty bracket per departure
      (`core-itinerary-refund.service.spec.ts`, `core-itinerary.e2e-spec.ts`).
- [x] Invalid input is 400, wrong/missing owner is 404, and non-ticketed or
      already-serviced coupon state is 409 (`core-itinerary.e2e-spec.ts`).
- [x] Apply requires an idempotency key and trusted refund reference; identical
      concurrent replay returns one result while changed payload is rejected
      (`core-itinerary.e2e-spec.ts`).
- [x] Apply atomically writes one negative REFUND ledger row, changes the order,
      documents and every coupon to REFUNDED, and appends immutable order and
      coupon transition evidence (`core-itinerary.e2e-spec.ts`).
- [x] A stale quote after durable evidence registration becomes
      REVIEW_REQUIRED with no partial status or ledger mutation
      (`core-itinerary.e2e-spec.ts`).
- [x] Additive migration apply/revert/re-apply, schema parity, scoped lint,
      typecheck, production build and focused unit/E2E tests pass locally.

## Explicitly deferred inputs

- Void eligibility window and accounting treatment.
- Partial traveller/segment/document refund and ancillary allocation policy.
- Exchange reprice, add-collect/residual settlement and replacement-document
  rules.
- EMD-A/EMD-S reason/sub-code catalogue, airline-approved stock and authority.
- PSP callback/refund signature contract and Nira/DCS contract.

No server migration, deployment, public route cutover, push or merge is part of
this implementation approval.
