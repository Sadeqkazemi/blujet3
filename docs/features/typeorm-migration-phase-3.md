# TypeORM migration — Phase 3: first live conversions

Phase 3 of the Prisma → TypeORM migration plan. `DatabaseModule` goes live
in `AppModule` (registered alongside `PrismaModule`, not replacing it),
and the first 5 modules — deliberately the smallest, simplest ones — are
converted from `PrismaService` calls to TypeORM repositories. This is the
reference conversion every later phase copies the pattern from.

## Shared helpers added

- `src/database/database.module.ts` — `@Global()` module wrapping
  `TypeOrmModule.forRoot(dataSourceOptions)`, mirroring `PrismaModule`'s
  shape. Individual feature modules additionally import
  `TypeOrmModule.forFeature([...])` for `@InjectRepository` as they
  convert.
- `src/database/utils/find-one-or-throw.ts` — mirrors Prisma's
  `findUniqueOrThrow`/`findFirstOrThrow`. Throws a plain `Error` (not an
  `HttpException`) so `AllExceptionsFilter` still maps a miss to
  500/INTERNAL_ERROR, matching Prisma's own behaviour. Not yet consumed by
  a call site — Phase 3's 5 modules didn't need it — but ready for
  modules that use `findUniqueOrThrow` as an invariant assertion.
- `src/database/utils/pg-errors.ts` — `isUniqueViolation(err)` /
  `constraintName(err)`, replacing
  `PrismaClientKnownRequestError`/`P2002` checks via Postgres SQLSTATE
  `23505` on `QueryFailedError`. Not yet consumed — no Phase 3 module hits
  a unique constraint on write — but ready for later phases (e.g.
  `support-tickets`'s tracking-code collision retry).

## Modules converted

1. **`contact`** — `submit()`/`listRecent()`. Reference exemplar: create +
   save, `find` with `order`/`take`.
2. **`staff-directory`** — `list()`. `In()`/`Not()` operators replace
   Prisma's `{ in: [...] }`/`{ not: ... }`.
3. **`flight-status`** — `lookup()`. The only non-trivial one: Prisma's
   `mode: 'insensitive'` equals has no TypeORM find-options equivalent,
   so this uses `createQueryBuilder` with `ILIKE` (a bare `ILIKE`, no `%`
   wildcards, is an exact case-insensitive match — same semantics as
   Prisma's `equals` + `insensitive`) plus `innerJoinAndSelect` for the
   two-level `flight.route` relation.
4. **`manager-messages`** — `send()`/`sent()`.
5. **`files`** — `store()`/`canRead()`/`read()`. `canRead()`'s Prisma
   `attachments: { array_contains: fileId }` filter (on
   `ManagerReferral`, `ManagerReferralReport`, `ManagerMessage`) has no
   TypeORM find-options equivalent either — replaced with a raw
   `createQueryBuilder().where('"attachments" @> :fileIdJson::jsonb', …)`
   using Postgres's native jsonb containment operator, which is exactly
   what `array_contains` compiles to under the hood.

## New findings

- **UUID generation gap.** Prisma generated `@default(uuid())` primary
  keys client-side; the Phase 2 entities had no equivalent, since Phase 2
  only proved schema parity and never wrote a row via TypeORM. Solved
  per-entity, added only as each entity's owning module gets its first
  `.create()`/`.save()` call site: a `@BeforeInsert()` hook —
  `this.id ??= randomUUID()` — on `ContactMessage`, `ManagerMessage`, and
  `StoredFile`. The `??=` guard keeps it a no-op for the eventual
  migration-import path, where rows may already carry an id.
- **Missing inverse relation.** Phase 2 deliberately generated only the
  FK-owning `@ManyToOne` sides (schema parity has no use for inverse
  `@OneToMany`s). `files.service.ts`'s `canRead()` needed
  `ManagerReferral.recipients` for eager-loading via
  `leftJoinAndSelect('referral.recipients', …)`, so it was added now, on
  demand, exactly as Phase 2's doc predicted later phases would need to.
- **Cross-entity JSON containment has no query-builder shortcut.** Confirmed
  during implementation, not just anticipated: TypeORM's `FindOptionsWhere`
  has no operator for jsonb containment (unlike Prisma's
  `array_contains`), so any future module touching a `Json`-typed
  "list of ids" column needs the same raw `@>` pattern, not a `Like`/`In`
  substitute.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 3 file (same 2 pre-existing
  errors / 13 pre-existing warnings elsewhere as Phase 2, unrelated to
  this phase; incidental `lint --fix` reformatting of unrelated files was
  reverted with `git checkout --` before committing, per the established
  discipline).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — **465/465 passing**, run twice against a freshly
  reset + reseeded database: once right after `DatabaseModule` was wired
  into `AppModule` (before any service code changed, to isolate "does a
  second live DB connection pool break anything" from "did the
  conversions break anything"), and once again after all 5 module
  conversions landed. Both runs green, zero regressions either time.
- `git status` — touches only `app.module.ts`, the 4 new/touched
  entities (`ContactMessage`, `ManagerMessage`, `ManagerReferral`,
  `StoredFile`), the 5 converted modules' `.module.ts`/`.service.ts`
  pairs, and the two new `database/utils/*` helpers. Zero unrelated
  application files.

## What's next

Phase 4 (per the plan): the next batch — read-mostly content & config
modules (audit, settings, site-content, panels, admins, etc.) — following
the same pattern established here. Prisma remains the active ORM for
every module not yet converted; nothing is removed until Phase 14.
