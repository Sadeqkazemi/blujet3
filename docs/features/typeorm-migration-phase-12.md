# TypeORM migration — Phase 12: booking-engine + customer-referrals

Phase 12 of the Prisma → TypeORM migration plan. Converts `booking-engine`
(the public purchase engine's own DRAFT→HELD→PAID→TICKETED flow: pricing,
promo codes, wallet, club points, price locks, saved flights, search,
privacy/GDPR export-delete, and the core `BookingService`) together with
`customer-referrals` — the two share a transaction boundary, since
`BookingService.pay()` calls `CustomerReferralsService
.processFirstTicketedBooking()` inside the same DB transaction. Flagged in
advance as the riskiest phase in the plan.

## Modules converted

- **`pricing.ts`**: `getCabinPrice()` / `resolveFareClass()` — free
  functions taking an `EntityManager`, not a service; the fare-class
  bucket resolver's usage-count query and the flat/CabinFare/registered
  fallback chain.
- **`promo.service.ts`**: `applyPromoCode()` — validation chain (active/
  window/route/cabin/max-redemptions/max-per-user) + redemption record,
  also a free function taking an `EntityManager`.
- **`wallet.service.ts`**: balance is always `SUM(signedAmountIrr)`
  (private `sumBalance()` helper via raw `SUM(...)` query builder),
  `topup()`, `charge()` (transactional debit with insufficient-funds
  guard).
- **`club-points.service.ts`**: `earnForPurchase()`, `redeemForPayment()`,
  private `syncCache()` tier-rule lookup.
- **`price-lock.service.ts`**: gold-tier lock creation, `findUsableLock()`.
- **`saved-flights.service.ts`**: straightforward repo conversion.
- **`search.service.ts`** (470 lines): sale-window-open filter, seat/fare
  availability (`takenSeatCodes` / channel-count via Passenger→Booking
  joins), the largest single file this phase.
- **`privacy.service.ts`**: GDPR `exportMyData()` / `deleteMyAccount()`.
- **`booking.service.ts`** (684 lines, the core file): `createBooking()`
  (pessimistic-locked flight-instance transaction, nested passenger
  creation, conditional price-lock consumption), `pay()` (two-phase
  conditional updates, `PaymentReconciliation`, and the call into
  `CustomerReferralsService.processFirstTicketedBooking()` inside the same
  transaction).
- **`customer-referrals.service.ts`**: `ensureReferralCode()` (unique-code
  retry loop), `getDashboard()`, `processFirstTicketedBooking()` — the
  shared-transaction-boundary method called from `BookingService.pay()`.

## New findings

- **Real runtime bug, not caught by tsc**: `booking.service.ts`'s
  `createBooking()` consumed a price lock with a literal
  `{ id: usableLock.id, bookingId: null }` update criteria — TypeORM
  rejects a literal `null` in a where-condition at runtime
  (`TypeORMError: Null value encountered ... the IsNull() operator must be
  used`), even though the exact same file's `price-lock.service.ts`
  correctly used `IsNull()` for the structurally identical check
  (`findUsableLock`). Fixed by importing `IsNull` from `typeorm` and using
  `{ id: usableLock.id, bookingId: IsNull() }`. Found via the established
  technique: temporary `LoggerModule` level bump (`'silent' → 'error'`,
  reverted immediately after), isolated `-t`-filtered jest run, stack
  trace pointed straight at the offending line.
- **8 entities had no `@BeforeInsert()` id-generation hook**:
  `PaymentReconciliation`, `PayIdempotencyRecord`, `PriceLock`,
  `PromoRedemption`, `ClubPointsEntry`, `WalletEntry`, `SavedFlight`,
  `CustomerReferral` — this is the first phase to `.create()` any of them
  via TypeORM. Found proactively before writing service code (this phase's
  scope is large enough that a research pass up front was worth it) and
  fixed identically across all 8.
- **`manager.findOneBy(FlightInstance, {...})` triggers TS2589** even
  though `FlightInstance` isn't the entity with the recursive jsonb column
  — confirmed here a second time (first seen in Phase 6/10-era code) that
  the bug can surface transitively through a joined/related type, not just
  the entity directly holding the `JsonValue` column. Fixed the same way
  as always: `createQueryBuilder(FlightInstance, 'fi').where(...).getOne()`
  instead of `findOneBy`.
- **`RefundRequest` (via `history` jsonb) still the one entity that
  triggers TS2589 on bare reads** — `privacy.service.ts`'s
  `exportMyData()` needed the query-builder `.getMany()` form, consistent
  with every other touch of this entity across the whole migration.
- **`Booking` has no inverse relation to `Passenger`** (same recurring
  shape as every prior phase) — `privacy.service.ts`'s export/delete flow
  and `booking.service.ts`'s relation-loading helpers both do a separate
  `Passenger` query by `bookingId`, merged via `Map`/object spread.
- **Prisma's array-form `$transaction([...])`** (batches independent
  statements atomically) in `privacy.service.ts`'s `deleteMyAccount()`
  converts to `manager.transaction(async (tx) => { await tx.update(...);
  ... })` — distinct from the callback-form `$transaction` conversions
  used everywhere else in this migration, since the original code never
  needed the callback's intermediate reads.
- **`Booking.groupBy`** (fare-class usage counts in `pricing.ts`) and
  **`.aggregate({_sum})`** (wallet/club-points/referral balance sums)
  both convert to raw query-builder `SELECT ... GROUP BY` / `SUM(...)`
  calls, with `Number(row.count)` / `BigInt(row.sum)` casts since the `pg`
  driver returns aggregate results as strings.
- **`test/club.e2e-spec.ts` broke at tsc-time**: it calls
  `clubPoints.earnForPurchase(tx, ...)` directly with a `tx` sourced from
  `prisma.$transaction(...)`, now type-mismatched against the converted
  method's `EntityManager` parameter. Fixed by sourcing `tx` from
  `app.get(DataSource).manager.transaction(...)` instead — the one test
  file this phase needed to touch.
- **Tooling gap discovered during verification, not a code bug**:
  `npx prisma migrate reset --force` on this Prisma version applies all
  migrations but does **not** auto-run the seed step (no seed banner/
  output at all), unlike the auto-seeding behavior assumed by this
  migration's established reset routine. A first full e2e run against an
  unseeded-but-reset `blujet_test` produced a huge, misleading cascade of
  unrelated failures (auth, agencies, cartable, panels, ...) that looked
  like a systemic regression but was actually ~90 missing seed users.
  Root-caused by checking row counts directly in Postgres mid-run. Fix:
  always follow `migrate reset --force` with an explicit
  `npx prisma db seed` before running the e2e suite — noted here since
  every future phase's verification step depends on it.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 12 file (incidental `lint --fix`
  reformatting of unrelated files reverted with `git checkout --` before
  committing; the 2 pre-existing unrelated errors in
  `auth/dto/{request-otp,verify-otp}.dto.ts` and pre-existing warnings in
  unrelated `test/*.e2e-spec.ts` files are untouched by this phase).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — **465/465 passing** across 54 suites against a
  freshly reset **+ explicitly reseeded** `blujet_test`, after one
  fix-and-rerun cycle (the `bookingId: null` → `IsNull()` fix) and one
  false-alarm cycle (the missing-seed tooling gap above, resolved by
  reseeding, not a code change) — covers the full public purchase flow
  (search → price → promo → wallet/points/price-lock payment methods →
  pay → ticket), the referral program's first-ticketed-booking bonus, and
  GDPR export/delete.
- `git status` — touches only the booking-engine + customer-referrals
  source files, the 8 entities that gained `@BeforeInsert()` this phase,
  `test/club.e2e-spec.ts`, and this doc. Zero unrelated application files
  (the temporary `app.module.ts` logger-level debugging edit was reverted
  before committing and carries no diff).

## What's next

The remaining smaller modules (`blog`, `careers`, `club`, `reconciliation`,
`sms`, `support-tickets`, `survey`), then the Prisma-based seed script
rewrite, then the e2e test-fixture layer conversion (still Prisma-based
throughout, aside from this phase's one-off `club.e2e-spec.ts` fix), then
infra/CI/Prisma removal, then the final `CLAUDE.md` update reflecting the
TypeORM switch. Prisma remains the active ORM for every module not yet
converted; nothing removed until the dedicated Prisma-removal phase.
