# TypeORM migration — Phase 10: refunds

Phase 10 of the Prisma → TypeORM migration plan. Converts `refunds.service.ts`
(692 lines): staff refund-request queue (list/detail/refer/pay), the public
purchase-engine customer self-service (submit/list/preview/eligible-bookings),
the anonymous مدیریت رزرو self-service, and the fare-rule penalty engine's
data access.

## Module converted

**`refunds`** — `RefundsService`: staff `list()`/`detail()`/`refer()`/`pay()`
(step-up-gated payout with a ledger reversal + booking `REFUNDED` + a
conditional-update double-pay guard), customer `listEligibleBookings()`/
`previewMine()`/`submitFromCustomer()`/`listMine()`/`getMine()`, anonymous
`submitAnonymous()` (PNR + last-name lookup, no audit row — no real actor),
and the non-production `createTestRequest()` Playwright fixture helper.

## New findings

- **`RefundRequest.history` is a recursive `JsonValue` jsonb column, and the
  TS2589 bug it causes is broader here than in any prior phase**: it isn't
  limited to `find`/`findOneBy` — any query-builder `.set({...})` call that
  includes the `history` field in the payload also triggers "Type
  instantiation is excessively deep." Empirically confirmed that removing
  just the `history` key from a `.set()` call payload (keeping `status`/
  `processedById`/`paidAt`) made the same call compile clean — the recursion
  is specifically about matching a literal against the `JsonValue` union,
  not about the entity as a whole. Fix pattern established for this phase:
  the guarded conditional status flip in `pay()` (the double-pay race guard)
  updates only the non-JSON fields via query-builder `.set()`; `history` is
  persisted in a second step — a fresh fetch (post-guard, so it reflects the
  just-applied status) + entity-mutation + `save()` — since `save()` on a
  fully-loaded entity instance does *not* hit the same recursion (unlike
  `update()`/`.set()`/`find()`/`findOneBy()`).
- **New helper for the JsonValue-entity existence check**:
  `hasRefundRequest(bookingId, manager?)` uses
  `createQueryBuilder(RefundRequest,'r').where(...).getCount() > 0` instead
  of `findOneBy({ bookingId })`, which itself hits TS2589 on this entity.
  Replaces Prisma's `booking.refundRequests.length > 0` (no such inverse
  relation exists on `Booking` in TypeORM) at every call site: `previewMine`,
  `submitFromCustomer` (checked inside the transaction via the tx manager),
  and `submitAnonymous`. `assertRefundable()`'s signature changed from
  reading `booking.refundRequests` to taking an explicit
  `hasExistingRequest: boolean` parameter supplied by the caller.
- **`Booking` and `RefundRequest` were both missing `@BeforeInsert()`
  hooks** — found proactively before writing the service (this phase's
  `createTestRequest()` is the first TypeORM caller anywhere in the
  codebase to `.create()` a `Booking`; `submitFromCustomer`/
  `submitAnonymous`/`createTestRequest()` all create `RefundRequest`). Fixed
  on `booking.entity.ts` and `refund-request.entity.ts`.
- **`getOrThrow()`'s Prisma query joined `booking → flightInstance → flight
  → route` even though neither `refer()` nor `pay()` reads `request.booking`
  — but `detail()` does** (via the same `getOrThrow()`, spreading `...rest`
  into the response without excluding `booking`), so the nested flight/route
  data silently flows into the detail-modal API response. Ported the full
  join into a shared `staffDetailQuery()` builder (assignee + processedBy as
  PII-safe partial selects, full `booking`→`flightInstance`→`flight`→`route`
  chain) used by both `list()` and `getOrThrow()`, preserving the existing
  response shape exactly rather than "cleaning up" the seemingly-unused join.
- **Unique-constraint race handling**: Prisma's
  `PrismaClientKnownRequestError` + `err.code === 'P2002'` +
  `err.meta?.target` string-matching becomes TypeORM's `QueryFailedError` +
  `err.driverError.code === '23505'` (Postgres) + `err.driverError.constraint`
  exact-matching against the two relevant unique index names
  (`refund_requests_trackingCode_key` retries up to 3× on collision;
  `refund_requests_bookingId_key` — the one-request-per-booking guarantee —
  always conflicts immediately, no retry). A small `isUniqueViolation(err,
  constraintName)` helper centralizes this.
- **`toCustomerRow()`'s signature changed** from taking a single
  Prisma-joined row (`request` with `booking` nested inside) to taking a
  `RefundRequest` entity whose `.booking` relation is either query-builder-
  loaded (`listMine`/`getMine`) or manually attached in memory
  (`saved.booking = booking`) right after a `.save()` in
  `submitFromCustomer`/`submitAnonymous`/`createTestRequest`'s siblings —
  avoiding a redundant re-fetch when the booking (with its
  flightInstance/flight/route already joined) is already in scope from
  the same request.
- `listEligibleBookings()`'s Prisma `refundRequests: { none: {} }` filter
  becomes a `NOT EXISTS (SELECT 1 FROM refund_requests rr WHERE
  rr."bookingId" = b.id)` raw subquery condition on the booking query
  builder — the one-request-per-booking invariant is already guaranteed by
  the unique index, so this is a pure availability filter, not a race-prone
  check.
- Passenger lookup (`booking.passengers[0]` for `submitFromCustomer`,
  `booking.passengers.find(...)` for `submitAnonymous`) becomes a separate
  `Passenger` query by `bookingId` — same no-inverse-relation pattern as
  every prior phase touching `Booking`↔`Passenger`.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 10 file (incidental `lint --fix`
  reformatting of unrelated files reverted with `git checkout --` before
  committing; the 2 pre-existing unrelated errors in
  `auth/dto/{request-otp,verify-otp}.dto.ts` and 13 pre-existing warnings
  in unrelated `test/*.e2e-spec.ts` files are untouched by this phase).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — **465/465 passing** across 54 suites against a
  freshly reset + reseeded `blujet_test` (required restarting the
  environment's Postgres cluster and Redis, both found stopped at the start
  of this phase's verification — `pg_ctlcluster 16 main start` /
  `redis-server --daemonize yes`) — covers the staff refund queue
  (list/detail/refer/pay, incl. the step-up gate and the double-pay 409
  race), the customer submit/preview/list/eligible-bookings flow (incl. the
  re-price-style penalty preview and the one-request-per-booking conflict),
  and the anonymous مدیریت رزرو submission path.
- `git status` — touches only `refunds.service.ts`/`refunds.module.ts`, the
  2 entities (`Booking`, `RefundRequest`) that gained `@BeforeInsert()` this
  phase, and this doc. Zero unrelated application files.

## What's next

Phase 11 (per the plan): `reservation` (seat locks — the
double-booking-guarantee critical path). Then `booking-engine` +
`customer-referrals` together (shared-transaction boundary, riskiest
phase), the remaining smaller modules (`blog`, `careers`, `club`,
`reconciliation`, `sms`, `support-tickets`, `survey`), the seed script, the
e2e fixture layer, and Prisma removal. Prisma remains the active ORM for
every module not yet converted; nothing removed until the dedicated
Prisma-removal phase.
