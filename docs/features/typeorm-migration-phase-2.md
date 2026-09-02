# TypeORM migration — Phase 2: full entity layer

Phase 2 of the Prisma → TypeORM migration plan (see
`docs/features/typeorm-migration-phase-0.md` for the entity-authoring
conventions this phase applies at scale, and the full 16-phase plan
discussed with the user). Delivers all 77 TypeORM entities matching
`prisma/schema.prisma`'s 77 models, wired into `DataSourceOptions`,
verified against the live database with **two independent gates**. No
service code touched, no schema mutation, no runtime behaviour change —
TypeORM is fully connected but still idle (`AppModule` does not import a
`DatabaseModule` yet).

## How the entities were produced

Given the scale (77 tables, 700+ columns, 110 foreign keys, 106 indexes),
entities were generated from the live database's own metadata
(`information_schema`/`pg_catalog`) plus a parse of `schema.prisma` for
model↔table names and `@relation` field names, rather than hand-written —
exactly as the migration plan recommended ("generate, don't hand-write").
The one-off script lives at `backend/scripts/generate-entities.py`
(throwaway, deleted once Prisma is fully removed in Phase 14) and encodes
every Phase 0 convention: `@Index({unique:true})` never `@Unique()`,
`updatedAt` as a plain `@Column` (never `@UpdateDateColumn`), explicit
`enumName` on every enum column, `bigintTransformer` on every `bigint`
column, literal (never raw-SQL-function) defaults on enum columns.

Relations: every foreign-key-owning side got an explicit `@ManyToOne` +
`@JoinColumn({ name, foreignKeyConstraintName })` (110 total), matching
Prisma's exact FK constraint names. Inverse `@OneToMany` sides were
**not** generated — they're pure metadata with no schema-parity
consequence, and are added on demand as each module's service code is
converted in later phases (per the plan's explicit scoping call).

## New findings beyond Phase 0

Getting a genuinely clean diff at 77-table scale surfaced three more
TypeORM behaviours that weren't visible in Phase 0's 4-entity sample:

1. **FK constraint naming.** Without an explicit `foreignKeyConstraintName`
   on `@JoinColumn`, TypeORM auto-generates a hash-based name
   (`FK_51d635f1d983d505fb5a2f44c52`) and doesn't recognize Prisma's
   existing, differently-named constraint (`users_createdById_fkey`) as
   the same relationship — it proposes adding a second, redundant FK
   alongside the real one rather than leaving it alone. Fixed by passing
   `foreignKeyConstraintName: '<table>_<column>_fkey'` (Prisma's exact
   convention) on every `@JoinColumn`.
2. **Primary key constraint naming.** Same class of issue for PKs:
   TypeORM's default `@PrimaryColumn()` gets an auto-generated
   `PK_<hash>` name instead of Prisma's `<table>_pkey`. Fixed with the
   `primaryKeyConstraintName` option (works for both single-column and
   composite PKs — verified on `ManagerReferralRecipient`).
3. **Index churn as a side effect of column ALTERs.** A column-level
   change that's otherwise benign (the already-known `now()` vs
   `CURRENT_TIMESTAMP` default mismatch) can make TypeORM's schema
   builder drop and recreate any index that references that column, even
   though the index's own definition is unchanged. `schema-parity.e2e-spec.ts`
   now treats a `DROP INDEX` + `CREATE INDEX` pair sharing the same index
   name as a no-op rather than hand-allowlisting each affected table.

## Verification — two independent gates, both green

- **Gate A** (`test/schema-parity.e2e-spec.ts`, in the e2e suite):
  boots a standalone `DataSource` against the live e2e database and
  asserts TypeORM's schema builder has nothing to do beyond the
  documented-benign patterns above. Passes for all 77 entities together.
- **Gate B** (`pg_dump -s` cross-check, run manually for this phase, not
  committed as a repeatable test): applied Prisma's 49 migrations to one
  throwaway database and `synchronize: true`'d the 77 entities into a
  second throwaway database, then diffed `pg_dump -s --no-owner --no-acl`
  output for both. The only remaining differences are the same
  already-understood default-literal spellings Gate A allowlists, plus
  Prisma's own internal `_prisma_migrations` bookkeeping table (not part
  of the entity graph). This is strictly stronger evidence than Gate A
  alone — it proves the entities reproduce Prisma's actual DDL, not just
  what TypeORM's in-memory diff engine considers equivalent.

## Verification — full suite

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 2 file (2 pre-existing errors /
  13 pre-existing warnings elsewhere, unrelated to this phase).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — 465/465 passing (the pre-existing 464-test suite,
  completely untouched, plus `schema-parity.e2e-spec.ts`), reproduced
  against a freshly reset + reseeded database.
- `git status` — only `backend/package.json`-adjacent additions from
  Phase 0/1, the 77 new entity files, `enums/index.ts` (already full from
  Phase 1), `json-types.ts`, `data-source.options.ts`, the codegen
  script, and this doc. Zero existing application files modified.

## What's next

Phase 3 (per the plan): the shared helpers (`findOneOrThrow`,
`isUniqueViolation`/`constraintName`, `bigintTransformer`'s `irrFromRaw`
counterpart) plus the first reference module conversion (`contact` — the
smallest, simplest module) to establish the pattern every later phase
copies. `DatabaseModule` gets registered in `AppModule` alongside
`PrismaModule` at that point, not before.
