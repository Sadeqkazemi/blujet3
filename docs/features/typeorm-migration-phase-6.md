# TypeORM migration — Phase 6: staff operations (cartable, referrals, staff-reports, reporting)

Phase 6 of the Prisma → TypeORM migration plan. Converts the "staff
operations" batch: the manager cartable (unified task inbox), manager
referrals (delegate-and-report workflow, incl. attachments and chair
report permissions), the per-manager «گزارش کارمندان» staff feed, and
the finance/commercial reporting module (sales charts, KPIs, completed-
flights summary, low-sales alerts, recent transactions, revenue mix,
agency settlements, commercial overview).

## Modules converted

1. **`cartable`** — `CartableService` (448 lines): unified task inbox
   used by every manager/employee role. `getOwnOpenTaskOrThrow`, `list()`
   (per-category OPEN counts via a manual grouped `COUNT(*)` query since
   this build has no `loadRelationCountAndMap`; date filter via `Raw()`),
   `applySourceEffects()`, `resolve()`/`approve()`/`reject()`,
   `transfer()` (transactional), `requestChairPermission()`/
   `getChairPermission()`, `createTask()`/`createTasksForRoles()`,
   `listManagerRecipients()`, employee↔manager direct messaging.
2. **`referrals`** — `ReferralsService` (436 lines): delegate-a-task-to-
   another-manager workflow with attachments and per-recipient reports.
   `list()`/`myReferrals()`/`detail()` (query-builder with PII-restricted
   `from`/`recipient` column selects — never `leftJoinAndSelect` on
   `User`), `create()` (transactional: `ManagerReferral` +
   bulk `ManagerReferralRecipient` rows), `submitReport()`,
   `close()`/`requestRevision()`/`remind()`.
3. **`staff-reports`** — `StaffReportsService` (78 lines): per-dept
   employee list + audit-log feed for FINANCE_MANAGER/COMMERCIAL_MANAGER.
4. **`reporting`** — `ReportingService` (758 lines): sales chart,
   KPIs (revenue/profit/margin/operating-cost + agency-debt trend),
   finance dashboard stats, completed-flights summary, low-sales alerts,
   recent transactions, revenue mix, agency settlements, commercial
   overview. The one method still calling Prisma directly is
   `completedFlightsSummary()`'s call to `materializeDepartedInstances()`
   — that util's signature is still `(prisma: PrismaService)` because the
   `flights` module hasn't been converted yet; `ReportingService` keeps a
   `PrismaService` field solely for that one call, same cross-module
   boundary already established for `AgenciesService` (also unconverted,
   injected via DI, no shared transaction).

## New findings

- **A missing `@BeforeInsert()` UUID hook is a silent-until-runtime bug
  that `tsc` cannot catch.** `ManagerReferral` never got the hook added
  in earlier phases (its sibling `ManagerReferralRecipient` uses a
  composite PK and correctly needs none, which is likely why the gap
  went unnoticed at review time). `referralRepo.manager.transaction()`
  compiled cleanly and looked correct, but every `POST /referrals`
  failed at runtime with a Postgres NOT NULL violation on `id` — TypeScript
  has no way to know a `text` primary column needs an application-side
  generator. Caught only by the e2e suite (`cartable.e2e-spec.ts`'s
  referral-creation tests, plus a `files.e2e-spec.ts` test whose referral-
  attachment step failed the same way). Fixed by adding the standard
  `@BeforeInsert() generateId() { this.id ??= randomUUID(); }` hook.
  Lesson for remaining phases: after converting any module with a
  `tx.create(Entity, {...})` write, explicitly check that entity for the
  hook rather than assuming tsc's silence means it's covered.
- **`ReportingService.agencySettlements()`** — `AgencyProfile` has no
  `invoices` inverse relation declared (its `AgencyInvoice` link is
  `@ManyToOne` only, owning side on `AgencyInvoice`). Ported as two
  independent queries (fetch agencies with a restricted `user.fullName`
  select, then fetch invoices by `agencyId IN (...)`) merged via a
  `Map<agencyId, AgencyInvoice[]>` — the same "no inverse relation"
  pattern already established for `AgencyProfile` ↔ `User` in Phase 5.
- **`ReportingService.recentTransactions()`** — Prisma's nested
  `booking.passengers` with `take: 1` (first passenger's name, no
  `orderBy`) has no direct TypeORM equivalent through a query-builder
  join. Ported as a separate `passengerRepo.find({ where: { bookingId:
  In(bookingIds) } })` call, picking the first row per `bookingId` in
  JS via a `Map` — matches Prisma's original "arbitrary first row"
  semantics exactly (neither version orders the passengers).
- **`bookingCountsByInstance()`** — a new shared private helper in
  `ReportingService` for the manual grouped `COUNT(*)` pattern (per-
  flight-instance sold-seat counts), reused by both
  `completedFlightsSummary()` and `lowSalesAlerts()` — the third
  distinct call site for this `loadRelationCountAndMap` workaround after
  Phase 4 (`admins.service.ts`) and this phase's `cartable`/`referrals`.
- **Local dev/test database mismatch discovered mid-phase**: the e2e
  suite's `.env.test` points at a separate `blujet_test` database (per
  `test/jest-setup.ts`'s `dotenv.config({ path: '.env.test' })`), not the
  `blujet` dev database `.env`/`prisma.config.ts` point at by default —
  confirmed against `.github/workflows/deploy.yml`, which does
  `cp .env.test .env` before `prisma migrate deploy` in CI. Resetting
  `blujet` (the default) before an e2e run is a no-op for e2e
  correctness; the reset must target `blujet_test` explicitly
  (`DATABASE_URL=...blujet_test... npx prisma migrate reset --force`,
  then seed the same way) or stale data accumulates across runs and
  produces flaky-looking cross-run pollution (extra rows with old
  timestamps) that has nothing to do with the code under test.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 6 file (incidental `lint --fix`
  reformatting of unrelated files reverted with `git checkout --` before
  committing).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — **465/465 passing** against a freshly reset +
  reseeded `blujet_test` database, covering cartable (task lifecycle,
  transfer, chair-permission requests, employee↔manager messaging),
  referrals (create/list/detail/report/close/revision/remind, attachment
  ownership + PII-safe recipient display), staff-reports (per-dept feed
  isolation), and reporting (sales chart granularities, KPIs, finance
  dashboard stats, completed-flights summary, low-sales alerts, recent
  transactions, revenue mix, agency settlements, commercial overview).
- `git status` — touches only the 4 converted modules' service/module
  files, the entities that gained `@BeforeInsert()` this phase
  (`CartableTask`, `ChairReportPermission`, `ManagerReferralReport`,
  `ManagerReferral`), and this doc. Zero unrelated application files.

## What's next

Phase 7 (per the plan): flight/pricing read side (`flights`, `pricing`,
`flightops`, `webservice-pricing`). Prisma remains the active ORM for
every module not yet converted; nothing removed until the dedicated
Prisma-removal phase.
