# TypeORM migration — Phase 17

Converts the remaining e2e spec files off `PrismaService` to TypeORM
(`DataSource`/`Repository`), completing the e2e test-suite side of the
Prisma → TypeORM migration. Combined with Phase 15 (fixture-layer helpers)
and Phase 16 (remaining core `src/` Prisma dependencies), this closes out
all application and test code — the only Prisma surface left in the repo
after this phase is `backend/prisma/` itself (schema, migrations, the
Prisma CLI config) and the generated Prisma client, both scoped for
removal in Phase 18.

## Scope

44 files changed, none of them behavior changes — purely an ORM swap
(Prisma Client calls → TypeORM `Repository`/`DataSource` calls), preserving
every test's assertions and scenario coverage exactly as they were:

- `test/helpers/login.helper.ts` — `loginAs()`/`stepUpFor()` now resolve the
  acting user via `app.get(DataSource).getRepository(User)` instead of
  `prisma.user.findUniqueOrThrow`.
- 39 `test/*.e2e-spec.ts` files converted off `PrismaService` (full list:
  `agencies`, `agency-portal`, `audit`, `auth`, `bank-accounts`,
  `booking-engine`, `cartable`, `club`, `customer-account-refunds`,
  `customer-identity`, `customer-referrals`, `employee-cartable`, `files`,
  `finance-reports`, `flightops`, `flights`, `identity-admin`, `it-manager`,
  `my-sessions`, `panels`, `phase12`, `phase16-agency-signup`,
  `phase17-user-profile`, `phase18-panel-access`, `phase19-manage-booking`,
  `phase21-forgot-password`, `phase22-flight-status`,
  `phase27-employee-fl-manage-ag-settle-fn-invoices`,
  `phase51-password-reset-email`, `pricing`, `privacy`, `purchase-extras`,
  `refund-submission`, `refunds`, `reporting`, `reservation`,
  `saved-flights`, `saved-passengers`, `webservice-pricing`).
- Two genuine bugs found and fixed along the way (see below), both
  pre-existing gaps unrelated to this phase's own conversion work.

## Conversion patterns used (same as Phases 15/16, applied at scale)

1. **DataSource acquisition** — two shapes, matching each file's existing
   test-lifecycle structure:
   - `beforeEach`-per-test files: `dataSource = app.get(DataSource);` right
     after `app = await createTestApp();`.
   - Files needing DB access before any app exists (a `beforeAll` seeding
     shared fixtures like a flight/route/seat-map before the per-test app
     boots): a standalone `new DataSource(dataSourceOptions)` —
     `await ds.initialize()` … `await ds.destroy()`.
2. **Prisma → TypeORM call mapping** — `findUnique(OrThrow)` →
   `findOneBy`/`findOneByOrFail`; `findFirst(OrThrow)` → `findOneBy`/
   `findOneByOrFail`, or query-builder with `.innerJoin()` when the Prisma
   `where` filtered on a nested relation; `findMany` → `.find()`;
   `create` → `repo.save(repo.create({...}))`; `createMany` →
   `repo.save(repo.create([...]))` (array); `update` → `repo.update()`;
   `count`/`aggregate` → `.countBy()` or query-builder `.getCount()`/
   `SUM(...)` `.getRawOne()` depending on jsonb involvement (see below);
   `delete`/`deleteMany` → `repo.delete()`.
3. **TS2589 "Type instantiation is excessively deep"** — entities with a
   jsonb column (`AuditLog.metadata`, `FlightInstance.aiSuggestion`,
   `RefundRequest.history`, `ClubCardRequest.history`,
   `AgencyMembershipRequest.documents`, `ManagerReferral.attachments`,
   `JobApplication`'s jsonb columns) still trip this on `.findOneBy()`/
   `.findOne()`/`.update()`/`.countBy()` reads. Fixed uniformly via
   query-builder `.getOne()/.getOneOrFail()/.getMany()/.getCount()`, which
   has no such generic-depth issue. `.create()` with a jsonb literal
   remains unaffected (only read/update shapes trigger it).
4. **Bigint money fields** — every IRR amount literal in test fixtures now
   carries the `n` suffix (`20_000_000n`) or `BigInt(x)`.
5. **Entities without `@UpdateDateColumn()`** — explicit
   `updatedAt: new Date()` on every `.create()` for `User`,
   `AgencyCreditLine`, `AircraftSeatMap`, and similar plain-column entities.
6. **Phone normalization** — `User.phone` is stored E.164
   (`+98XXXXXXXXX`); any raw local-format (`09XXXXXXXXX`) literal used to
   query `User` goes through `normalizeIranPhone()` first.

## Bugs found and fixed this phase

Both are genuine, pre-existing gaps in the earlier TypeORM entity
conversions (Phase 12, when `booking-engine` — including `PromoCode` and
`CabinFare` — was first converted), not something introduced by this
phase's test-file work. They only surfaced now because
`purchase-extras.e2e-spec.ts` is the sole place in the whole codebase that
creates `PromoCode`/`CabinFare` rows directly (every other caller only
reads them; the live application never writes to either table itself).

1. **`PromoCode` and `CabinFare` had no `id` auto-generation.** Both use a
   plain `@PrimaryColumn({ type: 'text' })` `id` with no DB-side default
   and no `@BeforeInsert()` hook — unlike every other entity with the same
   shape (`User`, `Booking`, `Flight`, `Route`, …), which all generate
   `id ??= randomUUID()` in a `@BeforeInsert()`. Inserting either entity
   without an explicit `id` therefore violated the `NOT NULL` constraint.
   Fixed by adding the same `@BeforeInsert() generateId()` hook to both
   entities, matching the established convention exactly.
   (`src/database/entities/promo-code.entity.ts`,
   `src/database/entities/cabin-fare.entity.ts`)
2. **`SavedFlightsService.save()` hit the TS2589 jsonb bug** —
   `flightInstanceRepo.findOneBy({ id })` against `FlightInstance` (which
   has the jsonb `aiSuggestion` column) failed to compile. This is
   application `src/` code, not a test file, and had simply never been
   fixed in an earlier phase. Converted to the standard query-builder
   `.createQueryBuilder('fi').where('fi.id = :id', { id }).getOne()`
   fix. (`src/modules/booking-engine/saved-flights.service.ts`)

Both were caught by running the full verification loop (tsc → e2e) rather
than by inspection, consistent with this project's "prove it with a
failing test first" debugging discipline.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean, zero errors.
- `npm run lint` — clean; the only remaining findings (2 pre-existing
  errors in `auth/dto/{request,verify}-otp.dto.ts`, some warnings in
  `careers`/`search-advisory`/`site-content` e2e specs) are in files this
  phase never touched, confirmed via `git status` before/after.
- `npm test` (unit) — 71/71 passing, 16/16 suites.
- `npm run test:e2e` against a freshly reset + reseeded `blujet_test`
  database (`prisma migrate reset --force`, then `tsx prisma/seed.ts`) —
  **465/465 passing, 54/54 suites**, run twice (once before the
  `PromoCode`/`CabinFare`/`SavedFlightsService` fixes surfaced 3 failures
  in `purchase-extras.e2e-spec.ts`, once clean after).

## What's left for Phase 18

The only remaining Prisma surface in the repository:
`backend/prisma/` (schema, migrations, seed script since relocated in
Phase 14, `prisma.config.ts`), the generated Prisma client
(`backend/generated/prisma`), `backend/src/prisma/` (the `PrismaModule`/
`PrismaService` wrapper, now fully unused), and the `@prisma/*` npm
dependencies + Dockerfile/CI references. Phase 18 will: generate a
baseline TypeORM migration from the current schema and wire
`migration:run` into the deploy path, then remove Prisma entirely from the
repo and infra.
