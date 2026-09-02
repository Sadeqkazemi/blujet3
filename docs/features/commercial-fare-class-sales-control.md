# Commercial fare-class sales control

Source of truth: the approved 2026-08-19 Commercial Manager handoff and its
screenshots. This phase is additive to the existing flight lifecycle, fare-rule,
pricing-approval, seat-lock and agency-commitment flows.

## Acceptance checklist

### Public-sale visibility

- [x] Commercial Manager can enable or disable public-site sale for one flight.
- [x] A disabled flight is excluded from public search and booking even when its
  workflow status is otherwise published.
- [x] The control is audited and invalidates the affected search cache.
- [x] Legacy published flights remain visible after migration; newly-created
  flights start disabled until the manager enables them.

### Fare-class commercial control

- [x] Flight detail returns every persisted fare rule with real sold, remaining
  and revenue aggregates for its class code.
- [x] Commercial Manager can set a separate live public-site price per fare
  class with a mandatory reason.
- [x] Public search and payment re-price use the same class site price.
- [x] Every class-price change is append-only audited and its history is shown.
- [x] Commercial Manager can release a bounded number of remaining seats from a
  fare class to agencies, with an IRR price and optional special-offer flag.
- [x] Agency release cannot be negative or exceed the class's unsold capacity.
- [x] Weak-sales detail is class-level and uses real booking aggregates; empty
  data renders an honest empty state.

### Add-flight handoff

- [x] The existing agency-commitment editor is visible in Add Flight and its
  rows are persisted through the canonical commitment endpoint after creation.
- [x] Capacity validation includes charter and agency commitments.
- [x] Pricing proposal stores separate optional notes for CEO, Operations and
  Commercial while retaining the legacy note for compatibility.
- [x] Partial post-create failures are surfaced in Persian and the created
  flight remains recoverable/editable rather than silently losing data.

### Security, API and quality

- [x] Mutations are authorized server-side for `COMMERCIAL_MANAGER` (and the
  existing explicitly documented senior override where applicable).
- [x] All money fields are IRR decimal strings on the wire and bigint in storage;
  the UI converts through the shared تومان utility.
- [x] DTO validation covers invalid UUIDs, counts, prices and missing reasons.
- [x] Backend endpoint tests cover success, 401/403, validation and not-found
  (`backend/test/flights.e2e-spec.ts` — `commercial fare-class controls`).
- [x] Frontend tests cover loading/error/empty states and the new interactions
  (`CommercialFareClassControls.test.tsx`, five passing scenarios).
- [x] Backend/frontend typecheck, tests and builds pass.
