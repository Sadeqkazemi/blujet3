# TypeORM Migration — Phase 15: e2e test-fixture layer

## Scope

Converted the remaining 11 `test/*.e2e-spec.ts` files that still talked to
Prisma directly (via `PrismaClient`/`PrismaPg` in each file's own fixture
setup/teardown, independent of the app's own TypeORM `DataSource`) to use
TypeORM repositories instead:

- `test/blog.e2e-spec.ts`
- `test/careers.e2e-spec.ts`
- `test/flight-engine-completion.e2e-spec.ts`
- `test/phase13-agency-allotments.e2e-spec.ts`
- `test/phase13-fare-classes.e2e-spec.ts`
- `test/phase13-managerial-lock-governance.e2e-spec.ts`
- `test/phase13-reservation-engine.e2e-spec.ts`
- `test/phase13e-pnr-lifecycle-reconciliation.e2e-spec.ts`
- `test/phase14-sms-provider.e2e-spec.ts`
- `test/site-content.e2e-spec.ts`
- `test/survey.e2e-spec.ts`

All 11 confirmed to have zero remaining `prisma.`/`PrismaClient`/`PrismaPg`
references, and each is individually tsc-clean.

## DataSource access patterns used

Two patterns, both already established as precedent elsewhere in the
codebase (`club.e2e-spec.ts`, `schema-parity.e2e-spec.ts`) before this
phase:

1. **`app.get(DataSource)`** — reuse the already-booted NestJS app's own
   DataSource. Valid only while that specific `app` instance is alive.
   Used by every file with a single `beforeAll`/`afterAll` app (e.g.
   `flight-engine-completion.e2e-spec.ts`, the `phase13-*` files,
   `phase14-sms-provider.e2e-spec.ts`).
2. **A standalone `new DataSource(dataSourceOptions)`** — opened/destroyed
   independently of any app instance. Needed whenever DB access must
   happen either before any app exists, or after the relevant app has
   already been closed. Used by `blog.e2e-spec.ts` and
   `site-content.e2e-spec.ts` (per-test `beforeEach`/`afterEach` app,
   standalone `cleanup` DataSource in `afterAll`), and by
   `survey.e2e-spec.ts` (a dedicated `fixtureDataSource` opened in
   `beforeAll` before any app exists, alongside the per-test
   `app.get(DataSource)`).

## Bugs found and fixed

- **`FareRule.taxIrr` NOT NULL violation** — same gap class already
  established for `Booking.taxIrr` in Phase 11: the column has
  `default: 0` in the `@Column` decorator but no `@BeforeInsert()`
  enforcing it, so TypeORM's `.create()` does not apply the default.
  `flight-engine-completion.e2e-spec.ts`'s Y/B/M fare-classes test created
  `FareRule` rows directly via repository without setting `taxIrr`,
  causing `QueryFailedError: null value in column "taxIrr" ... violates
  not-null constraint`. Fixed by adding `taxIrr: 0n` explicitly to both
  `FareRule` object literals in that test. No other converted file creates
  a `FareRule` directly (the only other reference,
  `phase13-fare-classes.e2e-spec.ts`, only deletes them in cleanup — those
  rows are created through the real HTTP API, whose service layer already
  sets `taxIrr`).

## Notable conversion patterns per file

- `careers.e2e-spec.ts` — local query-builder helpers `getApplication(id)`
  and `getLatestAuditLog(...)` since `JobApplication` (4 jsonb columns)
  and `AuditLog` (jsonb `metadata`) trip the TS2589 "type instantiation
  excessively deep" bug on `.findOneBy()`/`.findOne()`.
- `flight-engine-completion.e2e-spec.ts` — `makeInstance()` helper
  rewritten as find-then-create for `Route`/`Flight`; instance lookups
  guarded with an empty-array check before falling back to a
  query-builder `.getMany()` (jsonb `aiSuggestion`).
- `phase13-managerial-lock-governance.e2e-spec.ts` — `Passenger` cleanup
  uses `createQueryBuilder('p').innerJoin('p.booking', 'b')` since a
  nested-relation `where` isn't used elsewhere in this codebase's
  TypeORM code; per-requester lock-cap counts use `IsNull()`/
  `MoreThan(new Date())` operators.
- `phase13-reservation-engine.e2e-spec.ts` — local
  `upsertSeatMap(aircraftType, fields)` helper (find-then-create-if-missing),
  reused for three distinct seat maps.
- `phase14-sms-provider.e2e-spec.ts` — `IsNull()` for `phone: null`
  filters, `Like('p14.%')` for the cleanup delete (Prisma's `startsWith`).
- `survey.e2e-spec.ts` (462 lines, most complex conversion) — `afterAll`'s
  `SurveyResponse` cleanup does a two-step delete (find matching
  `SurveyInvite` ids by `bookingId: In(createdBookingIds)`, then delete
  `SurveyResponse` rows by `inviteId: In(inviteIds)`) since Prisma's
  original nested-relation delete has no direct TypeORM equivalent for a
  DELETE with an implicit join.

## Verification

- `tsc --noEmit`: clean.
- `npm run lint`: clean (only 2 pre-existing unrelated errors in
  `auth/dto/{request-otp,verify-otp}.dto.ts` and pre-existing warnings in
  unrelated files, all predating this phase).
- Unit tests: 71/71 passing.
- Full e2e suite (after the `taxIrr` fix): **465/465 passing across 54
  suites**, against a freshly reset + reseeded database.
