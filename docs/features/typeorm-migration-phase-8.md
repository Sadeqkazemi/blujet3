# TypeORM migration — Phase 8: flights (flight/inventory/seat-map engine)

Phase 8 of the Prisma → TypeORM migration plan. Converts `flights.service.ts`
(1238 lines) on its own, per Phase 7's plan — the domain-critical flight
engine: flight/instance CRUD, airports, aircraft-type catalog and
mid-flight aircraft-type changes, recurring RRULE schedules and their
materialization, manageable fare classes (per-cabin anti-oversell), and
per-agency seat allotments (HARD/SOFT with lazy expiry).

## Module converted

**`flights`** — `FlightsService`: `overview()`/`completedReport()`
(active/future/completed tabs with real per-channel revenue), airports
CRUD, aircraft-type catalog, `create()`/`detail()`/`plan()` (upserts the
Phase 6 pricing proposal for COMMERCIAL_MANAGER), `changeAircraftType()`
(step-up-gated, rejects on seat shortfall vs confirmed bookings + active
seat locks), `runAiAnalysis()` (advisory ML pricing over the future list),
`createSchedule()`/`materializeSchedule()`/`listSchedules()` (idempotent
RRULE-driven instance generation), fare-rule CRUD (`createFareRule()`/
`updateFareRule()`/`deleteFareRule()`, cabin-capacity-checked), and
per-agency allotment CRUD (`createAllotment()`/`deleteAllotment()`,
HARD-always-counts/SOFT-until-`releaseAt` active-total tracking).

## New findings

- **Proactively audited every entity this service `.create()`s for the
  missing-`@BeforeInsert()`-hook bug before writing the service**, instead
  of discovering it one runtime failure at a time as in Phases 6–7. Found
  and fixed the hook missing on **six** entities: `Flight`, `Route`,
  `Airport`, `Schedule`, `FareRule`, `AgencyAllotment`. Confirmed via `tsc`
  (silent) then the e2e suite (465/465 clean on the first run) rather than
  hitting each one as a separate failure — the proactive-audit approach
  paid off given how many entities this single service creates.
- **Bulk `.insert()` bypasses `@BeforeInsert()` entity listeners
  entirely** — TypeORM only invokes lifecycle listeners on `save()` with
  entity instances, never on the query-builder's bulk `insert()`/`values()`
  path. `materializeSchedule()` replaces Prisma's `createMany({
  skipDuplicates: true })` with `createQueryBuilder().insert().into(...)
  .values(rows).orIgnore()` (Postgres `ON CONFLICT DO NOTHING`, matching
  Prisma's semantics without needing to name the conflicting unique
  constraint) — each row's `id` is generated explicitly with
  `randomUUID()` in the row-building step, since the entity's hook never
  fires for this path. The materialized count is read from
  `result.raw.length` (only actually-inserted rows are returned), not
  `result.identifiers`.
- **`enumerateSeats()`/`isKnownSeat()` (`reservation/seat-layout.ts`) still
  imported their parameter type from the Prisma-generated client**, whose
  schema defaults make `businessColsLeft`/`economyColsLeft`/etc.
  effectively non-nullable in the generated type. The TypeORM
  `AircraftSeatMap` entity correctly models these `text[]` columns as
  nullable, which doesn't structurally match. Fixed by replacing the
  import with a local `AircraftSeatMapLike` structural interface
  (nullable arrays, `?? []` defensively at each use) — safe for the
  several still-unconverted callers (`booking-engine`, `reservation`)
  since their Prisma objects are never actually null, and correct for
  this phase's TypeORM caller. This is an ORM-agnostic util now, not tied
  to either client.
- **`FarePricingProposal` has no inverse relation on `FlightInstance`**
  (same shape as the Phase 7 finding) — `plan()`'s Prisma
  `include: { pricing: true }` becomes a second independent query by
  `flightInstanceId`.
- **`AgencyAllotment.agency.user` PII restriction**: `listAllotments()`'s
  original Prisma `include: { agency: { include: { user: true } } }`
  loaded the full `User` row just to read `.fullName`; ported as
  `.leftJoin(...).addSelect(['agency.userId', 'user.id', 'user.fullName'])`
  instead of `leftJoinAndSelect`, consistent with every other PII-safe
  relation load in this migration.
- Same recurring conventions applied throughout: `FlightsService` keeps a
  `PrismaService` field solely to call the shared
  `materializeDepartedInstances()` util (still Prisma-based — it has
  other unconverted callers in `reporting`, `flightops`,
  `survey-lifecycle.util.ts`, `pnr.service.ts` — converting it is out of
  scope for this phase and would ripple into modules not yet touched);
  manual grouped `COUNT(*)`/`SUM(*)` raw queries replace every
  Prisma `groupBy()` (per-channel completed-report revenue, per-instance
  sold counts, per-schedule instance counts) with results parsed via
  `BigInt(...)`/`Number(...)` since raw query results are untyped driver
  strings, not transformer-mapped entity columns; `Not()`/`In()`/
  `IsNull()`/`MoreThan()` operators for Prisma's `not`/`in`/`null`/`gt`
  filters; entity mutation + `save()` in place of Prisma's partial
  `update()` calls, with explicit `if (dto.x !== undefined)` guards per
  field to replicate Prisma's undefined-omits-the-field update semantics.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 8 file (incidental `lint --fix`
  reformatting of unrelated files reverted with `git checkout --` before
  committing).
- `npm test` (unit) — 71/71 passing (includes a small `seat-layout.spec.ts`
  update to match the new ORM-agnostic parameter shape — no behavior
  change).
- `npm run test:e2e` — **465/465 passing on the first run** against a
  freshly reset + reseeded `blujet_test` database, covering flight
  overview/detail/create/plan, aircraft-type change (incl. the seat-
  shortfall rejection path), RRULE schedule creation + idempotent
  re-materialization, fare-rule CRUD (incl. cabin-capacity rejection),
  and agency-allotment CRUD (incl. HARD/SOFT active-total rejection).
- `git status` — touches only `flights.service.ts`/`flights.module.ts`,
  the 6 entities that gained `@BeforeInsert()` this phase, the
  ORM-agnostic `seat-layout.ts` + its spec, and this doc. Zero unrelated
  application files.

## What's next

Phase 9 (per the plan): `agencies`/`agency-portal` — the first
pessimistic-lock conversion (`SELECT ... FOR UPDATE` via TypeORM's
query-builder `.setLock('pessimistic_write')`). Then `refunds`,
`reservation` (seat locks — the double-booking-guarantee critical path),
`booking-engine` + `customer-referrals` together (shared-transaction
boundary, riskiest phase), then the remaining smaller modules, the seed
script, e2e fixture layer, and Prisma removal. Prisma remains the active
ORM for every module not yet converted; nothing removed until the
dedicated Prisma-removal phase.
