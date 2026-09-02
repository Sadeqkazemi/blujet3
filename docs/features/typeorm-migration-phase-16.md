# TypeORM migration — Phase 16: remaining core src Prisma dependencies

## Scope

After Phase 15, `PrismaService` was still injected in a handful of core
`src/` files — not because those modules were unconverted, but because they
called one shared, still-Prisma-based utility (`flight-lifecycle.util.ts`),
or because two guards and the health check had never been touched:

- `src/modules/flights/flight-lifecycle.util.ts` —
  `materializeDepartedInstances()` / `materializeFlownBookings()`, called
  from `flights.service.ts`, `reservation/pnr.service.ts` (3 call sites),
  `reporting.service.ts`, and (via `survey/survey-lifecycle.util.ts`'s
  `materializeSurveyInvites()`) `survey.service.ts`.
- `src/common/guards/employee-permission.guard.ts` — one `findFirst` on
  `EmployeePermission` joined to `Permission`.
- `src/common/guards/jwt-auth.guard.ts` — one `findUnique` on `User` for
  the `mustChangePassword` gate.
- `src/health/health.controller.ts` — Terminus's `PrismaHealthIndicator`.

All four converted to TypeORM (`DataSource`/`Repository`) this phase,
closing out every remaining Prisma dependency in `src/` outside the
`src/prisma/` module itself (kept intentionally — still needed by the
~39 not-yet-converted e2e spec files, see Phase 17).

## Changes

- `flight-lifecycle.util.ts`: both functions now take a `DataSource`.
  `materializeDepartedInstances` uses `Repository.update()` with
  `LessThanOrEqual(new Date())`. `materializeFlownBookings` uses a
  query-builder `innerJoin` (Booking → FlightInstance) to find eligible
  bookings, then a query-builder `UPDATE ... WHERE id IN (...)`.
- `flights.service.ts`, `reservation/pnr.service.ts`,
  `reporting.service.ts`, `survey/survey.service.ts`: `PrismaService`
  constructor param replaced with `@InjectDataSource() dataSource:
  DataSource`; all `materializeX(this.prisma)` calls became
  `materializeX(this.dataSource)`.
- `survey/survey-lifecycle.util.ts`: `materializeSurveyInvites()`'s first
  parameter changed from `PrismaService` to `DataSource`.
- `common/guards/employee-permission.guard.ts`: the Prisma
  `employeePermission.findFirst({where:{employeeId, permission:{key:{in:
  keys}}}})` became a query-builder `innerJoin('ep.permission','p')` +
  `where('ep.employeeId = :employeeId')` + `andWhere('p.key IN
  (:...keys)')`.
- `common/guards/jwt-auth.guard.ts`: `prisma.user.findUnique({where:{id},
  select:{mustChangePassword:true}})` became
  `userRepo.findOne({where:{id}, select:{mustChangePassword:true}})`.
- `common/common.module.ts`: now imports `TypeOrmModule.forFeature([User,
  EmployeePermission])` and provides/exports `EmployeePermissionGuard`
  alongside the existing `JwtAuthGuard`, re-exporting `TypeOrmModule` so
  every feature module's `@UseGuards(EmployeePermissionGuard)` (referenced
  by class, not instance, across a dozen controllers) can resolve its
  repository dependency without each module separately registering
  `EmployeePermission` — `CommonModule` is `@Global()`, so this is
  sufficient app-wide.
- `health/health.controller.ts`: `PrismaHealthIndicator.pingCheck('database',
  this.prisma)` became `TypeOrmHealthIndicator.pingCheck('database')` (no
  connection argument needed — it resolves the default `DataSource`
  itself via `@nestjs/typeorm`, already registered globally by
  `TypeOrmModule.forRoot()` in `AppModule`). `TerminusModule` already
  provides `TypeOrmHealthIndicator`, so no module wiring changes needed
  beyond the controller.
- `reporting/reporting.service.spec.ts`: unit test's `{} as PrismaService`
  stub updated to `{} as DataSource`.

## Bug found and fixed (pre-existing, unrelated to this migration)

While chasing a flaky full e2e suite (three consecutive runs surfaced
different, shrinking sets of failures — 61, then 23, then 8 — none of
which reproduced when the affected file was run in isolation), root-caused
to `test/helpers/customer-state.helper.ts`'s `resetCustomerPhones()`:
it queried `users.phone` using the raw local phone strings the tests pass
in (`'09180000001'`, etc.), but the real OTP login flow
(`auth.service.ts`'s `normalizeIranPhone()`) stores phones in E.164 form
(`+989180000001`). The `WHERE phone IN (...)` never matched, so the
"cleanup" silently no-opped on every call — it has likely never actually
cleaned anything. Six e2e spec files (`bank-accounts`, `club`,
`customer-identity`, `identity-admin`, `saved-flights`,
`saved-passengers`) share these hardcoded phone numbers across files
without further isolation, so whichever file's test happened to run
before another in a given jest execution order (jest's default sequencer
reorders based on cached prior-run pass/fail data, so this shifted from
run to run) could leave residual data — and did, unpredictably. Fixed by
normalizing the phone list with `normalizeIranPhone()` before querying.
Confirmed the fix: a full suite re-run after was clean (465/465, 54/54
suites) with no jest-cache tricks.

## Verification

- `tsc --noEmit`: clean.
- `npm run lint`: clean (only the 2 pre-existing unrelated errors in
  `auth/dto/{request-otp,verify-otp}.dto.ts` and pre-existing warnings in
  unrelated files, all predating this phase).
- Unit tests: 71/71 passing.
- Full e2e suite: **465/465 passing across 54 suites**, against a freshly
  reset + reseeded database, confirmed clean on a dedicated post-fix run.
