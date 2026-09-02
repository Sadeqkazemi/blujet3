# TypeORM migration — Phase 4: read-mostly content & config batch

Phase 4 of the Prisma → TypeORM migration plan. Converts the next 5
modules from Prisma to TypeORM: `audit`, `panels`, `settings`,
`site-content`, `admins` — chosen as a batch because they're mostly
read-heavy, config/content-shaped, and (with the exception of `admins`)
low-risk. `admins` was kept in this batch rather than deferred because it
shares `panels`/`audit` as dependencies and is still outside the
booking/payment critical path.

## Modules converted

1. **`audit`** — `record()`/`managerReports()`/`systemLogs()`/
   `systemLogsBadgeCount()`/`ceoSystemEvents()`. `managerReports()`'s
   Prisma `OR` + conditional-spread `where` was rebuilt as an imperative
   `FindOptionsWhere` object (mutated field-by-field, not spread-merged) —
   seemingly cosmetic, but necessary: see "New findings" below.
2. **`panels`** — `getNav()`/`getEmployeeContext()`/`getAccessFlags()`/
   `setAccessFlag()`/`assertPanelEnabledForSelf()`. First real use of
   `findOneOrThrow` (Phase 3's helper, unused until now) for
   `user.findUniqueOrThrow`. Nested `select` on a relation
   (`employeePermission.permission.key`) uses TypeORM's
   `relations` + nested `select` combination.
3. **`settings`** — `getAll()`/`update()`/`updateRefundRules()`. See
   "New findings" for why `update()` ended up as an explicit
   find-then-save instead of `.upsert()`.
4. **`site-content`** — the largest of the five: library assets, content
   blocks, destination/route highlights, public home aggregation, public
   media serving. Touches 7 entities including `BlogPost` (owned by the
   not-yet-converted `blog` module — entities aren't module-scoped, so
   importing it here is normal, not a layering violation).
5. **`admins`** — the riskiest of the batch: creates `User` rows (first
   `.create()`/`.save()` on `User` in the migration — added its
   `@BeforeInsert()` UUID hook here), and needed a live-session count
   (`_count.refreshTokens` in Prisma) with no direct TypeORM equivalent
   in this project's TypeORM version — see below.

## New findings

- **No `loadRelationCountAndMap` in this TypeORM version.** Prisma's
  `_count.select.refreshTokens` (admins.service.ts's "online" derivation)
  has a documented TypeORM analog, `SelectQueryBuilder.loadRelationCountAndMap()`
  — except it doesn't exist on this project's installed `typeorm` build
  (confirmed via the `.d.ts` — only `loadRelationIdAndMap` is present).
  Replaced with two plain queries: fetch the managed admin rows, then a
  single grouped `COUNT(*) ... GROUP BY "userId"` query-builder call over
  `RefreshToken` filtered to unrevoked/unexpired, merged in JS via a
  `Map<userId, count>`. Two round-trips instead of one join, but avoids
  depending on an API this environment's TypeORM build doesn't ship, and
  is easy to verify correct by inspection.
- **`FindOptionsWhere<T>` blows up TypeScript's recursion limit when `T`
  has a recursive JSON-typed column, combined with conditional object
  spreads.** `AuditLog.category`/`actorRole` filtering via nested
  `...(cond ? {a} : {})` spreads (mirroring the original Prisma code
  structure) produced "Type instantiation is excessively deep and
  possibly infinite" once combined with `ILike(...)`-augmented array
  variants. Fixed by building the `FindOptionsWhere` object imperatively
  (`if (cond) base.x = y;`) instead of via chained conditional spreads —
  functionally identical, but doesn't force TS to compute the type of
  each intermediate spread. The same class of error hit `SystemSetting`
  even harder: its `value: JsonValue` column (a self-referential union)
  made `Repository.upsert()`'s `QueryDeepPartialEntity<SystemSetting>`
  un-instantiable for a literal object, and even a plain
  `findOneBy({ key })` (a `FindOptionsWhere<SystemSetting>`) triggered
  the same error. `settings.service.ts`'s `update()` was rewritten to
  avoid `FindOptionsWhere<SystemSetting>` entirely: the existence check
  uses `createQueryBuilder().where('s.key = :key', ...)` (raw SQL
  condition, no typed where-object), and the upsert-or-insert is a manual
  find-then-mutate-then-`save()` / `create()`-then-`save()` pair — `save()`
  on a concrete entity instance doesn't hit the same recursive-type path
  a literal-object `upsert()` call does.
- **Case-insensitive `contains` still has no find-options shortcut**
  (same class of gap as Phase 3's `flight-status` `ILIKE`
  finding) — `audit.managerReports()`'s `q` search uses `ILike` from
  `typeorm` directly rather than a raw query-builder fragment this time,
  since it's a plain column comparison (no join), so the typed operator
  suffices.
- **Missing inverse relations, added on demand** (same pattern as Phase 3):
  `User.refreshTokens` (`@OneToMany` to `RefreshToken`) didn't exist —
  added for the `admins` module's session-count logic (ultimately not
  used directly once `loadRelationCountAndMap` turned out to be
  unavailable, but harmless metadata to keep since another later phase
  may want it).
- **UUID-generation gap closed for 4 more entities**: `AuditLog`,
  `User`, `SiteMediaAsset`, `SiteDestinationHighlight`,
  `SiteRouteHighlight` all got the same `@BeforeInsert() generateId()`
  pattern from Phase 3. `User` is the first entity in the migration with
  real production write traffic through TypeORM (admin account creation),
  not just a low-traffic content table.
- **Plain-`@Column` `updatedAt` (Prisma's `@updatedAt`) needed manual
  setting on every write**, confirmed again across `SystemSetting`,
  `PanelAccessFlag`, `SiteContentBlock`, `SiteDestinationHighlight`,
  `SiteRouteHighlight`, and `User` — consistent with Phase 0's documented
  convention, but this phase is the first with enough create+update
  call sites across enough entities to make it worth restating: every
  `.save()`/`.update()`/`.upsert()` call against one of these entities in
  this codebase must include `updatedAt: new Date()` explicitly, or the
  column silently goes stale (no DB-side trigger backs it, unlike
  `createdAt`'s `CURRENT_TIMESTAMP` default).

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 4 file (same 2 pre-existing
  errors / 13 pre-existing warnings elsewhere as Phases 2–3, unrelated;
  incidental `lint --fix` reformatting of unrelated files reverted with
  `git checkout --` before committing).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — **465/465 passing**, against a freshly reset +
  reseeded database.
- `git status` — touches only the 5 converted modules' `.module.ts`/
  `.service.ts` (+ 2 controllers' pure `generated/prisma` →
  `database/enums` import rewiring), the 6 entities that gained
  `@BeforeInsert()`/inverse-relation additions, and this doc. Zero
  unrelated application files.

## What's next

Phase 5 (per the plan): auth/profile/it-manager — still outside the
booking/payment critical path, but touching real session/token logic
for the first time (beyond `admins`' refresh-token revocation), so due
care on `StepUpService`/JWT-issuance code paths that must keep working
identically. Prisma remains the active ORM for every module not yet
converted; nothing removed until Phase 14.
