# TypeORM migration — Phase 9: agencies + agency-portal

Phase 9 of the Prisma → TypeORM migration plan. Converts `agencies` and
`agency-portal` together, since `agency-portal.service.ts` creates
`AgencyDocument`/`AgencyCreditRequest`/`AgencyWebserviceRequest` and reuses
`AgenciesService` heavily for credit/invoices/messages/API-keys. First
pessimistic-lock conversion in the migration.

## Modules converted

- **`agencies`** — `AgenciesService`: public OTP request + membership
  request creation, `computeUsedIrr()` (grouped SUM), `list()`/`detail()`/
  `commercialDetailExtras()`, suspend/reactivate, credit get/update,
  **`settle()`** (agency debt settlement under
  `SELECT ... FOR UPDATE` — see below), membership request
  approve/reject/refer (transactional `User`+`AgencyProfile`+
  `AgencyCreditLine` creation), API key issue/update, invoice issue/pay
  (conditional-update double-pay guard)/remind, messages list/post,
  credit-request/webservice-request/document staff-side decide flows.
- **`agency-portal`** — `AgencyPortalService`: dashboard KPIs + 6-month
  sales chart, ledger, credit/invoices/credit-increase-request passthrough
  to `AgenciesService`, sales report + CSV export, inbox passthrough,
  profile, documents list/upload, seat allotments (derived seats-used via
  a live booking count), webservice plan pricing/purchase-request,
  API-key list (never re-exposes the raw secret).

## New findings

- **First pessimistic-lock conversion**: Prisma's raw
  `SELECT ... FOR UPDATE` inside `settle()` becomes
  `this.profileRepo.manager.transaction(async (tx) => tx
  .createQueryBuilder(AgencyProfile, 'a')
  .setLock('pessimistic_write')
  .where('a.userId = :id', { id })
  .getOne())` — there's no dedicated lockable row for the aggregate debt
  figure itself, so the agency's own profile row is locked as the
  serialization point for concurrent settlement reads/writes.
- **Proactively audited every entity both services `.create()`/`tx.create()`
  before writing code**, per the Phase 8 discipline — found and fixed the
  missing `@BeforeInsert()` hook on six entities up front:
  `AgencyRequestOtp`, `AgencyApiKey`, `AgencyMessage`,
  `AgencyCreditRequest`, `AgencyWebserviceRequest`, `AgencyDocument`.
  Despite the proactive pass, the e2e run still surfaced **three more**
  misses the audit missed because they aren't `.create()`-adjacent in an
  obvious way:
  - `AgencyInvoice` — no hook; `issueInvoice()` was failing with a 500
    (NOT NULL on `id`) on every invoice issue.
  - `LedgerEntry` — no hook at all in the entity (not specific to this
    phase's usage); `tx.create(LedgerEntry, {...})` in `payInvoice()`
    and `settle()` was failing the same way. Confirmed via `grep` that no
    other converted module creates `LedgerEntry` yet, so this bug was
    latent rather than a regression.
  - `AgencyMembershipRequest` — no hook; `createPublicRequest()` (the
    public pre-registration OTP flow) was failing the same way.
  All three fixed the same way as every prior phase:
  `@BeforeInsert() generateId() { this.id ??= randomUUID(); }`.
- **`User.updatedAt` is a plain `@Column` with no default and no
  `@UpdateDateColumn()`** (by design — every converted module sets it
  explicitly per the established Phase 5 convention). `approveRequest()`'s
  `tx.create(User, {...})` for the newly-approved agency account omitted
  it, causing a 500 on the approve-membership-request endpoint even after
  every hook fix above. Fixed by adding `updatedAt: new Date()` to match
  every other `User` creation site in `auth`/`admins`/`it-manager`.
- **`AgencyProfile` has no inverse relation to `AgencyCreditLine`,
  `AgencyInvoice`, or `Booking`** (same recurring shape as prior phases).
  Fixed throughout via separate queries + `Map` merges, never a mismatched
  inverse relation:
  - `getProfileOrThrow()`/`list()`/`detail()` no longer
    `leftJoinAndSelect('a.creditLine', ...)` (doesn't exist) — `list()`
    batches a `creditLineRepo.find({ where: { agencyId: In(ids) } })` and
    merges via a `creditLineByAgency` Map; `detail()` adds a single
    `creditLineRepo.findOneBy({ agencyId: id })` to its `Promise.all`.
  - `commercialDetailExtras()` no longer joins the nonexistent
    `Booking.passengers` relation — bookings are fetched normally, then a
    separate `Passenger` query grouped by `bookingId` (for the fetched
    booking ids only) is merged via a `passengerCountByBookingId` Map.
  - `agency-portal.service.ts`'s `sales()` applies the same
    `Booking.passengers`-doesn't-exist fix independently (grouped
    `COUNT(*)` query-builder call keyed by `bookingId`).
- **Ternary Promise/non-Promise mismatch inside `Promise.all` arrays**
  (`cond ? repo.query() : []`) recurred in `list()` — fixed with explicit
  `Promise.resolve<T[]>([])` fallbacks, same as Phase 6.
- **TS2589 "excessively deep" on the `JsonValue`-column entity**
  (`AgencyMembershipRequest.documents`) hit `getRequestOrThrow()`'s plain
  `findOneBy({ id })` — same class of bug as `SystemSetting`/
  `ManagerReferral` in earlier phases. Fixed by switching to
  `createQueryBuilder('r').where('r.id = :id', { id }).getOne()`.
- `agency-portal.service.ts`'s `uploadDocument()` originally read
  `mimeType` off `FilesService.store()`'s return value, which only
  includes `id`/`fileName`/`sizeBytes` (no `mimeType`) — the Prisma
  version instead re-queried the created `AgencyDocument` with its `file`
  relation joined. Ported the same way: `documentRepo.findOne({ where:
  { id: saved.id }, relations: { file: true } })` after the initial save.
- `salesCsv()`'s UTF-8 BOM prefix must stay as the `﻿` escape in
  source, not a literal BOM byte pasted into the template string — the
  literal byte trips ESLint's `no-irregular-whitespace` rule with no
  behavior difference.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 9 file (incidental `lint --fix`
  reformatting of unrelated files reverted with `git checkout --` before
  committing; the 2 pre-existing unrelated errors in
  `auth/dto/{request-otp,verify-otp}.dto.ts` and 13 pre-existing warnings
  in unrelated `test/*.e2e-spec.ts` files are untouched by this phase).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — **465/465 passing** across 54 suites against a
  freshly reset + reseeded `blujet_test`, after two fix-and-rerun cycles
  (the `AgencyInvoice`/`LedgerEntry`/`AgencyMembershipRequest` hook misses,
  then the `User.updatedAt` miss) — covers public OTP + membership-request
  self-service, staff approve/reject/refer, credit get/update, the
  pessimistic-lock settlement path (incl. the concurrent-double-settle
  race test), invoices (issue/pay/remind, incl. the double-pay 409 race),
  messages, API keys, credit/webservice staff-side decisions, and every
  agency-portal read/write surface (dashboard, ledger, sales + CSV,
  documents, allotments, webservice purchase).
- `git status` — touches only `agencies.service.ts`/`agencies.module.ts`,
  `agency-portal.service.ts`/`agency-portal.module.ts`, the 9 entities
  that gained `@BeforeInsert()` this phase, and this doc. Zero unrelated
  application files.

## What's next

Phase 10 (per the plan): `refunds`. Then `reservation` (seat locks — the
double-booking-guarantee critical path), `booking-engine` +
`customer-referrals` together (shared-transaction boundary, riskiest
phase), the remaining smaller modules (`blog`, `careers`, `club`,
`reconciliation`, `sms`, `support-tickets`, `survey`), the seed script,
the e2e fixture layer, and Prisma removal. Prisma remains the active ORM
for every module not yet converted; nothing removed until the dedicated
Prisma-removal phase.
