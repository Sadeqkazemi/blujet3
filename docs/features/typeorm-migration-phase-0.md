# TypeORM migration — Phase 0 spike findings

Phase 0 of the Prisma → TypeORM migration (see the full 16-phase plan
discussed with the user). Goal: answer every open technical question about
mapping TypeORM entities onto the *existing* Prisma-created schema, before
writing the other 73 entities and touching any of the 36 business modules.

**Scope of this phase:** 4 hand-written entities (`ContactMessage`,
`SeatLock`, `FareRule`, `CareersSettings`) chosen to cover the hardest
cases in the schema, plus a Gate A test (`test/schema-parity.e2e-spec.ts`)
that boots a standalone TypeORM `DataSource` (not through Nest DI —
`AppModule` is untouched) and asserts the schema builder has nothing to do
against the live, Prisma-migrated database. No service code was touched;
zero runtime behaviour change.

## Findings

### 1. Composite/named uniques: `@Index({ unique: true })`, never `@Unique()`

Verified directly against `pg_constraint`: Prisma's `@@unique`/`@unique`
always compiles to a plain `CREATE UNIQUE INDEX`, **never** an
`ADD CONSTRAINT ... UNIQUE`. TypeORM's `@Unique()` decorator always
generates a real constraint — even with a matching name, it diffs forever
(TypeORM tries to `DROP CONSTRAINT`/re-`ADD CONSTRAINT`, sees an index of
the same name that isn't a constraint, and gets confused). Every composite
unique across all 77 models must use:

```ts
@Index('exact_name_from_migration_sql', ['colA', 'colB'], { unique: true })
```

Same applies to single-column unique columns — do not use
`@Column({ unique: true })` shorthand either; use an explicit named
`@Index(..., { unique: true })` so the constraint/index name matches
Prisma's `..._key` convention exactly.

### 2. Partial unique index — decorator route works cleanly

`seat_locks_active_seat_unique` (`UNIQUE ON (flightInstanceId, seatCode)
WHERE "releasedAt" IS NULL`) — the schema's only hand-written DDL with no
plain Prisma-schema equivalent — round-trips with **zero diff** using:

```ts
@Index('seat_locks_active_seat_unique', ['flightInstanceId', 'seatCode'], {
  unique: true,
  where: '"releasedAt" IS NULL',
})
```

Route (a) from the original open question is confirmed. No hand-written
migration needed for this index in Phase 2.

### 3. `@UpdateDateColumn` — don't use it; plain `@Column`, no default

Live-DB check (`\d careers_settings`) confirms Prisma's `@updatedAt` sets
the value client-side on every write — the column has **no** DB default,
unlike `createdAt`'s `DEFAULT CURRENT_TIMESTAMP`. `@UpdateDateColumn` wants
a DB default and diffs against a no-default column. Resolution: every
`@updatedAt` field (23 across the schema) becomes a plain
`@Column({ type: 'timestamp', precision: 3 })` with **no** default, and the
service layer must set `updatedAt: new Date()` explicitly on every write in
Phase 2+ — the same discipline Prisma gave for free. Flag this explicitly
in every phase's review (grep for `.update(`/`.save(` on `updatedAt`-bearing
entities).

### 4. `CURRENT_TIMESTAMP` vs `now()` — known TypeORM normalization quirk (allowlisted)

`@CreateDateColumn`/timestamp defaults need `default: () => 'CURRENT_TIMESTAMP'`
to match Prisma's DDL. TypeORM's own `normalizeDatetimeFunction()` then
rewrites a precision-less `CURRENT_TIMESTAMP` to `"now()"` internally — but
its schema-*introspection* path does not reciprocally normalize a live
`CURRENT_TIMESTAMP` default before comparing. Verified via
`SELECT pg_get_expr(...)` on `pg_attrdef` directly: the DB's actual stored
default is `CURRENT_TIMESTAMP`, functionally identical to `now()` on a
`timestamp without time zone` column — Postgres does not distinguish them
at execution time. This produces a permanent, semantically-meaningless
`SET DEFAULT now()` diff. **Allowlisted** in `schema-parity.e2e-spec.ts`
rather than "fixed," since there is no entity-side spelling that avoids
TypeORM's own normalization. (A one-time `ALTER COLUMN ... SET DEFAULT
now()` — genuinely harmless, same runtime behaviour — would make the diff
truly empty; deferred to Phase 2, since Phase 0 promised zero schema
mutations.)

### 5. Enum-array defaults: literal array value, not a raw-SQL function — and a real TypeORM bug

`FareRule.allowedChannels` (`BookingChannel[]`) is the one enum-array
column in the schema. Two findings:

- **`default: () => 'raw sql'` is silently broken for `type: 'enum'`
  columns** (array or scalar) in this TypeORM version. `PostgresDriver
  .normalizeDefault()` checks `columnMetadata.type === "enum"` *before* it
  checks `typeof defaultValue === "function"` — so for an enum column, a
  function-typed default is `` `'${defaultValue}'` `` — i.e. the function's
  own `.toString()` source is used as the literal default value. This
  silently produced `SET DEFAULT '() => \`ARRAY[]::"BookingChannel"[]\`'`
  in an early Phase 0 run. **Never use a function-returning-raw-SQL default
  on an enum-typed column** (scalar or array) — provide a literal instead.
- With `default: []` (a literal empty array), the diff becomes a benign
  textual mismatch: TypeORM emits `'{}'`, Prisma's migration wrote
  `ARRAY[]::"BookingChannel"[]` — both are the same empty array, different
  valid Postgres literal spellings. Allowlisted in the parity test for the
  same "genuinely equivalent, not worth a DB touch in Phase 0" reason as
  finding 4.

The column *type* declaration itself (`{ type: 'enum', enum: X, enumName:
'X', array: true }`) round-trips cleanly — only the default-value
comparison is affected. Confirms the original open question's "try it
first" recommendation; no allowlist needed for the type/array shape.

### 6. FK-constraint diffs are expected until Phase 2's full entity set lands

Every FK column in `SeatLock`/`FareRule` (`flightInstanceId`, `lockedById`,
etc.) is declared as a plain scalar `@Column`, not a `@ManyToOne` relation,
because the target entities (`User`, `FlightInstance`, `Booking`) don't
exist in this 4-entity spike. TypeORM sees the live FK constraints with no
matching entity metadata and proposes dropping them. **This is expected
and allowlisted** (`DROP CONSTRAINT ".+_fkey"`) — it is not evidence of a
column-mapping error, and it goes away once Phase 2 defines the full
77-entity graph with relations together. Gate A per-table isolation testing
is therefore only fully meaningful once the complete entity set exists;
individual entities can still be trusted for their *own* column types,
defaults, and indexes before that.

## Entity-authoring conventions (for Phase 2's 73 remaining entities)

| Concern | Convention |
|---|---|
| Table name | `@Entity('exact_table_name')` — always explicit |
| Column name | Omit `name:` — default naming strategy already preserves camelCase; do **not** install `SnakeNamingStrategy` |
| Strings | `@Column({ type: 'text' })` — always explicit (default `varchar` diffs) |
| Timestamps | `@Column({ type: 'timestamp', precision: 3 })` (not `timestamptz`) |
| `createdAt` | `@CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'CURRENT_TIMESTAMP' })` — expect the benign `now()` diff, allowlist it |
| `updatedAt` | Plain `@Column({ type: 'timestamp', precision: 3 })`, **no** `@UpdateDateColumn`, no default — set explicitly on every write |
| Enums | `@Column({ type: 'enum', enum: X, enumName: 'X' })` — `enumName` mandatory, must equal the Postgres type name Prisma created |
| Enum arrays | Add `array: true`; give literal defaults only, never a raw-SQL function default |
| Money | `@Column({ type: 'bigint', transformer: bigintTransformer })` — see `src/database/transformers/bigint.transformer.ts` |
| JSON | `@Column({ type: 'jsonb' })` |
| String/other arrays | `@Column({ type: 'text', array: true })` |
| UUID PK | `@PrimaryColumn({ type: 'text' })` + a `@BeforeInsert` assigning `randomUUID()` (Prisma generates UUIDs client-side; no DB default exists) |
| Composite/named unique | `@Index('exact_name', [...cols], { unique: true })` — **never** `@Unique()` or `@Column({ unique: true })` (finding 1) |
| Partial index | `@Index('name', [...cols], { unique: true, where: '"col" IS NULL' })` — confirmed working (finding 2) |
| FK actions | `@ManyToOne(..., { onDelete: 'CASCADE' })` matching Prisma's `onDelete` exactly |

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 0 file (2 pre-existing errors /
  13 pre-existing warnings elsewhere, unrelated to this phase).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — 464/464 passing (pre-existing suite, untouched) plus
  the new `schema-parity.e2e-spec.ts`.
- `git status` — only `backend/package.json`/`package-lock.json` (new
  deps) and new files under `backend/src/database/`,
  `backend/test/schema-parity.e2e-spec.ts`, and this doc. Zero existing
  files modified.
