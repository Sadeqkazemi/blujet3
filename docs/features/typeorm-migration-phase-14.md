# TypeORM migration — Phase 14: seed script

Phase 14 of the Prisma → TypeORM migration plan. Converts
`backend/prisma/seed.ts` (the ~1550-line dev/test seed script covering all
~40 domains: staff/customer/agency users, flights/bookings/ledger, agency
credit/invoices/messages/membership requests, cartable + manager referrals,
club members/tier rules/card requests, saved passengers/bank
accounts/referrals/KYC, survey settings/questions, careers settings/job
postings, blog posts, site-content CMS, pricing proposals, refund penalty
rules + sample refunds, aircraft seat maps + demo PNR/seat-lock data,
permission catalog/internal+external services/security policy/employees,
airport catalog + THR↔DXB/THR↔MHD flight inventory) from `PrismaClient` to a
plain TypeORM `DataSource` built from the same `dataSourceOptions` the app
itself uses. The entrypoint file path is unchanged
(`backend/prisma/seed.ts`), so `prisma.config.ts`'s `migrations.seed: "tsx
prisma/seed.ts"` hook and `npx prisma db seed` keep working without
modification. With this phase, every backend module AND the seed script
are on TypeORM; only the e2e test-fixture layer (still raw `PrismaClient`
per test file) remains.

## What changed

- `backend/prisma/seed.ts`: rewritten top to bottom. `new
  DataSource(dataSourceOptions).initialize().then(main)...finally(()
  => dataSource.destroy())` replaces `new PrismaClient({adapter:
  new PrismaPg(...)})` / `prisma.$disconnect()`.
- A small local `upsertBy(repo, where, create, update?)` helper translates
  every Prisma `.upsert({where, create, update})` call site: find by
  `where`, `repo.merge()` + `.save()` if found and `update` is non-empty,
  otherwise `repo.save(repo.create(create))`. TypeORM's own
  `Repository.upsert()` has different ON-CONFLICT-keyed semantics and
  doesn't return the resulting entity the way every call site here needs.
- Every `.count()`, `.count({where})`, `.findFirst()`/`.findUnique()`,
  `.create()`, `.createMany()`, `.update()`/`.updateMany()` call across the
  ~40 models translated to the equivalent `Repository`/query-builder call,
  following the same idioms established in Phases 9-13 (`IsNull()`,
  `MoreThan()`, `In()` operators; query-builder `.getOne()`/`.getMany()`
  for entities with jsonb columns; explicit `where: {}` for
  singleton-lookup `findOne({order})` calls).
- `ManagerReferral`'s nested `recipients: {create: [...]}` (Prisma relation
  write) split into a plain loop inserting `ManagerReferralRecipient` rows
  directly after the parent `ManagerReferral` is saved (its composite PK
  is two FK columns, no id-generation needed).
- Money columns migrated to bigint in an earlier phase (task #164) but the
  Prisma seed script still passed plain JS numbers for most of them
  (`priceIrr`, `signedAmountIrr`, `amountIrr`, `limitIrr`, `totalPaidIrr`,
  `penaltyAmountIrr`, `refundableIrr`, `basePriceIrr`,
  `competitorPriceIrr`, `proposedPriceIrr`, `legalRateIrr`,
  `registeredPriceIrr`) — Prisma's client coerces `number`→`BigInt`
  transparently at the field level, TypeScript does not. Every such value
  is now either a `123n` bigint literal (static constants) or
  `BigInt(x)` (values derived from local business-logic arithmetic, which
  stays plain-number math for the percentage/rounding calculations and
  only converts at the point of assignment to an entity field).

## New findings

- **A new, large instance of the "no TypeORM equivalent for
  `@updatedAt`" gap, this time entity-wide**: every prior phase's
  discovery of this class of bug (`Booking.taxIrr`'s bigint default in
  Phase 11, `SurveyInvite.token`'s plain-column default in Phase 13) was
  one column on one entity. The seed script's very first real insert
  (`users`) surfaced that **17 entities** across the schema have a plain
  `updatedAt!: Date` column (`@Column`, not `@UpdateDateColumn`, no DB
  default) that every other already-converted service module sets
  explicitly on every write (confirmed via `grep updatedAt
  auth.service.ts`, which sets it on all 9 of its `User` writes) — but the
  seed script, freshly translated from Prisma object literals that relied
  on Prisma's automatic `@updatedAt` handling, omitted it everywhere.
  Root-caused by running the seed against a real reset database and
  reading the first `QueryFailedError`, then systematically auditing
  **every** entity touched by the seed script with `grep -c updatedAt
  <entity>.entity.ts` rather than fixing failures one at a time (the seed
  script's ~40-model breadth made a one-by-one loop impractical — this
  audit-then-patch-all approach is the natural refinement of the pattern
  Phase 13 established one-off). The 17 entities:
  `User`, `AgencyCreditLine`, `AircraftSeatMap`, `ClubTierRule`,
  `SurveySettings`, `CareersSettings`, `CustomerIdentityVerification`,
  `SavedPassenger`, `SavedBankAccount`, `CustomerReferral`, `BlogPost`,
  `SiteContentBlock`, `SiteRouteHighlight`, `SiteDestinationHighlight`,
  `FarePricingProposal`, `JobPosting`, `SecurityPolicy`,
  `InternalService`, `ExternalServiceConfig` (18 listed — one more than
  originally estimated; `AircraftSeatMap` was missed on the first pass and
  caught by a second failed seed run). Fixed by adding `updatedAt: new
  Date()` at every `.create()`/`upsertBy()`/`.update()` call site touching
  these entities — the same per-call-site discipline already used
  everywhere else in the codebase, not a new entity-level hook (a
  `@BeforeInsert()` hook would only cover inserts, not the `.update()`
  calls this script and every other service also need to keep current).
- **`.findOneBy({})` (Prisma's `findFirst()`-with-no-filter idiom) throws
  TS2589 on entities with a jsonb column**, the same class of bug as
  Phase 12's `price-lock.service.ts` finding on `.findOneBy(...)` with a
  real filter — confirmed here on `FlightInstance` (`aiSuggestion` jsonb)
  and `AgencyMembershipRequest` (`documents` jsonb). Fixed with the
  established query-builder `.getOne()` pattern in both cases (no `where`
  needed at all for the "any row" case, since query-builder has no
  hidden-`where` requirement — only `Repository.findOne()` does).
- **A new raw-SQL escaping trap in `.orderBy()` combined with a
  DISTINCT-wrapped join query**: `flightInstanceRepo.createQueryBuilder
  ('fi').leftJoin(FarePricingProposal, 'p', ...).orderBy('fi."departureAt"',
  'DESC').take(2)` (manually double-quoting the camelCase column, mirroring
  a style already present elsewhere in this codebase for `.where()`/
  `.andWhere()`/`.leftJoin()` conditions) produced `column
  distinctAlias.fi_"departureAt" does not exist` — TypeORM's own alias
  rewriter, invoked because `take()` + a join forces a
  `SELECT DISTINCT ... FROM (...) distinctAlias` wrapper, does its own
  regex substitution over the raw `.orderBy()` string and mishandles a
  pre-existing quote, doubling it. Every other `.orderBy()` call in this
  codebase (`grep -rn '\.orderBy(' src`, 20+ call sites) uses the plain
  unquoted `alias.camelCaseColumn` form and lets TypeORM's own metadata
  resolve+quote it — that form is required specifically for `.orderBy()`;
  the manually-quoted form still works fine for plain (non-DISTINCT-wrapped)
  `.where()`/`.andWhere()`/`.leftJoin()` conditions elsewhere in this file
  and was left as-is there.
- **Postgres/Redis were down at the start of this phase's verification
  cycle** (a container restart between sessions) — `pg_lsclusters`/`ps aux
  | grep redis` showed both stopped; `service postgresql start` +
  `redis-server --daemonize yes` brought them back before any reset/seed
  attempt. Unrelated to the migration itself, noted here only because it
  produced a misleading `ECONNREFUSED` on the first post-restart seed
  attempt that had nothing to do with the seed script's own correctness.
- **`ManagerReferral`'s nested Prisma relation-write
  (`recipients: {create: [...]}`) has no TypeORM equivalent as a single
  call** — split into a parent `.save()` followed by a plain loop of
  `ManagerReferralRecipient` inserts, each keyed by the now-known parent
  id. Not a new *class* of gap (every prior phase touching a 1:N without
  a cascade-configured relation did the same two-step split) but the
  first time this specific one-to-many (referral → recipients) needed it.
- **`.create()` with a jsonb-column value directly in the initial object
  literal does NOT trigger TS2589**, only `.findOneBy()`/`.findOne()`/
  `.update()` calls against entities carrying a jsonb column do. Confirmed
  empirically across every `.create()` in this file touching
  `ClubCardRequest.history`, `RefundRequest.history`,
  `ManagerReferral.attachments` (unused, still nullable) — all compiled
  clean. This resolves the open question noted at the end of Phase 13:
  the TS2589 class of bug is specific to instantiating TypeORM's
  `FindOptionsWhere<T>`/update-payload deep-partial types for a
  jsonb-bearing entity, not to `.create()`'s object-literal shape.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on `prisma/seed.ts` and the 4 entity files this
  phase touched (incidental `lint --fix` reformatting of unrelated files
  reverted with `git checkout --` before committing, same as every prior
  phase; the 2 pre-existing unrelated errors in
  `auth/dto/{request-otp,verify-otp}.dto.ts` are untouched by this phase).
- `npm test` (unit) — 71/71 passing (unaffected — no unit tests exercise
  the seed script directly).
- `npx prisma migrate reset --force` + `npx prisma db seed` (the new
  TypeORM-based script, run via the unchanged `tsx prisma/seed.ts` hook)
  — completes cleanly end-to-end against a freshly reset `blujet_test`,
  logging `Seed complete.` and the dev staff password, after three
  iterations fixing the `updatedAt`, `.findOneBy({})`/TS2589, and
  `.orderBy()` bugs documented above.
- `npm run test:e2e` — **465/465 passing** across all 54 suites (every
  suite's own `beforeAll`/fixture setup runs against the database this
  seed script populates, so a full green run is also an end-to-end proof
  the reseed didn't silently change any seeded data's shape).
- `git status` — touches only `prisma/seed.ts` and the 4 entities that
  gained a `@BeforeInsert()` id-generation hook this phase
  (`RefundPenaltyRule`, `AircraftSeatMap`, `Permission`, `InternalService`
  — the other 5 entities audited in the same sweep,
  `AgencyProfile`/`AgencyCreditLine`/`ManagerReferralRecipient`/
  `SiteContentBlock`/`SecurityPolicy`, turned out to need no hook since
  their primary keys are FK columns, a composite FK pair, an enum
  literal, or a fixed integer literal respectively — never a
  generated UUID) plus this doc.

## What's next

The e2e test-fixture layer: every `test/*.e2e-spec.ts` file still creates
its own fixtures via a raw `PrismaClient` (e.g. `survey.e2e-spec.ts`'s
`new PrismaClient({adapter: new PrismaPg(...)})`) — this is a large,
dedicated phase given the number of files, and the natural next step now
that the seed script itself no longer depends on Prisma. After that:
infra/CI/Prisma removal (delete `prisma/` dir, `generated/prisma/`,
`PrismaModule`, `@prisma/*` deps, update Dockerfile/CI to TypeORM
migrations), then the final `CLAUDE.md` update reflecting the TypeORM
switch plus a migration summary doc. Prisma remains the active ORM for
every e2e fixture; nothing removed until the dedicated Prisma-removal
phase.
