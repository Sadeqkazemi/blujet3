# TypeORM migration — Phase 7: flight/pricing read side (pricing, flightops, webservice-pricing, passenger-reports)

Phase 7 of the Prisma → TypeORM migration plan. Converts the CEO/Commercial
fare-pricing-proposal workflow (incl. the ML advisory pricing suggestion
loop), the نیرا manifest-submission ops board, IT Manager's webservice
plan pricing, and the finance/commercial passenger search report.
`flights.service.ts` (1238 lines — the domain-critical flight/inventory/
seat-map engine) is deliberately **not** in this batch; it's large and
risk-sensitive enough to warrant its own dedicated phase.

## Modules converted

1. **`pricing`** — `PricingService` (385 lines): CEO pending/registered
   proposal lists, Commercial's SCHEDULED-instances-joined-with-proposal
   view, propose/edit a fare (`upsertProposal`), CEO legal-rate PATCH,
   step-up-gated registration (`register`, PROPOSED or AI source, with
   the AI-suggestion-must-not-exceed-legal-rate guard), the dev-only test-
   instance helper, and the advisory ML analysis loop
   (`runAiAnalysis`) that persists `aiSuggestion` without ever touching
   price/status itself.
2. **`flightops`** — `FlightopsService` (166 lines): the نیرا ops board —
   per-instance sold/free counts (manual grouped `COUNT(*)`, no
   `loadRelationCountAndMap`), lazy 4h-before-departure manifest
   submission with a conditional-update double-submit guard, and the
   flight detail/manifest view.
3. **`webservice-pricing`** — `WebservicePricingService` (69 lines):
   IT Manager's 1/3/12-month webservice plan price editor, backed by the
   same `SystemSetting` KV store as Phase 4's settings module (same
   existence-check + create/save pattern, since `.upsert()` risks the
   established JsonValue/TS2589 bug).
4. **`passenger-reports`** — `PassengerReportsService` (87 lines):
   finance/commercial passenger search by name or national-ID hash, with
   seat→cabin resolution via the aircraft seat map and masked national ID
   in every response.

## New findings

- **Two more entities were missing their `@BeforeInsert()` UUID hook**,
  caught only by the e2e suite (never by `tsc`, same class of bug as
  Phase 6's `ManagerReferral` miss): `FarePricingProposal` — every
  `PUT /pricing/flights/:id/proposal` for a brand-new proposal failed
  with a Postgres `23502 null value in column "id"` violation — and
  `FlightInstance` — the first TypeORM-based creation path for this
  entity is `PricingService.createTestInstance()` (real instance
  creation still belongs to the unconverted `flights` module). Both
  fixed with the standard `@BeforeInsert() generateId() { this.id ??=
  randomUUID(); }` hook. Confirmed the exact failure mode with a
  standalone repro script against a real `DataSource` before touching
  the entity, rather than guessing from the 500 alone.
- **A joined relation's own columns must include its primary key when
  `addSelect`ed, or the query throws/misbehaves at runtime — `tsc` gives
  no warning.** Hit in `passenger-reports.service.ts`'s search query
  (`fi`/`flight`/`route`/`booking` all `addSelect`ed for display fields
  without their `id`) and in `flightops.service.ts`'s `detail()` manifest
  query (`booking.pnr` selected without `booking.id`) — both produced a
  500 until the primary-key columns were added to each `addSelect` array.
  Cross-checked against Phase 6's `reporting.service.ts`, where a
  single-level `addSelect(['booking.channel'])` (no `booking.id`) is
  confirmed still passing 465/465 — so the requirement isn't universal
  for every joined column, but it's safest to always include the joined
  entity's primary key in `addSelect` once any of its own columns are
  selected, rather than relying on knowing which shape happens to work.
- **A class with a `@BeforeInsert()` method can no longer be produced via
  object-literal spread (`{ ...entity, field: value }`) without a type
  error**, since the spread loses the class's prototype methods.
  `flightops.service.ts`'s `materializeNiraSubmission()` used to return
  `{ ...instance, niraSubmittedAt }`; once `FlightInstance` gained its
  hook this phase, the correct fix is to mutate the fetched entity
  in place (`instance.niraSubmittedAt = submittedAt; return instance;`)
  rather than spread it.
- **`FarePricingProposal` ↔ `FlightInstance` is one-to-one with no
  inverse declared** (`fare_pricing_proposals_flightInstanceId_key` is
  unique, but `FlightInstance` has no `pricing` relation back) — same
  "no inverse relation" shape as `AgencyProfile` ↔ `User` (Phase 5) and
  `AgencyProfile` ↔ `AgencyInvoice` (Phase 6). `listForCommercial()` is
  ported as two independent queries (SCHEDULED instances, then proposals
  `WHERE flightInstanceId IN (...)`) merged via a `Map`.
- **Assigning a strongly-typed value to a `JsonValue`-typed column still
  needs an explicit cast**, even on a plain property assignment (not just
  `.update()`/`.upsert()`): `target.aiSuggestion = suggestion as unknown
  as typeof target.aiSuggestion` in `runAiAnalysis()` — TypeScript
  correctly refuses the direct assignment since `PersistedAiSuggestion`
  has no index signature satisfying `JsonValue`'s structural constraint.
- **Prisma's `undefined`-omits-the-field update semantics must be ported
  explicitly.** `upsertProposal()`'s original Prisma `update: {
  legalRateIrr: dto.legalRateIrr, note: dto.note, ... }` left those fields
  unchanged when the DTO field was `undefined` (Prisma strips `undefined`
  keys from `data`); the TypeORM entity-mutation equivalent needs an
  explicit `if (dto.legalRateIrr !== undefined) existing.legalRateIrr =
  dto.legalRateIrr;` guard per field, or assigning `undefined` directly
  would have no such special handling and could behave differently
  depending on the ORM's partial-update mechanics.
- Local dev/test database split (`blujet_test` vs `blujet`, discovered
  Phase 6) continues to apply: every reset+seed this phase targeted
  `blujet_test` via an explicit `DATABASE_URL` override.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 7 file (incidental `lint --fix`
  reformatting of unrelated files reverted with `git checkout --` before
  committing).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — **465/465 passing** against a freshly reset +
  reseeded `blujet_test` database, covering the full pricing proposal
  lifecycle (propose → edit → legal-rate → AI analysis → register by
  PROPOSED or AI source → lock → 409 on further edits/registers,
  including the AI-above-legal-rate rejection and ml-service-down
  graceful degradation), flightops (list/detail, نیرا lazy submission,
  sold/free counts), webservice plan pricing, and passenger-reports
  search (name substring, national-ID hash exact match, masked ID,
  cabin resolution).
- `git status` — touches only the 4 converted modules' service/module
  files, the 2 entities that gained `@BeforeInsert()` this phase
  (`FarePricingProposal`, `FlightInstance`), and this doc. Zero unrelated
  application files.

## What's next

Phase 8 (per the plan): `flights.service.ts` (1238 lines) — the
domain-critical flight/inventory/seat-map engine, on its own given its
size and CLAUDE.md's "Flight Engine & Booking Rules" invariants (pricing
separate from availability, re-price-before-payment, `SELECT ... FOR
UPDATE`/optimistic-locking double-booking guarantees). Then
`agencies`/`agency-portal` (first pessimistic-lock conversion), `refunds`,
`reservation` (seat locks), `booking-engine` + `customer-referrals`
together (shared-transaction boundary, riskiest phase), then the
remaining smaller modules, the seed script, e2e fixture layer, and
Prisma removal. Prisma remains the active ORM for every module not yet
converted; nothing removed until the dedicated Prisma-removal phase.
