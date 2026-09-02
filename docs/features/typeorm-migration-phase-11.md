# TypeORM migration — Phase 11: reservation (seat locks + PNR lifecycle)

Phase 11 of the Prisma → TypeORM migration plan. Converts `reservation`
(`SeatmapService` + `PnrService`) — the double-booking-guarantee critical
path: seat map rendering, managerial seat locks (request/approve/reject/
release, two-step governance), staff PNR search/issue/detail/list, seat
changes, cancellation, no-show, and the managerial-lock-to-ticket
finalization flow. Highest-risk phase so far given the concurrency
guarantees involved.

## Modules converted

- **`SeatmapService`**: `getSeatMap()` (per-aircraft-type layout with
  sold/locked/free per seat), `lockSeat()` (governance-role-gated request,
  requester lock-cap enforcement, expired-lock self-heal), `approveLock()`/
  `rejectLock()` (two-step: a requester can never approve their own
  request), `releaseLock()`.
- **`PnrService`**: `list()`/`detail()` (grouped by flight / single PNR),
  `changeSeat()` and `issue()` (both wrap their conflict-check + write in a
  `SELECT ... FOR UPDATE` transaction on the flight instance row — the
  actual double-booking guarantee), `cancel()`, `markNoShow()`, `search()`
  (public-site flat-fare fallback), `finalizeLock()` (turns an APPROVED
  managerial `SeatLock` into a real TICKETED booking), `dashboardStats()`,
  and the non-production `createTestInstance()` E2E fixture helper.

## New findings

- **Two real runtime bugs surfaced by this phase's e2e run that tsc/lint
  could never catch — both fixed at the entity level, not per call site:**
  - **`Booking.taxIrr`** (`bigint`, DB `default: 0`) was inserting a
    literal `NULL` instead of falling through to the default, because the
    shared `bigintTransformer.to()` maps `undefined → null` (never
    `undefined`), so TypeORM always includes the column in the INSERT.
    `issue()`/`finalizeLock()` are the first real (non-test-fixture)
    TypeORM `Booking` creation paths, so this was invisible until now —
    Phase 10's `createTestRequest()` has the identical gap but was never
    e2e-exercised, so it stayed latent. Fixed with a second
    `@BeforeInsert()` on `Booking` (`defaultTaxIrr()`, alongside the
    existing `generateId()`) rather than patching every call site — this
    also silently fixes the same gap in Phase 10's `refunds.service.ts`
    for free.
  - **`Passenger` had no `@BeforeInsert()` id-generation hook at all** —
    this is the first phase to `.create()` a `Passenger` via TypeORM
    (`issue()`/`finalizeLock()`). Fixed the same way as every other
    entity in this migration.
  - Both were found by an actual `QueryFailedError` at e2e time (NOT NULL
    violations on `taxIrr` then `id`), confirmed via a temporary
    `LoggerModule` level bump (`'silent' → 'error'` in
    `app.module.ts`, reverted immediately after) since pino logs
    unhandled-exception stack traces at `error` level and the e2e run
    normally suppresses them entirely (`level: 'silent'` when
    `NODE_ENV === 'test'`).
- **`SeatLock` was also missing `@BeforeInsert()`** — found proactively
  before writing `lockSeat()`, per the established discipline.
- **First `SELECT ... FOR UPDATE` pattern reused outside `agencies`**:
  `tx.createQueryBuilder(FlightInstance, 'fi').setLock('pessimistic_write')
  .where('fi.id = :id', {...}).getOne()` inside `manager.transaction(...)`,
  in both `changeSeat()` and `issue()` — confirms the pattern generalizes
  cleanly to a second, unrelated aggregate root (the agency profile row in
  Phase 9, the flight instance row here).
- **`issue()`'s conflict-check has a real, preserved asymmetry between its
  pre-transaction check and its in-transaction check**: the outer check
  filters active locks by `expiresAt > now`, but the original Prisma
  in-transaction check omits that filter entirely (any non-released lock,
  even an expired one, blocks issuance inside the atomic section). This
  reads like it could be tightened, but it's existing behavior, not a
  migration decision — ported faithfully via a `findLockConflict(...,
  { onlyActive })` helper with an explicit flag rather than silently
  unifying the two checks.
- **`Booking` has no inverse relation to `Passenger`** (same recurring
  shape as every prior phase touching bookings) — `getBookingOrThrow()`
  loads the booking via query builder (flightInstance→flight→route joined)
  then a separate `Passenger` query by `bookingId`, merged via object
  spread into a `BookingDetail = Omit<Booking, 'generateId' |
  'defaultTaxIrr'> & { passengers: Passenger[] }` type — the `Omit` is
  required because spreading a class instance drops its prototype methods,
  which the entity's own `@BeforeInsert()` hooks are structurally part of.
- **`list()`'s Prisma `OR` search** (PNR contains OR any passenger's
  fullName contains, both case-insensitive) becomes a single raw
  `(b.pnr ILIKE :q OR EXISTS (SELECT 1 FROM passengers p WHERE
  p."bookingId" = b.id AND p."fullName" ILIKE :q))` condition — cheaper
  than joining and de-duplicating, and avoids needing `Passenger` in the
  main query's join graph at all.
- Every seat-conflict check (`sold`/`lock` lookups) is a small shared
  private helper (`findSoldConflict`/`findLockConflict`) taking an optional
  `EntityManager` parameter (defaulting to the repository's own manager) —
  the same pattern as Phase 10's `hasRefundRequest`, letting one query
  builder definition serve both the pre-check (ambient manager) and the
  in-transaction check (`tx`) without duplication.
- `reservation-roles.ts`'s `Role` type import switched from
  `generated/prisma/enums` to `database/enums` — a type-only import with
  no runtime dependency, but still a Prisma-generated-client reference in
  a module this phase converts, so it's cleaned up alongside everything
  else.
- `SeatmapService.toLockView()`'s parameter type changed from
  `Prisma.SeatLockGetPayload<Record<string, never>>` to the plain
  `SeatLock` entity type.
- Same recurring conventions applied throughout: `PnrService` keeps a
  `PrismaService` field solely to call the shared, still-Prisma-based
  `materializeFlownBookings()` (per the Phase 8 precedent — it has other
  unconverted callers); `IsNull()`/`MoreThan()`/`LessThanOrEqual()`/`In()`
  operators replace Prisma's `null`/`gt`/`lte`/`in` filters; the shared
  `isUniqueViolation()` helper (`database/utils/pg-errors.ts`, introduced
  in an earlier phase) replaces the ad-hoc unique-violation check this
  phase would otherwise have duplicated a third time.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 11 file (incidental `lint --fix`
  reformatting of unrelated files reverted with `git checkout --` before
  committing; the 2 pre-existing unrelated errors in
  `auth/dto/{request-otp,verify-otp}.dto.ts` and 13 pre-existing warnings
  in unrelated `test/*.e2e-spec.ts` files are untouched by this phase).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — **465/465 passing** across 54 suites against a
  freshly reset + reseeded `blujet_test`, after one fix-and-rerun cycle
  (the `Booking.taxIrr`/`Passenger` hook misses) — covers seat-map
  rendering, managerial lock request/approve/reject/release (incl. the
  self-approval rejection and the requester lock-cap), PNR issue/detail/
  list/search (incl. the **concurrent-issue-for-the-same-seat race test**:
  exactly one of five simultaneous `POST /reservation/pnr` calls for the
  same seat succeeds, the rest 409), seat change (incl. the **concurrent
  changeSeat race test** for two different PNRs targeting the same free
  seat), cancel, no-show (incl. the not-yet-departed rejection), and
  lock-to-ticket finalization.
- `git status` — touches only `pnr.service.ts`/`seatmap.service.ts`/
  `reservation.module.ts`/`reservation-roles.ts`, the 3 entities
  (`Booking`, `Passenger`, `SeatLock`) that gained `@BeforeInsert()` this
  phase, and this doc. Zero unrelated application files (the temporary
  `app.module.ts` logger-level debugging edit was reverted before
  committing and carries no diff).

## What's next

Phase 12 (per the plan): `booking-engine` + `customer-referrals` together
(shared-transaction boundary — the riskiest remaining phase, since it's
the public purchase engine's own HELD→PAID→TICKETED flow plus the referral
program that hooks into it). Then the remaining smaller modules (`blog`,
`careers`, `club`, `reconciliation`, `sms`, `support-tickets`, `survey`),
the seed script, the e2e fixture layer, and Prisma removal. Prisma remains
the active ORM for every module not yet converted; nothing removed until
the dedicated Prisma-removal phase.
