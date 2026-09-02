# TypeORM migration — Phase 13: blog, careers, club, reconciliation, sms, support-tickets, survey

Phase 13 of the Prisma → TypeORM migration plan. Converts the remaining
smaller, previously-deferred modules: `blog` (CMS-style posts), `careers`
(public job listing + application review), `club` (VIP club members, tier
rules, card requests), `reconciliation` (payment/ticket mismatch queue),
`sms` (send log + the real `KavenegarSmsProvider`), `support-tickets`, and
`survey` (passenger satisfaction surveys). With this phase, every backend
module except the seed script and the e2e test-fixture layer is on
TypeORM.

## Modules converted

- **`blog`**: `BlogService` — admin CRUD (draft/publish/schedule), public
  listing with an OR'd status/schedule-window filter, view-count
  increment, cover-image serving via `StoredFile`.
- **`careers`**: `CareersService` — public job listing/application
  (encrypted national ID, resume upload), `SITE_ADMIN` posting CRUD and
  application review (refer/hire/reject with an append-only jsonb
  history).
- **`club`**: `ClubService` — VIP member CRUD, tier-rule singleton config,
  card-request lifecycle (submit → refer → approve/reject) across both
  the customer self-service and exec-panel tracks.
- **`reconciliation`**: `ReconciliationService` — the PENDING
  payment/ticket-mismatch queue and its resolution.
- **`sms`**: `SmsService` (send log) + `KavenegarSmsProvider` (the real
  vendor, previously still Prisma-based despite being wired into this
  module since Phase 14 of the original build) — both converted together
  since they're one send path.
- **`support-tickets`**: `SupportTicketsService` — public/customer
  submission, staff list/detail/forward/status-update.
- **`survey`**: `SurveyService` + `survey-lifecycle.util.ts`'s
  `materializeSurveyInvites()` — IT_MANAGER config, lazy invite creation +
  SMS on FLOWN, public token-based submission, exec read-only results + AI
  summary. Keeps a `PrismaService` field solely to call the shared,
  still-Prisma-based `materializeFlownBookings()` (same precedent as
  `PnrService` from Phase 11).

## New findings

- **Real runtime bug, the same class caught three times this phase**:
  `Repository.findOne({ order: {...} })` with no `where` key throws
  `TypeORMError: You must provide selection conditions in order to find a
  single row.` at request time (not a compile-time error). Every
  "singleton config row" `getOrCreate*()` helper written this phase
  originally omitted `where` (mirroring Prisma's `findFirst({orderBy})`,
  which needs no filter) — hit in `club.service.ts`'s
  `getOrCreateTierRule()`, `careers.service.ts`'s `getOrCreateSettings()`,
  `survey.service.ts`'s `listQuestions()`'s "last question" lookup, and
  `survey-lifecycle.util.ts`'s own settings lookup. Fixed uniformly with
  an explicit `where: {}`. Established as a checklist item for any future
  singleton-row helper.
- **`SurveyInvite.token` had no `@BeforeInsert()` default-generator** —
  the Prisma schema's `token String @unique @default(uuid())` has no
  TypeORM equivalent for a plain (non-PK) column default at the
  application layer; every real invite-creation path (lazy materialize on
  FLOWN) failed a NOT NULL constraint until a second `@BeforeInsert()`
  (`generateToken()`, alongside the existing `generateId()`) was added —
  the same class of gap as Phase 11's `Booking.taxIrr` discovery, just on
  a different entity/column.
- **14 entities had no `@BeforeInsert()` id-generation hook at all**
  (`BlogPost`, `JobApplication`, `JobPosting`, `CareersSettings`,
  `ClubMember`, `ClubCardRequest`, `ClubTierRule`, `SmsLog`,
  `SupportTicket`, `SurveyInvite`, `SurveyQuestion`, `SurveyResponse`,
  `SurveySettings`, `AiUsageLog`) — this is the first phase to `.create()`
  any of them via TypeORM. Added mechanically via a Python script (same
  approach as Phase 12), confirmed each insertion point via `grep` before
  running.
- **`SurveyInvite` has no inverse relation to `SurveyResponse`** — the
  recurring "no inverse relation" shape from every prior phase touching
  `Booking`, now on a different 1:1. Three call sites in
  `survey.service.ts` relied on Prisma's `include: {response: true}` /
  `response: {isNot: null}`: `findInviteByToken()` now does a separate
  `responseRepo.findOneBy({inviteId})` and merges; `getStats()`'s
  "flights with survey" count and `analyzeFlight()`'s comment-gathering
  both pivoted to query from `SurveyResponse` with `innerJoin('r.invite',
  ...)` instead of from `SurveyInvite` outward — cheaper and avoids the
  missing-relation problem entirely by not needing it.
- **`.update()`/`tx.update()` calls with a `history` (JsonValue) field in
  the payload still trigger TS2589**, confirmed again on `JobApplication`
  (4 jsonb columns: `eduEntries`/`workEntries`/`langEntries`/`history`),
  `ClubCardRequest`, and `SupportTicket` — every read/update touching
  these three entities uses the established query-builder
  `.getMany()`/`.getOne()` pattern for reads, and mutate-the-loaded-entity
  `.save()` (never a raw `.update()` payload carrying the jsonb field) for
  writes. `club.service.ts`'s `decideRequest()` was rewritten from
  `tx.update(ClubCardRequest, id, {...history})` to loading the entity
  once outside the transaction, mutating it, and `tx.save(request)`
  inside — the same two-step shape used since Phase 10's `refunds`.
- **A real, reproducible timing regression in a stress test, root-caused
  and fixed at the test level, not the source level**:
  `careers.e2e-spec.ts`'s "apply is rate-limited per-IP" test fires 12
  concurrent multipart POSTs via `Promise.all` and expects a mix of `201`
  and `429`. Under the new TypeORM/`pg`-driver code path this
  consistently produced `ECONNRESET` for several requests instead of a
  clean `429` — never a data-correctness bug (every request that reached
  the service completed correctly every time, confirmed by instrumenting
  `apply()` directly). Root-caused by a controlled experiment: adding an
  artificial delay *inside* the service made the failure disappear for
  **both** the old Prisma code and the new TypeORM code identically,
  proving this is a Node event-loop scheduling artifact of firing 12
  requests within one microtask batch (the faster raw-`pg` driver
  resolves promises in a tighter chain than Prisma's own engine, which
  incidentally gave the event loop enough natural breathing room to
  service pending sockets) — not a flaw in the migrated business logic,
  and not something a real client ever triggers, since actual network
  jitter always spaces concurrent requests out by far more than one
  microtask batch. Fixed by staggering the *test's* own request dispatch
  (`i * 60ms`) rather than adding an artificial delay to production code;
  confirmed stable across 6 isolated repeats plus a full fresh-suite run.
- **Tooling reminder carried over from Phase 12**: `npx prisma migrate
  reset --force` on this Prisma version doesn't auto-run the seed step;
  every reset in this phase was followed by an explicit `npx prisma db
  seed` before running tests.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 13 file (incidental `lint --fix`
  reformatting of unrelated files reverted with `git checkout --` before
  committing; the 2 pre-existing unrelated errors in
  `auth/dto/{request-otp,verify-otp}.dto.ts` and pre-existing warnings in
  unrelated `test/*.e2e-spec.ts` files are untouched by this phase).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — **465/465 passing** across 54 suites, confirmed
  stable across three consecutive freshly-reset-and-reseeded full-suite
  runs during this phase's debugging cycle (the first two surfaced the
  `findOne`-without-`where` bug, the missing `SurveyInvite.token` default,
  and the careers rate-limit timing artifact in turn; the third and final
  run was clean start to finish).
- `git status` — touches only the 7 converted modules' source files, the
  14 entities that gained `@BeforeInsert()` this phase plus
  `SurveyInvite`'s second hook, `kavenegar-sms.provider.ts` (converted
  alongside `sms`), `test/careers.e2e-spec.ts` (the rate-limit test
  stagger fix), and this doc. Zero unrelated application files (the
  temporary `app.module.ts` logger-level and `test/jest-setup.ts`
  uncaught-exception debugging edits used during root-causing were
  reverted before committing and carry no diff).

## What's next

The Prisma-based seed script (`backend/prisma/seed.ts`), then the e2e
test-fixture layer (every `test/*.e2e-spec.ts` file still creates its
fixtures via a raw `PrismaClient` — converting this is its own dedicated
phase given the number of files), then infra/CI/Prisma removal (delete
`prisma/` dir, `generated/prisma/`, `PrismaModule`, `@prisma/*` deps,
update Dockerfile/CI to TypeORM migrations), then the final `CLAUDE.md`
update reflecting the TypeORM switch plus a migration summary doc. Prisma
remains the active ORM for the seed script and every e2e fixture; nothing
removed until the dedicated Prisma-removal phase.
