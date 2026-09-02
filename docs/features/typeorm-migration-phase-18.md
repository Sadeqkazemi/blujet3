# TypeORM migration — Phase 18 (final)

Generates a baseline TypeORM migration from the live schema, wires
`migration:run` into every path that used to run `prisma migrate deploy`
(dev, CI, Docker), and removes Prisma entirely from the repository and
infrastructure. This is the final phase of the Prisma → TypeORM migration
that began in Phase 0 — the codebase, test suite, and deploy pipeline no
longer have any dependency on Prisma.

## Baseline migration

- Generated `src/database/migrations/1785824221751-InitialSchema.ts` via
  `typeorm migration:generate` against an **empty** scratch database
  (`blujet_migration_gen`), diffed against all 77 entities.
- **Bug found and fixed in the generated output**: TypeORM's
  `migration:generate` does not dedupe a Postgres enum type shared by more
  than one entity — 5 enum names used by 2+ entities each
  (`AgencyApiScope`, `BookingChannel`, `CabinClass`, `ClubTier`, `Role`)
  produced duplicate `CREATE TYPE`/`DROP TYPE` statements, which fails at
  migration-run time with `type "X" already exists`. Fixed by a one-off
  script: keep the **first** `CREATE TYPE` occurrence per name in `up()`
  (later duplicates are redundant), and keep the **last** `DROP TYPE`
  occurrence per name in `down()` (since `down()` replays `up()` in
  reverse, the last occurrence is guaranteed to run only after every table
  referencing that type has already been dropped). Verified: 58 unique
  enum names, 58 `CREATE TYPE`, 58 `DROP TYPE`, zero duplicates.
- **Correctness verification** (not just "it ran without error"): applied
  the migration to a fresh empty database and diffed its resulting schema
  against the live Prisma-migrated `blujet_test` database via three
  independent `information_schema`/`pg_indexes` queries:
  - Table list: 77 vs 77, byte-identical.
  - Columns (`table.column:type:nullable` for all 700 columns): byte-identical.
  - Indexes (`indexname, indexdef` for all 183 indexes): byte-identical.
  110 foreign-key constraints applied cleanly with no errors.
- `dataSourceOptions.migrations` changed from `[]` to
  `[__dirname + '/migrations/*{.ts,.js}']` — resolves to `.ts` files under
  `ts-node` (dev/CLI) and to the compiled `.js` files under `dist/`
  (production), with no separate config needed for either environment.
- `src/database/data-source.ts` (the `typeorm` CLI entry point) now
  imports `dotenv/config` explicitly, since it runs as a standalone script
  outside Nest's `ConfigModule` and needs to load `.env` on its own — this
  is what `prisma.config.ts` used to do for the Prisma CLI.
- `test/schema-parity.e2e-spec.ts` (added in Phase 0 to assert the
  entities exactly describe the live Postgres schema, originally run
  against the Prisma-migrated database) still passes unchanged against
  the schema this migration itself creates — it now doubles as a
  regression guard against the entities and the migration drifting apart.

## Wiring `migration:run` everywhere `prisma migrate deploy` used to run

- `package.json` scripts: removed `postinstall: prisma generate` and the
  `prisma.seed` config block; added `migration:generate`, `migration:run`,
  `migration:revert` (all via `typeorm-ts-node-commonjs`, for dev/CI) and
  `migration:run:prod` / `seed:prod` (plain `typeorm`/`node` against the
  compiled `dist/` output, for the production image — no `ts-node`
  dependency at runtime).
- `backend/docker-entrypoint.sh`: `npx prisma migrate deploy` →
  `npm run migration:run:prod`; `npx tsx prisma/seed.ts` → `npm run seed:prod`.
- `backend/Dockerfile`: dropped the `npx prisma generate` build step and
  the `prisma`/`generated`/`prisma.config.ts` copy steps (migrations now
  compile straight into `dist/` alongside everything else, so no extra
  `COPY` is needed for them).
- `.github/workflows/deploy.yml`: `npx prisma generate` + `npx prisma migrate
  deploy` → `npm run migration:run`.
- `docs/RUNBOOK.md` and `CLAUDE.md` (Tech Stack, Repository Structure,
  Workflow, Deployment, and Commands sections): updated every Prisma
  command/path reference to its TypeORM equivalent.

## Removing Prisma from the repo

- `backend/prisma/schema.prisma` and `backend/prisma/migrations/*.sql`
  (52 migration files) — deleted. The baseline TypeORM migration is now
  the sole source of schema history going forward.
- `backend/prisma/seed.ts` → moved to `backend/src/database/seed.ts`
  (already fully TypeORM-based since Phase 14; only its file location and
  relative imports changed). `npm run seed` now points here.
- `backend/prisma.config.ts` — deleted.
- `backend/src/prisma/` (`PrismaModule`, `PrismaService`) — deleted; no
  longer imported anywhere (`AppModule` no longer imports `PrismaModule`).
- `backend/generated/prisma` (the generated Prisma client) — deleted
  (was already gitignored, so this only affects the local working copy).
- `@prisma/client`, `@prisma/adapter-pg` removed from `dependencies`;
  `prisma` removed from `devDependencies`. `dotenv` moved from
  `devDependencies` to `dependencies` (needed at runtime by
  `data-source.ts` in the production image).
- Fixed the one remaining real (non-comment) Prisma-generated-client
  import in application code: `agencies.controller.ts` imported
  `AgencyMembershipStatus` from `../../../generated/prisma/enums` — now
  imports from `../../database/enums` (the TypeORM-side enum mirror that's
  existed since Phase 0).
- Left historical comments that reference "Prisma" as documentation of
  *why* a piece of code looks the way it does (e.g. `pg-errors.ts`
  explaining it replaces `PrismaClientKnownRequestError`/`P2002`
  handling) — these describe design rationale, not a live dependency, and
  deleting them would lose useful context for readers unfamiliar with the
  migration history.

## Verification

Full loop run at the end, after every change above landed:

- `npx tsc --noEmit -p tsconfig.json` — clean, zero errors.
- `npm run lint` — clean; only the 2 pre-existing errors and handful of
  warnings in files this migration never touched (confirmed via `git
  status`), same as every prior phase.
- `npm test` (unit) — 71/71 passing, 16/16 suites.
- Full clean-room e2e run: dropped and recreated `blujet_test` from
  scratch, ran `npm run migration:run` (TypeORM only, zero Prisma
  involvement anywhere in the loop), ran `npm run seed`, then
  `npm run test:e2e` — **465/465 passing, 54/54 suites**.

This closes out the Prisma → TypeORM migration. `grep -ri prisma
backend/src backend/test` now returns only historical-context comments —
no imports, no config, no runtime dependency.
