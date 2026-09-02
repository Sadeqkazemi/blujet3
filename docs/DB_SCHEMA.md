# DB_SCHEMA.md — blujet data model

Source of truth: `backend/prisma/schema.prisma` (generated from this doc once
approved). This file groups entities by the phase that introduces them, per
`CLAUDE.md`'s workflow rule ("one feature = backend endpoint + tests +
frontend page, fully working, before starting the next feature").

Entities were reverse-engineered from the six executive panel design files
in `design-reference/` (پنل مدیر عامل, پنل رئیس هیئت مدیره, پنل مدیر ارشد,
پنل مدیر بازرگانی, پنل مدیر مالی, پنل مدیر IT) plus the shared
`ReservationSystem.dc.html` component and `site-data.js` mock store. Where a
design mock did something CLAUDE.md explicitly forbids (plaintext passwords,
a mutable balance column, floats for money, client-computed aggregates),
the schema below follows CLAUDE.md, not the mock — those spots are called
out inline.

All money columns are `Int` (IRR, no decimals) per the Financial Rules.
All `Jalali`-displayed dates are stored as UTC `DateTime`; Jalali conversion
happens at the frontend edge only (`frontend/src/lib/jalali.ts`).

## 2026-08-28 — Finance/commercial employee delegation hardening

No schema migration is required. The existing `employee_permissions` relation
stores the IT-manager grants. `fn_dashboard`, `fn_transactions`, and
`fn_settlements` now unlock distinct real reporting endpoints, while the
existing employee department keeps the duplicated `sv_view` permission scoped
to either commercial ancillary services or IT site services. Finance and
agency-finance screens continue to read immutable ledger entries, invoices,
bookings, payments, and credit-request records; no mock rows are introduced.

---

## Finance-manager completion (2026-08-13) — exports and accounting connections

The reports/export feature is read-only over the existing `Booking`,
`Passenger`, `FlightInstance`, `LedgerEntry`, `AgencyProfile`, and
`AgencyInvoice` tables; report rows are not copied into a reporting table.
Every IRR aggregate remains `bigint` until it crosses the API boundary.

Accounting providers reuse `ExternalServiceConfig`, one row per provider with
keys `finance_holo`, `finance_sepidar`, `finance_hesabfa`,
`finance_rahkaran`, and `finance_parmis`. Existing columns hold the provider
name, deployment-configured endpoint, encrypted API key, enabled/connected
flag, last test/sync timestamp and success result. `lastTestMessage` stores a
sanitized upstream result only; it must never contain the credential or raw
financial payload. Connect, sync, and disconnect mutations also create
`AuditLog(category=FINANCE)` entries. No schema migration is required because
the existing encrypted external-service record already provides the required
durable contract.

---

## Phase 1 — Auth, RBAC, panel shell, dashboard/reporting core

### Role (enum)

```
USER | AGENCY | EMPLOYEE | IT_MANAGER | COMMERCIAL_MANAGER | FINANCE_MANAGER
| SENIOR_MANAGER | CEO | BOARD_CHAIR | SITE_ADMIN
```

Fixed by `CLAUDE.md`. `EMPLOYEE` covers all department staff (commercial/
finance/IT/sales); their fine-grained capabilities come from `Permission`
(Phase 6), not sub-roles.

### User

One table for every human in the system — customers, agency users, staff,
and the six manager roles. Two disjoint auth surfaces are enforced at the
service layer, not by separate tables (simpler migration path, one place to
enforce "a user has exactly one identity"):

| Column                | Type              | Notes                                             |
| --------------------- | ----------------- | ------------------------------------------------- |
| id                    | uuid pk           |                                                   |
| role                  | Role              |                                                   |
| phone                 | string? unique    | customers/agencies — E.164, OTP login             |
| username              | string? unique    | staff/managers — password + mandatory 2FA login   |
| passwordHash          | string?           | argon2; **null for OTP-only customers**           |
| email                 | string? unique    | optional for customers, org email for staff       |
| fullName              | string            |                                                   |
| twoFactorEnabled      | bool              | forced `true` for all roles except USER/AGENCY    |
| twoFactorSecret       | string?           | encrypted at rest                                 |
| isActive              | bool default true | suspend/activate (اسکناس تعلیق حساب) toggles this |
| deletedAt             | DateTime?         | soft delete (GDPR hard-delete flow is separate)   |
| createdAt / updatedAt | DateTime          |                                                   |

Constraint: exactly one of `phone`/`username` is non-null depending on role
(`USER`/`AGENCY` → phone; everything else → username). Enforced in the
`auth` module's DTOs, not at the DB level (Prisma can't express XOR
constraints cleanly).

**Design-mock deviation**: the employee-panel login (`SiteData.authStaff`)
compares plaintext passwords and has no 2FA step. The real `passwordHash`
is argon2, and every staff/manager role requires a 2FA challenge on login
(`TwoFactorChallenge` below) — the mock's shortcut is not carried over.

### RefreshToken

`{ id, userId→User, tokenHash, userAgent, ip, expiresAt, revokedAt? }` —
revocable sessions per CLAUDE.md security rules. Access tokens are stateless
JWTs; only refresh tokens are persisted.

### TwoFactorChallenge

`{ id, userId→User, codeHash, purpose: STAFF_LOGIN_2FA, expiresAt,
consumedAt?, attempts }` — 6-digit, 2-minute TTL, single-use, hashed at
rest (shared shape with the customer OTP table introduced when the public
auth feature is built by the other track; kept separate here so this
track's migration doesn't collide with theirs).

### Permission (seed data, not a table with FKs to every row — see Phase 6)

Referenced here because `User.permissions String[]` (Employee only) stores
keys from this catalog; the catalog itself lands as a Phase 6 seed/enum,
not a Phase 1 migration.

### AuditLog

Backs both the security "audit log for every admin action" requirement and
the six panels' "گزارش مدیران" (manager oversight feed) / "لاگ و رویدادها"
(IT event log) UIs — those are just filtered views over this one table.

| Column                | Type               | Notes                                                                                              |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| id                    | uuid pk            |                                                                                                    |
| actorId               | uuid → User        |                                                                                                    |
| actorRole             | Role               | denormalized for fast filtering                                                                    |
| category              | AuditCategory enum | `AGENCY, PRICING, FINANCE, REFUND, STRATEGY, SYSTEM, CLUB, ACCOUNT, ACCESS, SECURITY, RESERVATION` |
| action                | string             | short label, e.g. "تأیید و صدور کارت"                                                              |
| detail                | string             | Persian sentence, e.g. design's `detail` field                                                     |
| entityType / entityId | string?            | polymorphic pointer to the affected row                                                            |
| metadata              | Json?              | before/after snapshot for the financial log trail                                                  |
| requestId             | string?            | correlates to the request-id log line                                                              |
| createdAt             | DateTime           |                                                                                                    |

Query patterns confirmed across all 6 panels:

- CEO's "گزارش مدیران" excludes `actorRole IN (SUPER/BOARD_CHAIR, SENIOR_MANAGER, CEO)` — CEO oversees operational managers only.
- Board Chair's and Senior Manager's "گزارش مدیران" show everyone (read-only for Board Chair — it never appears as `actorRole` writer in any panel).
- IT's "لاگ و رویدادها" filters `category = SYSTEM` plus account-management entries.

### Panel access flags (feature, not a new table)

"دسترسی به پنل‌ها" (seen in CEO/Senior Manager/IT panels — each toggles a
different subset of sibling panels) is a small keyed bool set, modeled as
`PanelAccessFlag { panelKey, enabled, updatedBy→User, updatedAt }` — one
row per panel key (`SITE_ADMIN, FINANCE, COMMERCIAL, IT, CEO`), not
per-role, matching the design (toggling blocks the panel for everyone with
that role, it's not a per-user grant).

---

## Phase 2 — Flight/booking core (minimal slice needed to power dashboards)

The full booking engine (search, seat selection, checkout, payment,
e-ticketing) is the public-site track's responsibility per `CLAUDE.md`'s
repo layout — these tables are the **minimal subset the manager panels
read from** to compute real sales charts/KPIs instead of mock numbers.
Field names/relations are kept compatible with the full IATA-NDC-aligned
model `CLAUDE.md` specifies (`Route → Flight → Schedule → FlightInstance →
Inventory → FareRule`) so a later merge with the public-site track's
migrations doesn't require renaming.

- `Route { id, originCode, destCode }`
- `Flight { id, flightNo, routeId→Route, aircraftType }`
- `FlightInstance { id, flightId→Flight, departureAt(UTC), arrivalAt(UTC), capacity, charterSeats, status: SCHEDULED|DEPARTED|CANCELLED, durationMinutes?, competitorPriceIrr?, cabinCapacities jsonb [{cabin,seats}], definitionStatus: DRAFT|PENDING_OPERATIONS|OPERATIONS_REJECTED|PENDING_CEO|REJECTED|PENDING_REVISION|PUBLISHED (legacy APPROVED rows migrated → PUBLISHED; default PUBLISHED for pre-workflow inventory), version Int @default(1) optimistic lock, publishedAt?, publishedByUserId?, rejectionReason?, approvedSnapshot jsonb?, pendingRevisionSnapshot jsonb?, cancelledAt?, cancelledByUserId→User?, cancellationReason? }` — public sale only for `PUBLISHED` and `PENDING_REVISION` (with approvedSnapshot). Cancellation metadata is occurrence-specific; series approval still produces one independent row per operating date.
- `FlightReview { id, flightInstanceId, stage: OPERATIONS|CEO, decision: APPROVED|REJECTED, comment, reviewedByUserId, reviewedAt, expectedVersion?, createdAt }` — append-only ops/CEO decisions.
- `FlightChargeRule { id, flightInstanceId, title, kind: TAX|FEE, calculationMode: FIXED|PERCENTAGE, fixedAmountIrr?, percentageBasisPoints?, cabin null=all, effectiveFrom/To, isActive, isPendingRevision }` — server-authoritative taxes/fees; booking stores immutable `chargeSnapshot`.
- `AircraftSeatMap` — business + optional comfort + economy row/col bands; COMFORT cannot be sold without comfort rows.
- `FarePricingProposal.status` — PENDING|REGISTERED|REJECTED; `competitorPriceIrr` nullable.
- `Booking { id, pnr unique, flightInstanceId→FlightInstance, channel: DIRECT|AGENCY|VIP|MANAGERIAL, agencyId→User?, status: DRAFT|HELD|PAID|TICKETED|CANCELLED|EXPIRED|REFUNDED, priceIrr Int, taxIrr, chargeSnapshot jsonb?, createdAt }` — full state machine per CLAUDE.md; Phase 1 dashboards only read `PAID`/`TICKETED` rows.
- `Passenger { id, bookingId→Booking, fullName, nationalId(encrypted),
passportNo(encrypted), gender (`male`|`female`), mobile(encrypted) }`
- `LedgerEntry { id, bookingId→Booking?, agencyId→AgencyProfile?, type: SALE|REFUND|SETTLEMENT|COMMISSION, signedAmountIrr Int, occurredAt, createdBy→User? }` — double-entry, immutable, append-only; refunds/settlements are new rows, never edits. `agencyId` (added in Phase 3) is set on agency-channel `SALE` rows (mirroring `booking.agencyId`) and on every `SETTLEMENT` row, since a settlement (invoice payment or a direct "ثبت تسویه") isn't necessarily tied to one `Booking` — this lets `AgencyCreditLine.usedIrr` derive from a single `agencyId` filter instead of a join through `Booking` that `SETTLEMENT` rows wouldn't have anyway.

Sales-chart/KPI endpoints (`GET /reporting/sales`, etc., Phase 1 API) query
`LedgerEntry` grouped by `Booking.channel` and period — never a client-side
sum, per CLAUDE.md.

---

## Phase 3 — Agencies (credit, settlement, membership)

Grounded in the confirmed آژانس‌ها tab across all three roles that have it
(Senior Manager, Finance Manager, Commercial Manager) — the three views
share the same data but differ in which actions each role's UI exposes
(reconciled in the API section below, not by three separate schemas).

- `AgencyProfile { userId→User (role=AGENCY) pk, licenseNo, managerName, phone, email, city, address, tier: NORMAL|SILVER|GOLD (نقره‌ای/طلایی — matches the design's segmented control, not an invented scale), suspendedAt?, suspendReason?, joinedAt }`
- `AgencyCreditLine { agencyId→AgencyProfile pk, limitIrr, updatedById→User, updatedAt }` — **only the limit is stored**; "مصرف‌شده" (used) is never a mutable balance column per `CLAUDE.md`'s financial rules. It's derived at query time as `SUM(LedgerEntry.signedAmountIrr WHERE agencyId=X, type=SALE) − SUM(LedgerEntry.signedAmountIrr WHERE agencyId=X, type=SETTLEMENT)` (see `LedgerEntry.agencyId` above) — i.e. every `AgencyInvoice` marked `PAID` (or a direct "ثبت تسویه") writes a `SETTLEMENT` ledger row that reduces this figure; `LedgerEntry` stays the single source of truth, invoices are the paper trail on top of it. A design-mock deviation flagged by the extraction agents: the mocks store `used` as a plain mutable field — the real schema doesn't.
- **Agency activity score** (Commercial/Finance panel's "امتیاز فعالیت آژانس", gold/silver/bronze badge) — computed, not stored: `seatsSold*10 + paidInvoices*100 − unpaidInvoices*60 + (isActive ? 40 : 0)`, clamped ≥0; ≥700 گلد/gold, ≥400 نقره‌ای/silver, else برنز/bronze. Matches the design's exact formula (extraction confirmed it verbatim) — kept as-is rather than redesigned, since it's presentational scoring, not a financial figure.
- `AgencyMembershipRequest { id, applicantName, managerName, licenseNo, city, phone, email, documents Json (uploaded file refs), status: PENDING|REFERRED|APPROVED|REJECTED, referredToId→User?, reviewNote?, reviewedById→User?, reviewedAt?, createdAt }` — `REFERRED` covers the "ارجاع درخواست" flow (Commercial/Senior Manager forwarding to a named staffer/manager) found only in those two panels' request-detail screens.
- `AgencyApiKey { id, agencyId→AgencyProfile, keyHash, scope: FULL|SEARCH_BOOK|SEARCH_ONLY, capabilities: text[] (RESERVATION|TICKETING|PRICING|FLIGHT_INFO|REFUND|CHECK_IN|AVAILABILITY), environment: SANDBOX|PRODUCTION, flightDomain: ALL|DOMESTIC|INTERNATIONAL, ipWhitelist: text[], rateLimitPerMinute?, status: ACTIVE|SUSPENDED|REVOKED, activatedAt, expiresAt?, lastUsedAt?, callCount Int }` — unique active/suspended key per `(agencyId, environment)`.
- `AgencyInvoice { id, agencyId→AgencyProfile, bookingId?→Booking unique, invoiceNo unique, issuedById→User, issuedAt, dueAt, amountIrr, status: UNPAID|PAID|OVERDUE, paidAt? }` — "فاکتورهای صادرشده" / "صدور فاکتور". `bookingId` identifies the single paid sale invoice materialized atomically for an agency-owned customer booking and prevents retry duplicates. Manually issued/seat-commitment invoices may keep it null. Marking an unpaid invoice `PAID` creates a `LedgerEntry(type=SETTLEMENT)` row — never a bare status flip.
- `AgencyMessage { id, agencyId→AgencyProfile, senderId→User, senderIsAgency Bool, body, createdAt }` — "مکاتبه‌ها" chat thread, confirmed only in the Commercial Manager panel's agency detail.

## Phase 4 — Cartable, referrals, manager messaging

Grounded in a full extraction of the کارتابل tab (all 5 exec panels — CEO,
Board Chair, Senior, Finance, Commercial), the ارجاعات tab (Senior Manager
only) and the «ایجاد پیام» compose modal (all 5 panels). **Critical design
finding:** in the mocks all three are demo-only — cartable items are static
seeds, compose is send-only with no inbox anywhere, referral reports are
pre-seeded with no recipient-side submission UI, and «انتقال» (transfer)
never reaches the target's cartable. The schema below defines the real
persistence and routing the mocks imply but don't implement. The wiring
decisions (marked ⚑) are product decisions surfaced for approval, not
silently invented.

- `CartableTask { id, assigneeId→User, category: ADMIN|AGENCY|MANAGER, title, description, senderId→User?, senderLabelFa? (display fallback when no User row backs the sender), sourceType?: MANAGER_MESSAGE|MANAGER_REFERRAL|AGENCY_REQUEST|CHAIR_PERMISSION, sourceId?, status: OPEN|APPROVED|REJECTED|TRANSFERRED, resolutionNote?, transferredToId→User?, resolvedAt?, createdAt }`
- `CartableTask.conversationId text NULL` groups reciprocal internal staff
  messages. It is indexed with `createdAt` for chronological history reads.
  Only `MANAGER_MESSAGE` and `EMPLOYEE_MESSAGE` use it. Each direct delivery
  receives one UUID; every recipient of a department broadcast receives a
  different UUID. Reply rows retain the same value while alternating sender
  and assignee. Resolved rows are retained as immutable conversation history.
  Explicit `/close` and the four-day inactivity lifecycle reuse the existing
  `status=APPROVED`, `resolutionNote`, and `resolvedAt` columns to archive every
  OPEN row in a conversation without deleting messages or attachments.

### Current reporting and booking read models

- Finance sales reports are derived read models over existing `Booking`,
  `Passenger`, `FlightInstance`, route, agency and ledger/payment data. No
  report row is persisted and no migration is required for CSV/Excel/PDF
  export.
- `Booking.cabin` and nullable `Booking.fareClassCode` are immutable
  purchase-time classifications. They are returned together in booking detail
  and must never be recomputed from the current fare-rule catalog.
- Seat selection keeps its existing authoritative persistence in
  `Passenger.seatCode`/`extraSeatCode`. Availability is derived from paid,
  ticketed and unexpired held bookings plus active seat locks; cabin membership
  comes from the aircraft seat map. No duplicate invoice-class column is added.
- Cartable status counters are query-time aggregates over existing
  `CartableTask.status`; no schema change is required.
- A chair-permission source may have one OPEN `CartableTask` per active
  `BOARD_CHAIR` account. The permission row is the authoritative decision:
  the first conditional `PENDING → APPROVED|REJECTED` update wins and all OPEN
  sibling tasks for the same `sourceId` are closed with that result.
  - The design's review modal offers exactly three actions — تأیید /
    انصراف(=رد) / انتقال — with a **required** «نظر مدیر» note; there is no
    generic "done" state and no due-date on cartable rows (both confirmed
    absent from all 5 panels).
  - ⚑ Transfer creates a NEW `OPEN` task for the target (same source link)
    and marks the original `TRANSFERRED` — the mocks toast and drop the item;
    the real system routes it. Every resolution writes an
    `AuditLog(category=SYSTEM or AGENCY per source)` row.
  - ⚑ Cartable rows are never authored directly: they are materialized by
    real flows (a manager message, a referral, an agency-request referral
    from Phase 3, a chair-permission request). The static `taskDefs` demo
    seeds are reproduced only in `seed.ts`.
- `ManagerReferral { id, fromId→User (SENIOR_MANAGER only, per design), title, body, priority: HIGH|MEDIUM|LOW, dueAt? (DateTime — the mock's free-text «مثلاً: ۲۵ تیر» becomes a real Jalali date picker/parse), status: SENT|REVIEWING|REPORTED|CLOSED, attachments Json (StoredFile ids), createdAt }`
- `ManagerReferralRecipient { referralId→ManagerReferral, recipientId→User }` — the design's multi-select chips (مدیر مالی، مدیر بازرگانی، ادمین سایت، سرپرست پشتیبانی، مدیر فنی) map to real staff users; ⚑ each recipient also gets a `CartableTask(category=MANAGER, «درخواست مدیر»)`, which is how the recipient — who has NO referrals tab in the design — receives it.
- `ManagerReferralReport { id, referralId→ManagerReferral, fromId→User, body, attachments Json, createdAt }` — ⚑ recipient-side report submission has no UI in the mocks (reports are pre-seeded); the API defines it and the recipient's cartable review of the referral task doubles as the submission surface. First report flips referral status to `REPORTED`; sender actions per design: «تأیید دریافت گزارش و بستن» → CLOSED, «درخواست اصلاح گزارش» → REVIEWING, «ارسال یادآوری دریافت گزارش» → REVIEWING (+ notification).
- `ManagerMessage { id, fromId→User, toDept: FINANCE|COMMERCIAL|SUPPORT|AGENCIES|CEO|ALL_MANAGERS, subject, body, attachments Json, createdAt }` — the «ایجاد پیام» compose (identical in all 5 panels). ⚑ Since the design has no inbox, delivery materializes as `CartableTask(category=ADMIN, sourceType=MANAGER_MESSAGE)` for the mapped recipient(s): FINANCE→FINANCE_MANAGER, COMMERCIAL→COMMERCIAL_MANAGER, CEO→CEO, ALL_MANAGERS→all 5 exec roles. SUPPORT/AGENCIES have no backing staff role yet — accepted by the enum but flagged undeliverable until Phase 8's employee/department model lands (open item).
- `ChairReportPermission { id, requesterId→User (FINANCE_MANAGER|COMMERCIAL_MANAGER), status: PENDING|APPROVED|REJECTED, decidedById→User?, decidedAt?, createdAt }` — the gate banner shown only in Finance/Commercial cartables («ارسال گزارش به رئیس هیئت مدیره نیازمند مجوز ایشان است»). ⚑ The request creates a `CartableTask` for BOARD_CHAIR (the mock has no chair-side approval UI); chair's cartable تأیید/رد decides it.
- `StoredFile { id, ownerId→User, fileName, mimeType, sizeBytes, path, createdAt }` — minimal upload backing for the referral/message «بارگذاری مستندات (PDF یا تصویر)» chips; PDF/image only, size-capped, local disk in dev behind an interface. Reused later by club-card docs (Phase 5) and refunds (Phase 7).

Out of scope, confirmed dead/unreachable in the design (not built):

- Senior Manager's «اولویت‌های راهبردی» directive list — not reachable from
  the confirmed sidebar (orphaned tab), purely in-memory, never delivered.
- A standalone received-messages inbox — the cartable IS the inbox
  (decision ⚑ above).

## Phase 5 — VIP club (loyalty tie-in for manager panels)

Grounded in a full extraction of the club tab (CEO + Board Chair share a
byte-identical rich layout; Senior Manager has a simpler two-card layout)
and `site-data.js`'s `clubMembers`/`cardRequests` shapes. The full loyalty
ledger (points earn/burn, cashback) belongs to the customer-club feature
on the public-site track — this slice is the manager-panel view over it,
kept forward-compatible the same way Phase 2's `Booking` was.

- `ClubTier` enum: `SILVER|GOLD|PLATINUM` (نقره‌ای/طلایی/پلاتین — verbatim design tiers with point bands 0–5k/5k–15k/15k+; `CARD_THRESHOLD=5000` for card eligibility).
- `ClubMember { id, userId→User? (nullable link to the customer account once the public track exists), fullName, email, birthDate?, nationalIdEnc, nationalIdHash (deterministic hash for exact-match search — the design's search box matches nationalId, and the encrypted column can't be LIKE-searched), joinDate, points Int (read-model copy; authoritative points ledger lives in the public track), level ClubTier, cardStatus: NONE|REVIEW|ISSUED, cardNo?, issuedByLabelFa?, deactivatedAt?, deactivatedById→User?, createdAt }`
  - PII rules apply even though the mocks store plaintext: national ID checksum-validated server-side, encrypted at rest, masked in logs.
  - Executive VIP deactivation is non-destructive: `deactivatedAt` hides the membership and suspends club benefits while retaining account, travel, wallet, points, card-request and audit history. Re-adding the same national ID reactivates the existing membership instead of duplicating it; no delete endpoint exists.
  - The mocks' `cardBlocked`, `used`, `transactions[]` fields are never surfaced in any of the three executive panels — orphaned, not built.
- `ClubCardRequest { id, memberId→ClubMember, level ClubTier, points Int (snapshot at request time), status: SUBMITTED|REFERRED|APPROVED|REJECTED, assignedTo: SENIOR|CHAIR? (design's 'senior'/'super'; never CEO — the site-admin referral form only offers those two), decidedById→User?, decidedAt?, cardNo?, history Json[] of {step,labelFa,at}, createdAt }`
- ⚑ **Approval authority (replicated from the design, server-enforced + audited):** CEO and BOARD_CHAIR may approve/reject ANY `REFERRED` request regardless of `assignedTo` (the design gives them both an explicit override); SENIOR_MANAGER may only act on `assignedTo=SENIOR`, and sees `assignedTo=CHAIR` rows read-only with the design's «ارجاع‌شده به رئیس هیئت مدیره — در انتظار تأیید» note.
- Approval is transactional: request → APPROVED + `cardNo` generated (`SILV|GOLD|PLAT-####`), member → `cardStatus=ISSUED` + `issuedByLabelFa='<نقش> (تأیید درخواست)'`, a history row appended, and an `AuditLog(category=CLUB)` written. Reject sets member back to `cardStatus=NONE`. Acting on a non-REFERRED request → 409.
- ⚑ **Direct issuance** («صدور کارت» on a member row, all 3 panels): sets the card immediately with `issuedByLabelFa='<نقش> (صدور مستقیم)'`, creates no request record (per design) but DOES write an `AuditLog(category=CLUB)` row — the mocks' silent path gets a real audit trail.
- ⚑ **Tier changes** (Senior Manager's segmented control): `PATCH level`, Senior-only per design, audited — the mocks mutate with no confirmation or trail.
- Open item: `SUBMITTED→REFERRED` (admin-site referral) and passenger self-request belong to the site-admin/public tracks — until those land, requests in those states come from seed data only; no stub endpoints are built.

## Phase 6 — Pricing proposals & ticket approval

Grounded in extraction of the CEO «تعیین قیمت بلیط» tab and the Commercial
Manager's pricing section (inside its flights tab — Commercial has no
dedicated pricing tab). Confirmed 3-step flow, verbatim from the CEO
banner: «۱ پیشنهاد مدیر بازرگانی → ۲ تحلیل هوش مصنوعی → ۳ تأیید و ثبت
مدیر عامل».

- `FarePricingProposal { id, flightInstanceId→FlightInstance @unique (one live proposal per flight — ⚑ fixes the mocks' broken id scheme where the two panels wrote the same array under incompatible `PP-####`vs`PP-{flightNo}` keys and seeded proposals never matched any flight row), basePriceIrr, competitorPriceIrr, proposedPriceIrr, legalRateIrr?, note?, proposedById→User, status: PENDING|REGISTERED, registeredPriceIrr?, approvedById→User?, approvedAt?, aiSuggestion Json? of { priceIrr, reason, factors[], season, occasion, confidence, modelVersion, generatedAt }, createdAt, updatedAt }`
- ⚑ **AI suggestion is persisted on the proposal** (with the model version, per the ML-service traceability rule) — in the mocks it lives in component state and evaporates on reload, hiding the «ثبت با AI» button. Advisory-only stands: generation never mutates prices; registration is always an explicit CEO click.
- **Registration** («تأیید بازرگانی» / «ثبت با AI»): CEO picks one of the two computed values — the design has no free-price input at approval. Transitions PENDING→REGISTERED with `registeredPriceIrr`, audited (`category=PRICING`). The original proposal remains immutable, but the Commercial Manager may update the current `registeredPriceIrr` of a `PUBLISHED` flight through the dedicated price endpoint; every change stores previous/new IRR values and reason in append-only `AuditLog`, bumps `FlightInstance.version`, and invalidates search cache.
- **Legal rate** (نرخ قانونی/مصوب سازمان هواپیمایی): Commercial sends it with the proposal AND the CEO can set/override it independently (both paths exist in the design; last write wins, both audited).
- Money: the mocks' numbers are toman — stored as IRR integers as everywhere; toman conversion only in the shared utils. Ticket-price magnitudes fit the current Int32 columns.
- ⚑ **ML service goes real this phase** (first ml-service implementation): FastAPI `POST /internal/v1/price-suggestion` per CLAUDE.md's ML rules — pydantic schemas, shared-token internal auth, structured logs with X-Request-Id, `GET /health`, versioned heuristic model (season/occasion/competitor factors mirroring the design's fallback logic), pytest. NestJS side: an `AiProvider`-style client in `backend/src/modules/ai/` with a 2s timeout and graceful fallback — if the service is down, pricing approval flows keep working, only the suggestion is unavailable. No PII is ever sent (route codes, dates, prices, capacity only).
- Out of scope (other phases): the Commercial add-flight flow and plan-modal AI hint (Phase 10 flight management); the design's client-side `window.claude.complete` path is replaced entirely by the backend ML call (frontend never talks to AI vendors, per CLAUDE.md).

## Phase 7 — Refunds

Grounded in extraction of the Finance Manager's استرداد بلیط tab (the
primary payout surface), the customer/site-admin submission flow, and
`site-data.js`'s `refunds` shapes. Lifecycle:
مشتری ثبت → ادمین سایت ارجاع → مدیر مالی پرداخت, tracked as
`SUBMITTED → REVIEW → FINANCE → PAID`.

- `RefundRequest { id, trackingCode String @unique, bookingId String @unique→Booking, passengerName, nidEnc?/mobileEnc? (PII encrypted like everywhere else — the mocks store plaintext), ibanEnc (24-digit شبا, encrypted at rest, returned only to the finance surface), totalPaidIrr, penaltyPct, penaltyAmountIrr, refundableIrr, status: SUBMITTED|REVIEW|FINANCE|PAID, assigneeId→User? (finance staffer; SITE_ADMIN referral of a customer-created request advances it to FINANCE, while later finance reassignment only changes the assignee), processedById→User?, paidAt?, history Json[] of {step, labelFa, at}, createdAt }` — real FK to Booking. `trackingCode` is generated server-side as an opaque short `RF-XXXXXXXX` code with collision retry; it is display/search identity only, never authorization. Existing rows are backfilled in the migration before the unique/not-null constraint is applied (⚑ fixes the mocks' `RF-{length+1044}` id-collision scheme without exposing UUIDs as customer tracking codes).
- `RefundPenaltyRule { id, minHoursBeforeDeparture, penaltyPct, labelFa }` — ⚑ the mocks contain THREE inconsistent penalty schemes (customer engine: 30/50/70/100 by hours-to-departure; a dead two-bracket 30/80 settings editor; seeds hardcoding ٪۳۰). The customer panel's 4-bracket engine is the only actually-executed rule, so it becomes the seeded, server-side source of truth: ≥72h→30٪, 24–72h→50٪, 3–24h→70٪, <3h→100٪ (غیرقابل استرداد). Penalty is computed server-side at request creation; the static settings editor is dead UI and is not built.
- ⚑ **Real financial effect on pay** (the mocks only flip a status field): `PATCH pay` runs in one transaction — `LedgerEntry(type=REFUND, signedAmountIrr = −refundableIrr, bookingId, createdBy)`, `Booking.status → REFUNDED`, request → `PAID` + `processedById/paidAt` + history row, `AuditLog(category=REFUND)`. Double-pay guarded (409). The actual bank transfer to the شبا stays out-of-band until the PaymentGateway lands on the public track — the ledger row is the system of record.
- No reject action exists anywhere in the finance design — none is built;
  the status enum stays minimal.
- `REVIEW` remains a valid imported/migration state. The real SITE_ADMIN
  refer operation accepts `SUBMITTED|REVIEW`, appends both actual review
  and finance-referral history events, and commits `FINANCE` atomically;
  no read endpoint mutates status merely because an admin opened a row.
- Customer submission and SITE_ADMIN/finance processing are now real. The
  account-tab completion adds no other table: eligible bookings are a
  server query over owned `Booking` + `FlightInstance` with
  `NOT EXISTS RefundRequest`; rule cards read `RefundPenaltyRule`; tracking
  uses the existing `history` JSON. Only `RefundRequest.trackingCode`
  requires a migration.
- Penalty previews are never persisted and never authoritative. The
  submission transaction re-reads the booking, locks/guards the one-request
  invariant, recomputes the current bracket, and stores the resulting
  integer IRR snapshot (`totalPaidIrr`, `penaltyAmountIrr`,
  `refundableIrr`). A unique `bookingId` constraint is added to
  `RefundRequest` so two concurrent submissions for one booking cannot
  both succeed; the service maps the losing insert to stable 409
  `CONFLICT`.

## Phase 8 — Employee management (IT Manager)

Scope, confirmed against `PLAN.md`'s Phase 8 bullet: **accounts,
permissions, services, security policy, logs, backups**. The IT panel's
other 3 design tabs (سامانه رزرواسیون, دسترسی به پنل‌ها, تنظیمات سامانه)
are out of scope here — first depends on Phase 9, the other two are
explicitly listed under Phase 12 in `PLAN.md` — not built, not stubbed.

- `User` gained Phase-8 columns directly (mirrors how Phase 3/4 extended
  shared tables rather than a parallel `Employee` table): `dept` (free
  string — design lets IT create custom departments beyond
  commercial/finance/IT/sales, so this is intentionally not a Prisma enum),
  `rank`, `referralScope: MANAGERS_ONLY|ALL_STAFF` (captured at creation
  per the design's «دسترسی ارجاعات» picker; consumed by the referral system
  once `EMPLOYEE` joins `EXEC_ROLES`, which it doesn't yet — captured
  honestly now rather than added as a later migration), `mustChangePassword`,
  `createdById→User` (self-relation, who provisioned the account),
  `lastLoginAt` (set on every successful `staffLogin` verify, also backs the
  employees list' "آخرین ورود" column).
- `Permission { id, dept, sectionKey, sectionLabelFa, key, labelFa }` —
  seeded from the unit/action catalog used by IT's employee form. Commercial
  (and its sales sub-unit) covers agencies, routes, aircraft, flight actions,
  operations, services, reports, club rules and web services; finance covers
  agencies, credit/settlement, reports/exports and refunds; IT covers users,
  services, security and logs. Legacy umbrella keys remain for existing
  employees. Custom depts get no catalog rows until product defines one — not
  fabricated. Endpoint-level mapping for the new action keys is phase two.
- `EmployeePermission { employeeId→User, permissionId→Permission, grantedById? }`
  — replaces the mock's plain `permissions: string[]` with a real FK-checked
  grant; `@@unique([employeeId, permissionId])` makes toggling idempotent.
- `InternalService { id, key, nameFa, enabled, uptimePct }` — seeded from
  the design's `svcDefs` (search/payment/api/sms/email/club/charter/refund/
  checkin/cdn/dest/mobile). These rows are production reference data, not
  demo content: a migration inserts missing canonical keys and refreshes only
  their Persian labels, while preserving operator-controlled `enabled` and
  observed `uptimePct` values on conflict.
- `ExternalServiceConfig { id, key, nameFa, provider, endpoint, method,
timeoutMs, apiKeyEncrypted, sandbox, enabled, lastTestAt, lastTestOk,
lastTestMessage }` — seeded from the design's `extDefs`
  (zarinpal/amadeus/kavenegar/neshan). `apiKeyEncrypted` reuses
  `pii-crypto`'s AES-256-GCM (a generic reversible-encryption primitive
  despite the file's name, needed here because the value must be sent back
  out on real test-connection calls — a hash would be one-way and useless).
- `PasswordResetEvent { id, employeeId→User, resetById→User, createdAt }` —
  audit-only; the actual new password is never stored/displayed after the
  one-time generation screen, same pattern as `TwoFactorChallenge`'s
  hashed/single-use codes.
- `SecurityPolicy` — singleton (`id=1`, upserted): `minLength`,
  `expiryDays`, `maxAttempts`, `requireUppercase`, `requireNumber`,
  `requireSymbol`, `blockReuse`, `staffTwoFactorMandatory`. The design shows
  these as static numbers; made editable since a settings screen with
  read-only toggles isn't a real feature.
- Active sessions ("نشست‌های فعال") reuse the existing `RefreshToken` table
  (`userAgent`, `ip`, `revokedAt`) from Phase 1 — no new table. «خروج همه»
  revokes every non-revoked row.
- `BackupRecord { id, fileName, sizeBytes, status: RUNNING|SUCCESS|FAILED,
triggeredById→User?, startedAt, completedAt, errorMessage }` — one row per
  real `pg_dump` invocation. Restore stays a manual RUNBOOK step (see
  `docs/API.md`'s note) — no destructive one-click endpoint.

## Phase 9 — Reservation system (seat lock / PNR)

Shared `ReservationSystem` component contract, confirmed from
`ReservationSystem.dc.html`'s script (`canLock = this.props.role === 'super'`)
and its own copy ("لاک‌کردن صندلی فقط توسط مدیر عامل یا رئیس هیئت مدیره
انجام می‌شود"). ⚑ **Product update (2026-08-21):** managerial seat lock is
allowed for `CEO`, `BOARD_CHAIR`, `SENIOR_MANAGER`, and
`COMMERCIAL_MANAGER`; `IT_MANAGER` remains read-only on the seat map. PNR
issue/change/cancel additionally allows `IT_MANAGER`. `SENIOR_MANAGER` is no
longer view-only and has a reachable `reservation` sidebar entry labeled
سامانه رزرواسیون. `CEO`, `BOARD_CHAIR`, `COMMERCIAL_MANAGER`, and
`IT_MANAGER` retain their existing reachable reservation/seat-map surfaces.

- `AircraftSeatMap { id, aircraftType (unique) →Flight.aircraftType, businessRowStart/End, businessColsLeft/Right, economyRowStart/End, economyColsLeft/Right, excludedSeatCodes String[], exitRows Int[] }` — CLAUDE.md: "seat map config lives per aircraft type in the DB, not hardcoded." `exitRows` is the authoritative adult-only assignment constraint and defaults to an empty array for legacy aircraft. Seeded for `"Airbus A320"` (legacy 2-2/2-3 → 146 seats) and `"MD-80"` from the approved cabin chart (`design-reference-v2/MD-80-seatmap.pdf`): First Class rows 3–6 as `A,B|E,F` (16), Economy rows 7–32 as `A,B|D,E,F` minus rear exit/galley seats `28A/B,29A/B,30A/B` (124) = **140** total; MD-80 exit rows are 19 and 20.
- `SeatLock { id, flightInstanceId→FlightInstance, seatCode, lockedById→User, agencyId?→AgencyProfile, passengerName?, passengerNationalIdEnc?, passengerNationalIdHash?, passengerMobileEnc?, releasedById?→User, releasedAt? }` — a lock may target an agency, a named/anonymous passenger, or remain anonymous. PII fields follow the same encrypt+hash pattern as `ClubMember`; agency identity is a real foreign key. A partial unique index (`WHERE releasedAt IS NULL`) enforces exactly one active lock per seat at the DB level, not just an app-side check — CLAUDE.md's seat-inventory concurrency rule.
- `Passenger` gained `nationalIdHash` (same encrypt+hash pattern, needed for the design's «جستجوی مسافر» exact-match search) and `seatCode` (nullable — Phase 1–6 seed passengers predate seat selection).
- PNR issuance/change/cancel reuses `Booking`/`Passenger` from Phase 2. "New booking" (منوی جستجوی پرواز + صدور PNR) in this component is a **staff-side manual/offline issuance path** (phone/counter bookings), not the public paid-checkout flow — it creates a `TICKETED` booking directly (no `HELD`/`PAID` steps, no payment gateway), clearly distinct from and not a substitute for the public-site booking-and-payment track. Price comes from `FarePricingProposal.registeredPriceIrr` when one exists for that `FlightInstance` (Phase 6), else a documented flat fallback — no ad-hoc dynamic pricing invented here.
- Out of scope for Phase 9 (design tabs intentionally not built here): «دسترسی آژانس‌ها» duplicates Phase 3's `AgencyApiKey` feature already shipped; «پروازها» (flight/schedule/capacity creation) is Phase 10's own scope; the dashboard sub-tab's "microservices health" cards describe infrastructure that doesn't exist as separate services in this monolith — building it would mean fabricating status data, which CLAUDE.md forbids, so it's replaced by real booking/seat stats instead of ported verbatim.

---

## Agency Portal (self-service, پنل آژانس) — separate track, reassigned into this session

Explicitly authorized by the user (2026-07-17). Reuses Phase 3's
`AgencyProfile`/`AgencyCreditLine`/`AgencyInvoice`/`AgencyMessage`/
`Booking`/`LedgerEntry` — this feature is a self-service VIEW and a small
set of self-scoped WRITES over those same rows, not a new data model.
Two new tables only:

- `AgencyCreditRequest { id, agencyId→AgencyProfile, requestedLimitIrr Int, note String?, status: PENDING|APPROVED|REJECTED, decidedById?→User, decidedAt?, createdAt }` — ⚑ replaces the design's client-side «افزایش اعتبار» mutation (`_limitN = _baseLimit + _topupTotal`, applied with no approval) with an auditable request; only `AgenciesService.updateCredit` (Phase 3, unchanged) can ever actually change `AgencyCreditLine.limitIrr`, called from a dedicated staff decide endpoint, never from this table's row directly.
- `AgencyDocument { id, agencyId→User, fileId→StoredFile, docType: LICENSE|CONTRACT|OTHER, status: PENDING|APPROVED|REJECTED @default(PENDING), createdAt }` — wraps Phase 4's `StoredFile` (same PDF/image/≤5MB upload backing already used for referral/message attachments and club-card docs). Ownership is the authenticated agency user id (the same id used by production `AgencyProfile.userId`), so the profile-less UAT agency can upload its own real documents without creating a fabricated business profile. Staff review uses the existing status workflow described in `docs/API.md`.

`User` gains no new columns — `phone`/`passwordHash`/`mustChangePassword`
(Phase 8) are reused as-is for AGENCY logins. `AgenciesService.approveRequest`
(Phase 3) is extended to also generate a one-time temp password (identical
pattern to `EmployeesService.resetPassword`'s `generateTempPassword`, now
lifted into a shared `backend/src/common/temp-password.ts` since two modules
need it) and set `mustChangePassword: true` — without this, an approved
agency's `User` row had `passwordHash: null` and could never log in; this
was a real gap in Phase 3, not a deliberate deferral, and this phase closes
it. `AgenciesService.postMessage` gains a `senderIsAgency` parameter
(default `false`, preserving the existing staff-side call site) so this
phase's inbox POST can pass `true` — `AgencyMessage.senderIsAgency` already
existed in the Phase 3 schema in anticipation of exactly this.

Out of scope this phase (see `docs/API.md`'s reasoning): «صندلی‌های
تخصیص‌یافته» (no staff-side seat-allocation workflow exists to allocate
seats to an agency in the first place — would require inventing one);
«وب‌سرویس» self-service purchase+approval (no staff-side purchase-approval
counterpart exists; `AgencyApiKey` issuance stays Senior-Manager-initiated
per Phase 3, and its `keyHash` is one-way — a self-service tab could only
ever show key STATUS, never the value, so it was judged not worth a
half-feature this phase); staff-side `AgencyDocument` review; Excel export
(mock-only everywhere else in the codebase too).

## Phase 10 — Flight management (مدیریت پروازها)

Extracted from the FLIGHTS MANAGEMENT sections of `پنل مدیر ارشد.dc.html`
and `پنل مدیر بازرگانی.dc.html` (near-identical markup: KPI row, three
sub-tabs پروازهای فعال / انجام‌شده / آینده, add-flight modal, flight detail
modal, future-flight نرخ‌گذاری/allocation modal with the AI hint).

- `Airport { id, code (unique, e.g. THR/DXB), cityFa, tz (IANA) }` — new,
  seeded with the CLAUDE.md list (20 Iranian cities + DXB/IST/NJF).
  ⚑ The mocks' add-flight modal uses free-text مبدأ/مقصد; the real form
  uses selects fed by this table so `Route.originCode/destCode` stay
  valid codes and departure times can render in airport-local time later.
- `Route`/`Flight`/`FlightInstance` (Phase 2) are reused as-is for
  creation: «افزودن پرواز» = find-or-create `Route`, find-or-create
  `Flight` (unique `flightNo`, default `aircraftType "Airbus A320"` —
  the one seat-mapped type), create one `FlightInstance` (Jalali
  date+time → UTC `departureAt`; ⚑ `arrivalAt` = departure + a
  per-route seeded duration since the design has no arrival input).
- `FlightInstance` gains:
  - `basePriceIrr Int?` — the modal's «قیمت بلیط (تومان)» (stored rial).
    ⚑ This is the design's «قیمت پایه/نرخ اصلی» display figure AND the
    denominator for the completed-flights سود/ضرر comparison; it does NOT
    bypass Phase 6 — the bookable price remains the registered
    `FarePricingProposal` (per CLAUDE.md, pricing separate from
    availability).
  - `agencySeatsAllocated Int?` — the future-flight تخصیص modal's آژانس
    figure; مستقیم is always derived (`capacity − charterSeats −
agencySeatsAllocated`), never stored.
- ⚑ Statuses: the mocks show فعال / در حال فروش / تکمیل / لغو شده as
  hardcoded strings. Real mapping is derived server-side from
  `FlightInstanceStatus` + sales: `CANCELLED`→لغو شده; `DEPARTED` rows
  belong to پروازهای انجام‌شده; `SCHEDULED` with sold==capacity→تکمیل,
  with sold>0→در حال فروش, else فعال. No new enum values.
- ⚑ Completed-flights financials: the mocks fabricate an 18٪ profit
  margin and fixed channel ratios (`sysR/charR`). Real figures are
  aggregated from `Booking` (channel, priceIrr) per DEPARTED instance:
  سیستمی/چارتری/آژانس sums, متوسط نرخ = revenue/tickets, and سود/ضرر
  relative to the base rate (`(avg − base) × tickets`, split into the
  green/red columns). No fabricated margins (CLAUDE.md forbids invented
  figures); the design's column set is kept verbatim.
- ⚑ RRULE recurring schedules (`Schedule` entity from CLAUDE.md's domain
  model) have **no UI anywhere in the design** — every mock creates
  single instances. Per workflow rule 4 (design wins), Phase 10 ships
  single-instance creation only; the `Schedule` table is deferred until a
  design exists for it (noted as an open item, not silently dropped).
- Future-flight AI suggestions reuse Phase 6's `AiPriceSuggestion`
  persistence + ml-service path unchanged (advisory only).

---

## Phase 11 — Finance tab, passenger reports, staff reports

**No new tables and no schema changes.** Every figure is derived from
existing rows at query time, per CLAUDE.md's server-side-aggregates rule:

- مالی analytic view (CEO/Chair/Senior/Commercial): Phase 1 reporting
  queries over `LedgerEntry`/`Booking`/`FlightInstance` — reused unchanged.
- «تراکنش‌های مالی اخیر»: `LedgerEntry` (SALE/SETTLEMENT/COMMISSION/REFUND)
  joined to `AgencyProfile`/`Booking→Passenger` for the party label.
- «ترکیب درآمد»: SALE sums grouped by `Booking.channel`.
- «تسویه‌حساب آژانس‌ها»: `AgencyInvoice` per agency (paid ratio, earliest
  unpaid due date, overdue days) — presentation over Phase 3 data; the only
  write is the existing audited remind endpoint.
- گزارش مسافران: `Passenger` (name substring, or exact national-ID via the
  Phase 9 `nationalIdHash`) joined through `Booking` to flight/route; cabin
  derived from the `AircraftSeatMap` row bands; national ID rendered MASKED
  only (this surface never decrypts PII).
- گزارش کارمندان: `User(role=EMPLOYEE, dept∈caller's depts)` +
  `AuditLog(actorId∈those)` as the feed; the "new employee" banner rows are
  real `AuditLog(category=ACCOUNT)` creation events, not synthetic.

## Phase 12 — admins, security, settings, CEO logs, IT panels view

One new table:

- `SystemSetting { key String @id, value Json, updatedById?→User, updatedAt }` — key-value store for the تنظیمات سامانه tab (company info, gateway toggles, global site toggles, brand color). Server-side defaults fill missing keys; every write is audited (`category=SYSTEM`). ⚑ The chair mock's refund-rule inputs deliberately do NOT live here — they write the real Phase 7 `RefundPenaltyRule` rows so the refund engine and the settings screen can never disagree.

Everything else reuses existing tables: admins list/add/block/reset run on
`User` (+ `RefreshToken` for the real «آنلاین» derivation and the existing
`mustChangePassword` flag); CEO logs and the audit trail run on `AuditLog`;
the IT panels view reads `PanelAccessFlag` (read-only).

## Open items to confirm with the public-site track before merging

**Resolved 2026-07-22 (branches unified into `main`):**

1. ~~`Booking`/`Passenger`/`LedgerEntry` above are a minimal, forward-compatible
   guess...~~ Reconciled — see Phase 13 below. The public-site track's actual
   schema (`BookingStatus: DRAFT|HELD|PAID|TICKETED|CANCELLED|EXPIRED|REFUNDED`,
   `BookingChannel: SYSTEM|CHARTER|AGENCY`, `CabinClass`, `FareRule`) is the
   real one merged into `main` — this section's `DIRECT|AGENCY|VIP|MANAGERIAL`
   guess was never implemented and is superseded; no migration needed, just
   a doc correction (Phase 2's channel list above is historical/inaccurate,
   kept as-is for the historical record rather than silently rewritten).
2. ~~`ReservationSystem`'s `role="super"` string literal...~~ Resolved in
   Phase 9 and updated 2026-08-21: `CAN_SEAT_LOCK_ROLES` contains `CEO`,
   `BOARD_CHAIR`, `SENIOR_MANAGER`, and `COMMERCIAL_MANAGER`;
   `CAN_LOCK_ROLES` additionally contains `IT_MANAGER` for PNR operations.
   Senior Manager is no longer view-only.

---

## Phase 13 — Reservation engine completion, Part A: sale window, aircraft registration, real inventory pools

Follow-up audit (2026-07-22) against a from-scratch reservation-engine spec
the user provided, checked line-by-line against the actual merged code (not
the mocks — none of this is grounded in a `.dc.html` design file, since no
design shows these controls; see the "not built here" list at the end for
the parts of that spec deliberately deferred pending a product decision,
per workflow rule 4 — design/product intent wins, this file doesn't invent
UI that was never specified anywhere).

- `FlightInstance` gains:
  - `saleStartsAt DateTime?`, `saleEndsAt DateTime?` — optional sale window.
    `NULL` on either end means "no restriction" (today's behavior, so every
    existing seeded/tested instance keeps working unchanged). When set,
    `SearchService.search`/`searchUncached` excludes instances where
    `now < saleStartsAt` or `now > saleEndsAt`, and `BookingService.createBooking`
    re-checks the same window server-side (never trust that a client that
    fetched search results a while ago is still inside the window) — 409
    `SALE_WINDOW_CLOSED` if not.
  - `aircraftRegistration String?` — the physical tail number assigned to
    this specific flown instance (a recurring `Flight`/`Schedule` keeps the
    same `aircraftType` across dates, but the actual airframe varies
    per-departure in reality) — display-only, no booking logic reads it.
  - ⚑ **Aircraft-type change is NOT a free-text field flip.** Changing the
    instance's effective `aircraftType`-derived capacity (i.e. re-pointing it
    at a different `AircraftSeatMap`) goes through a new
    `FlightsService.changeAircraftType(instanceId, newAircraftType)` that:
    1. Loads the new `AircraftSeatMap`'s total seat count.
    2. Counts currently CONFIRMED-or-later seats (`Booking.status IN
(PAID, TICKETED)` for this instance, plus active `SeatLock` rows).
    3. If the new capacity is `<` that count, **rejects with 409
       `CAPACITY_BELOW_CONFIRMED`** — the response includes the shortfall
       count so staff can see how many passengers would need manual
       rebooking/cancellation first. The engine does **not** auto-cancel or
       auto-rebook paying customers — that's a business/legal decision
       (refund policy, compensation, rebooking priority) with no design or
       product guidance anywhere, so it's surfaced as a blocked action for a
       human to resolve deliberately, not automated.
    4. Otherwise updates `capacity` (from the new seat map's total) and a
       new `Flight.aircraftType` pointer _for this instance only_ — this is
       genuinely an instance-level override, so `FlightInstance` gains its
       own nullable `aircraftTypeOverride String?` (falls back to
       `Flight.aircraftType` when null) rather than mutating the shared
       `Flight` row, which would silently change every other instance of
       the same recurring schedule.

- **Real inventory pools** (currently `charterSeats`/`agencySeatsAllocated`
  are informational-only integers — nothing actually stops a `SYSTEM`-channel
  booking from consuming a seat that was supposed to be reserved for charter
  or an agency's quota). `SearchService.takenSeatCodes` today returns one
  undifferentiated set of taken seat codes; this phase makes the channel
  pools real without introducing a per-seat-code pool assignment (matching
  the user's own inventory-vs-seat-map distinction — a pool is a _count_,
  the seat map is _which physical seat_, and they're deliberately kept
  separate):
  - New `SearchService.takenSeatCodesByChannel(flightInstanceId)` — same
    query as today's `takenSeatCodes` but grouped by `Booking.channel`
    (`SeatLock` rows count toward a new virtual `MANAGERIAL` bucket, not
    `SYSTEM`, so a managerial lock can never silently eat into the public
    pool's count).
  - `BookingService.createBooking`'s existing `FOR UPDATE`-guarded
    transaction gains a pool check alongside the existing per-seat-code
    conflict check: `AGENCY`-channel bookings 409 once
    `takenByChannel.AGENCY >= flightInstance.agencySeatsAllocated`;
    `CHARTER`-channel bookings 409 once `takenByChannel.CHARTER >=
flightInstance.charterSeats`; `SYSTEM`-channel (public/direct)
    bookings 409 once `takenByChannel.SYSTEM >= capacity − charterSeats −
agencySeatsAllocated − takenByChannel.MANAGERIAL` (managerial locks
    still physically occupy a seat, so they still count against the public
    pool's remaining count — only the agency/charter split is separated
    out). Error code `POOL_EXHAUSTED`, includes which pool.
  - ⚑ **Scope cut for this phase:** `SearchService.search`'s per-cabin
    `seatsLeft` stays "physically unoccupied seats in that cabin" (unchanged)
    rather than being reworked into a per-pool number — the pool split
    (charter/agency/managerial) is currently instance-wide, not per-cabin,
    so an accurate per-cabin-per-pool display number needs the cabin-level
    allotment model Phase C is scoped to build; doing it here risked a
    display figure that quietly disagreed with the cabin-level fare-class
    math (Phase 6/booking-engine's `pricing.ts`). What ships THIS phase is
    the hard guarantee that matters most — `createBooking` rejects a
    booking that would exceed its channel's pool even while the display
    still shows physical vacancy — not the softer, cosmetic display
    number. Revisit once Phase C lands.

- **Not built in this phase (needs a product decision first, not invented):**
  - `DRAFT` / `PENDING_APPROVAL` flight-instance statuses (from the user's
    spec) — no design file or existing panel shows a flight-approval queue,
    and today every `Flight`/`FlightInstance` created via Phase 10's «افزودن
    پرواز» goes live immediately. Adding a mandatory approval gate would be
    a real workflow change (who approves? does it block search
    immediately or only for a still-configuring flight?) with no grounding
    to build against — flagged here rather than guessed.
  - Full 6-status IATA-style flight lifecycle beyond `SCHEDULED → CLOSED
(derived from the sale window, not a stored status) → DEPARTED /
CANCELLED` — same reasoning; the user's spec's "بسته" state is covered
    by the sale-window fields above without inventing a separate manual
    toggle no design asks for.

---

## Phase 13 — Reservation engine completion, Part B: manageable fare classes + rate rules

No design file shows a fare-class management screen anywhere (none of the
six executive panels' diffs from the design refresh mention Y/B/M class
editing) — this phase is backend-only (endpoints + validation + tests),
same posture as Phase 6 before its UI existed. A frontend for this waits
for an actual design.

- `FareRule` (existing, previously seed-only — this phase adds the first
  way to create/edit/delete rows outside `seed.ts`) gains:
  - `validFrom DateTime?`, `validUntil DateTime?` — NULL on either end
    means unrestricted (existing seeded rows keep working unchanged).
    `resolveFareClass` (booking-engine/pricing.ts) now filters out a rule
    whose window doesn't cover "now" before picking the cheapest
    available bucket — an expired/not-yet-active class is invisible to
    pricing, not merely unavailable to buy.
  - `allowedChannels BookingChannel[]` — empty array (the default) means
    "all channels", matching the sale-window NULL convention above. A
    class scoped to e.g. `[AGENCY]` is invisible to a `SYSTEM`-channel
    booking's price resolution. (No channel actually creates AGENCY/
    CHARTER bookings yet — Phase C's job — so this is currently only
    exercised by SYSTEM-channel bookings seeing an empty/wildcard list;
    the filter is there so Phase C doesn't need a second migration.)
  - `taxIrr Int @default(0)` — per-passenger tax/fee, added on top of
    `priceIrr` at booking time (`getCabinPrice` returns the pre-tax fare
    unchanged for backward compatibility with every existing caller;
    `BookingService.createBooking` adds `taxIrr × passengers.length` to
    the stored `priceIrr` total when the resolved fare came from a
    `FareRule`, and the booking-detail response breaks out `taxIrr` so a
    receipt can show it separately — see docs/API.md). Flat/no-fare-class
    pricing (`CabinFare`/`FarePricingProposal`) is untouched — it was
    never in the multi-class scope this phase is fixing.
  - `changeable Boolean @default(true)` — mirrors the existing
    `refundable` flag's pattern (a same-shape yes/no gate, not a new
    concept). ⚑ Deliberately NOT wired to any enforcement yet: no
    "change reservation date" endpoint exists anywhere in the codebase to
    gate — adding the flag now (like `refundable` did originally) means
    that endpoint won't need a migration when it's eventually built.
  - `baggageAllowanceKg Int?` — informational only (shown alongside the
    fare, never validated against anything — there's no check-in/weigh-in
    flow in this codebase to enforce it against).

- **New endpoints** (`backend/src/modules/flights/`, same
  `SENIOR_MANAGER`/`COMMERCIAL_MANAGER` role gate as Phase 10's existing
  flight-management endpoints — fare classes are a flight-configuration
  concern, not a new domain):
  - `GET /flights/:instanceId/fare-rules` — list, ordered by `priceIrr`.
  - `POST /flights/:instanceId/fare-rules` — create. ⚑ **Capacity-sum
    validation** (the user spec's explicit "انجین باید مانع شود مجموع فروش
    کلاس‌ها از ظرفیت کابین بیشتر شود"): the sum of `seatsAllocated` across
    every rule sharing `(flightInstanceId, cabin)`, including the new one,
    must not exceed that cabin's physical seat count (from
    `AircraftSeatMap` via `enumerateSeats`, filtered to the cabin) — 400
    if it would. Also 400 if `validUntil <= validFrom` when both are set.
  - `PATCH /flights/:instanceId/fare-rules/:id` — same capacity-sum and
    date-window validation, re-checked against the OTHER existing rules
    (excluding the one being edited).
  - `DELETE /flights/:instanceId/fare-rules/:id` — 409 if any active
    (`DRAFT|HELD|PAID|TICKETED`) booking is already stamped with that
    `classCode` for the instance (mirrors the "REGISTERED proposal is
    locked" pattern from Phase 6 — never orphan a sold booking's price
    basis).

- **Explicitly not built this phase (spec items with no clear operational
  meaning in the current architecture — flagged per workflow rule 4, not
  guessed):**
  - «مهلت صدور» (ticketing deadline) — the current booking state machine
    collapses `PAID → TICKETED` atomically inside one `pay()` call (see
    Phase 2/booking-engine); there is no window where a booking sits PAID-
    but-not-yet-ticketed for a deadline to apply to. Adding this field
    would be inventing a gap in the pipeline that doesn't otherwise exist,
    purely to give the field somewhere to matter — needs a real product
    decision on whether/why payment and ticketing should ever be separate
    steps before this is worth building.
  - «حداقل ظرفیت فروش» (minimum sale capacity) — unclear what this means
    operationally for a single fare-class row (a floor the class refuses
    to sell below? a minimum guaranteed allocation regardless of demand?
    something else?) — flagged rather than guessed at.
  - Per-fare-class cancellation-penalty override — Phase 7's
    `RefundPenaltyRule` is already a global hours-before-departure
    schedule (30/50/70/100٪ tiers) that's the seeded, actually-executed
    source of truth for every refund today. A per-class override would
    mean two competing penalty systems disagreeing with each other for
    the same booking; `changeable`/`refundable` booleans (gates, not
    amounts) avoid that conflict, but a genuine per-class fee schedule
    needs a product decision on how it interacts with Phase 7's existing
    global rule before it's built.

---

## Phase 13 — Reservation engine completion, Part C: real per-agency allotments

`FlightInstance.agencySeatsAllocated` (Phase 10) is a single instance-wide
number with no link to which agency it's for, no contract terms, and no
soft/hard distinction — the user spec's "سهمیه آژانس" section asks for a
real per-agency breakdown of that quota (contract party, seat count,
firm-vs-refundable, release deadline, contract price). This phase adds
that breakdown; it does NOT touch `agencySeatsAllocated` itself or Phase
10's existing `PATCH /flights/:instanceId/plan` endpoint that writes it —
that field stays the coarse "how many seats total are reserved for
agencies" cap Phase A's public-pool formula already reads. Allotments
subdivide that same cap across specific agencies, the same way Phase
13B's fare-class capacity-sum check subdivides a cabin's physical seats
across price classes — additive, not a replacement.

- New `AgencyAllotment { id, agencyId→AgencyProfile, flightInstanceId→FlightInstance, seatsAllocated Int, type: AllotmentType (SOFT|HARD) @default(HARD), releaseAt DateTime?, contractPriceIrr Int?, createdById→User, createdAt }`.
  - `type: HARD` — "آژانس یا چارترکننده نسبت به ظرفیت تخصیصی متعهد است، حتی
    اگر آن را نفروشد" (the user spec's exact wording) — no `releaseAt`
    needed; the seats stay reserved for this agency until staff explicitly
    deletes the allotment.
  - `type: SOFT` + `releaseAt` — "صندلی‌های فروش‌نرفته در موعد مشخص به
    فروش عمومی بازمی‌گردند." Once `releaseAt` has passed, this row is
    excluded from the active-allotment sum (lazy, computed at read/
    validation time — same pattern as `Booking`'s `HELD`→`EXPIRED`
    materialization, no cron job) — its seats become available to the
    general agency pool again without deleting the historical row.
  - `contractPriceIrr` — this specific agency's contracted per-seat rate,
    nullable (falls back to normal price resolution when unset). Kept
    separate from Phase 13B's `FareRule.allowedChannels` because a fare
    rule scoped to `[AGENCY]` would be shared by every agency — an
    allotment's contract price is deliberately one specific agency's deal.
  - ⚑ No per-allotment credit cap: `AgencyCreditLine` (Phase 3) already
    owns the agency's overall financial credit limit. A second,
    allotment-level credit cap would be a competing figure with no clear
    reconciliation rule — same reasoning as Phase 7's refund-penalty
    conflict above.
- **Capacity-sum validation** (mirrors Phase 13B's fare-class check): the
  sum of `seatsAllocated` across every _active_ allotment (HARD, or SOFT
  with `releaseAt` still in the future or unset) for an instance, including
  the one being created, must not exceed `FlightInstance.agencySeatsAllocated`
  — 400 if it would, and 400 if `agencySeatsAllocated` is unset (staff must
  set the coarse quota via Phase 10's `plan` endpoint first).
- New endpoints (`backend/src/modules/flights/`, same `SENIOR_MANAGER`/
  `COMMERCIAL_MANAGER` role gate): `GET/POST /flights/:instanceId/allotments`,
  `DELETE /flights/:instanceId/allotments/:id` (409 if any active booking
  already exists for that agency on this instance — mirrors Phase 13B's
  delete-guard for fare rules).

- **Explicitly not built this phase (needs its own dedicated design, not
  guessed at here):**
  - An agency actually BOOKING against its own allotment. Today literally
    nothing in the codebase ever creates an `AGENCY`-channel `Booking` row
    (confirmed while auditing Phase 13A — `channel: 'AGENCY'` only appears
    in reporting's group-by queries, never in a create call). Building
    this properly means an agency-side payment path that draws down
    `AgencyCreditLine` (Phase 3) instead of the Shetab/IPG gateway or
    wallet/points — a genuinely different payment method from every path
    `BookingService.pay()` currently supports, not a small addition to it.
    That deserves its own phase once the credit-billing flow is designed,
    rather than a rushed half-integration bolted onto this one. This
    phase ships the allotment bookkeeping (so staff can plan/contract
    agency capacity today); consuming it from an actual agency booking is
    the next phase.

---

## Phase 13 — Reservation engine completion, Part D: managerial reservation governance

Phase 9's `SeatLock` is a single-step control today: any `CAN_LOCK_ROLES`
member (`CEO`, `BOARD_CHAIR`, `IT_MANAGER`) locks a seat directly, with no
reason on record, no spending classification, no cap on how many seats one
person can hold, and no expiry — a lock sits active forever until someone
remembers to release it. The user's spec asks for real governance around
this: a reason, a free/discounted/payable classification, the requester's
rank on record, a per-requester seat cap, a hold-to-ticket deadline with
auto-release, and a genuine two-step request→approval flow before a lock
can be turned into a ticket. This phase adds all of that directly onto
`SeatLock` — it's still the same table Phase 9 built, not a new model,
because every new field describes that same row's lifecycle.

- `SeatLock` gains:
  - `reason String` — required free-text justification for the request
    (⚑ migration default `""` for the handful of pre-existing dev/test
    rows only; the DTO makes it mandatory for every new request — no real
    production lock exists yet, the platform hasn't launched).
  - New enum `LockClassification { FREE, DISCOUNTED, PAYABLE }` — the
    seat's eventual charge basis, decided at request time.
    `classification LockClassification @default(PAYABLE)`.
  - `discountPct Int?` — 0–100, required by the DTO only when
    `classification: DISCOUNTED`; ignored otherwise.
  - `requesterRank Role` — a snapshot of the requester's `User.role` at
    request time, not a live join. ⚑ Deliberate: if a requester's role
    ever changes later (promotion/demotion), the audit trail must keep
    showing what rank actually authorized the original request, the same
    reasoning `AgencyAllotment.contractPriceIrr` and other historical
    snapshot fields already use elsewhere in this schema.
  - New enum `LockApprovalStatus { PENDING_APPROVAL, APPROVED, REJECTED }`,
    `approvalStatus LockApprovalStatus @default(APPROVED)` (⚑ default only
    backfills pre-existing rows as already-decided; every new lock is
    always created `PENDING_APPROVAL` — the default never applies to a
    request going through the real flow).
  - `approvedById String?` / `approvedAt DateTime?` → `User` (`"SeatLockApprovedBy"`),
    `rejectedById String?` / `rejectedAt DateTime?` → `User` (`"SeatLockRejectedBy"`),
    `rejectionReason String?`.
  - `expiresAt DateTime` — a single deadline field reused across both
    phases of the lock's life instead of two separate TTL columns: set to
    `createdAt + 24h` at request time (**request-decision deadline** — a
    `PENDING_APPROVAL` lock nobody acts on stops blocking the seat after a
    day) and overwritten to `approvedAt + 48h` at approval time
    (**hold-to-ticket deadline** — an approved-but-never-finalized lock
    stops blocking the seat after two days). ⚑ Both windows are fixed
    constants (`LOCK_REQUEST_TTL_HOURS = 24`, `LOCK_HOLD_TTL_HOURS = 48`)
    rather than configurable — no design or spec value exists for either,
    and CLAUDE.md forbids inventing numbers presented as configurable
    product settings; these are documented code constants, changeable by
    a future phase if a real requirement shows up.
  - `bookingId String?` → `Booking` (`"SeatLockFinalizedBooking"`) — set
    when the lock is finalized into a real ticketed PNR, for traceability
    from the lock's audit trail to the booking it produced.
  - Auto-release mirrors `Booking`'s `HELD`→`EXPIRED` materialization
    exactly (no cron): reads (seat map, pool counts) filter on
    `releasedAt: null AND expiresAt > now`, and the two write paths that
    actually contend for a seat — creating a new lock, and finalizing one
    into a booking — first run a conditional `updateMany` that stamps
    `releasedAt: now` (system release, `releasedById` stays null so it's
    distinguishable from a human release) on any lock for that seat whose
    `expiresAt` has already passed. This has to be a real write rather
    than a purely-lazy read-time exclusion, unlike Part C's SOFT
    allotments: the DB-level partial unique index (`WHERE releasedAt IS
NULL`) that guarantees one active lock per seat can't itself express
    "and not expired" (`now()` isn't allowed in a partial-index
    predicate), so an expired row has to actually be released before a
    new lock on the same seat can be inserted. `approvalStatus`,
    `reason`, and every other governance field are untouched — the row
    stays queryable for audit with its true history.
- **Two-step approval, segregation of duties (⚑ product decision — the
  user's spec says "authorized unit finalizes" without naming a distinct
  role, and broadening `CAN_LOCK_ROLES` would be inventing a new role):**
  requesting and approving both stay within the existing
  `CEO`/`BOARD_CHAIR`/`IT_MANAGER` set, but **a requester can never approve
  or reject their own request** (409 if attempted) — a real two-step
  control between the three governance roles rather than a single person
  rubber-stamping themselves. Rejection immediately sets `releasedAt`
  (frees the seat right away, no need to wait out `expiresAt`).
- **Per-requester seat cap (⚑ scoped globally, not per-flight — a cap
  meant to bound how many seats one manager can hold locked across the
  whole airline at once, not per route):** a fixed constant
  (`MAX_ACTIVE_MANAGERIAL_LOCKS_PER_REQUESTER = 5`, same "documented code
  constant, not a fabricated configurable setting" reasoning as the TTLs
  above) counted against the requester's own currently-active
  (`releasedAt: null AND expiresAt > now`) locks across every flight
  instance; 409 `LOCK_CAP_EXCEEDED` past the cap.
- **Finalize** — turning an `APPROVED`, not-yet-expired lock into a real
  `TICKETED` booking: reuses `PnrService`'s existing manual-issuance path
  (same pricing fallback, same PII handling), but the price is now derived
  from the lock's `classification`: `FREE` → `priceIrr: 0`; `DISCOUNTED` →
  base price minus `Math.round(base * discountPct / 100)` (same rounding
  convention as Phase 7's `penalty.ts`); `PAYABLE` → unchanged base price.
  `taxIrr` is not computed for this manual path — matches Part A/B's
  existing `issue()` behavior, which never applied `FareRule.taxIrr`
  either; extending that is out of scope here. On success the lock is
  stamped `releasedAt`/`bookingId` (finalized, no longer "active" — the
  seat is now held by the real `Passenger` row instead).
- **Explicitly not built this phase:** a UI for any of this (no design
  screen shows a request/approval queue — Phase 9's own screen already
  ships single-step locking only; this is backend governance ahead of a
  design that doesn't exist yet, same situation Part B was in); email/SMS
  notification to the approver when a request is pending (no notification
  design exists here either — `AuditLog` is the only trail for now).

---

## Phase 14 — real SmsProvider + management log

CLAUDE.md specifies a `SmsProvider` interface (OTP, ticket issuance,
refund notifications; mock in dev). It was never actually built: OTP/2FA
delivery goes through the generic `TwoFactorProvider` (mock, just logs
the code — see Phase 1), and two other call sites _claim_ SMS delivery in
their audit-log text with no send behind it at all —
`AdminsService.create`/`resetPassword`'s own comment says so explicitly
("nothing is fabricated as 'sent' beyond the audit note"). Phase 12's IT
panel already has an `InternalService(key:"sms")` row (enable/disable
toggle, ported from the design mock including its `uptimePct: 99.8` —
itself a pre-existing minor deviation from CLAUDE.md's no-fabricated-data
rule, not introduced here) and an `ExternalServiceConfig(key:"ext_kavenegar")`
row for the vendor. This phase adds the missing piece: a real interface +
mock provider, a real send log, and a management tab over that log — per
the user's explicit scope (2026-07-22): **management panel only**
(settings + a real log), not a redesign, and **no fabricated uptime**.

- New `SmsProvider` interface (`backend/src/common/sms/`), same pattern
  as `PaymentGateway`/`AiProvider`: `send(phone, message, messageType):
Promise<{ success, failureReason? }>`. `MockSmsProvider` logs the
  message at `info` level (same reasoning as `MockTwoFactorProvider`:
  it's the only delivery channel until a real vendor is wired) and always
  reports success — it never fabricates a random failure rate.
- New `SmsLog { id, phone, messageType: SmsMessageType (OTP|TEMP_PASSWORD),
status: SmsStatus (SUCCESS|FAILED), failureReason?, createdAt }`. Stores
  the phone number in plaintext (same treatment `User.phone` already gets
  elsewhere in this schema — it isn't encrypted-PII like national ID),
  masked only at the IT panel's read layer (`0912***5678`), never the
  message body/OTP code/password itself (CLAUDE.md: never log secrets).
- `SmsService` (new, wraps the provider): checks
  `InternalService(key:"sms").enabled` for **display purposes only** — it
  does NOT gate whether a real send is attempted. ⚑ Deliberate: today
  that toggle has zero functional effect (it's decorative, per its
  existing Phase 12 code); making it newly load-bearing for actual OTP/
  login delivery would mean a wrong click in the IT panel could break
  customer login — a real product-safety change nobody asked for. The
  toggle stays exactly as informational as it already was; this phase
  only adds a genuine log under it.
- The only genuine (non-fabricated) failure mode this phase introduces:
  **no phone on file**. `AdminsService.create`/`resetPassword` accept a
  `delivery: 'sms'|'email'` flag but their DTOs never collect a phone
  number for the new/target account — so an `sms` delivery on an account
  with `phone: null` logs a real `FAILED` row (`این حساب شماره موبایل
ثبت‌شده ندارد`) instead of a fabricated success. This is an honest
  reflection of a pre-existing gap (delivery was never real before), not
  a new bug — ⚑ flagged here rather than silently worked around by
  inventing a phone-collection field on the admin-create form, which
  would be its own product decision outside this phase's scope.
- Three real send sites wired through `SmsService` (matching the user's
  own scope wording, "OTP/رمز موقت"):
  1. `MockTwoFactorProvider.sendCode` — logs `OTP` when the user has a
     phone (2FA/OTP can also go by email under the same interface; only
     the phone-bound case is an SMS send, so only that case gets a
     `SmsLog` row).
  2. `AdminsService.create` — logs `TEMP_PASSWORD` when `delivery: 'sms'`.
  3. `AdminsService.resetPassword` — logs `TEMP_PASSWORD` when
     `delivery !== 'email'` (matches its existing ternary's own default).
     Employees' own reset-password (`EmployeesService.resetPassword`) makes
     no delivery claim at all today (returns the plaintext password once,
     no audit text asserting it was sent) — left untouched, out of scope.
     Agencies' invoice reminder (`AgenciesService.remindInvoice`) similarly
     only _comments_ that it's "queued via SmsProvider" with no delivery
     claim in its audit text or DTO — also left untouched; wiring it would
     mean inventing what an invoice-reminder SMS says, which nothing in the
     design specifies.

**Addendum (post-Phase-67): real `KavenegarSmsProvider`.** The
`ext_kavenegar` row above was previously decorative (an
`ExternalServiceConfig` entry with no code behind it). Added
`backend/src/common/sms/kavenegar-sms.provider.ts` implementing the same
`SmsProvider` interface, calling Kavenegar's real send API
(`https://api.kavenegar.com/v1/{key}/sms/send.json`). `sms.module.ts`
permanently binds `SMS_PROVIDER` to `KavenegarSmsProvider`; the class
itself checks the `ext_kavenegar` `ExternalServiceConfig` row (Phase 28's
IT Manager panel → سرویس‌های خارجی) on every send and falls back to
`MockSmsProvider` whenever it's disabled or has no key configured. The
API key is **not** a server env var — it's the same encrypted-at-rest
(`apiKeyEncrypted`, via `encryptPii`), IT_MANAGER-editable mechanism
already used for زرین‌پال/آمادئوس/نشان, so it can be set/rotated live
from the panel with no server access or restart. `KAVENEGAR_SENDER_LINE`
remains the one SMS-related env var (the approved originator line — not
a secret, optional). The seed `ext_kavenegar` row ships disabled/keyless,
so the existing test suite never makes a real network call. Failures
(bad credit, invalid line, network error) are reported as real
`SmsLog(status: FAILED)` rows via the existing `SmsService`, never
fabricated as success.

---

## Phase 13 — Reservation engine completion, Part E: PNR lifecycle completion + payment reconciliation

Two real gaps found while auditing the booking/payment path for this
phase, both fixed the same way as everywhere else this session: real
data, computed lazily, no fabrication, no invented signals.

**1. `FlightInstance.status: DEPARTED` was never written anywhere.** It's
read by `reporting.service.ts`'s completed-flights query and
`flights.service.ts`'s پروازهای انجام‌شده list, but no code path — no
cron, no endpoint — ever transitions an instance from `SCHEDULED` to
`DEPARTED` once its `departureAt` passes. Only `prisma/seed.ts` sets it
by hand for historical demo rows. So every "completed flights" report has
been running against whatever the seed happened to backdate, never a
real flight that actually departed during a live session. Fixed with the
same lazy/computed pattern used for `HELD`→`EXPIRED` bookings and Part
C/D's expiry filters — no cron:

- `materializeDepartedInstances(prisma)` (new shared util,
  `backend/src/modules/flights/flight-lifecycle.util.ts`): one bulk
  `updateMany({ where: { status: 'SCHEDULED', departureAt: { lte: now } },
data: { status: 'DEPARTED' } })`. Called at the top of every place that
  reads `DEPARTED` for real decisions: the reporting completed-flights
  query, the flight-management پروازهای انجام‌شده list, and the new
  no-show endpoint below.

**2. No `NO_SHOW`/`FLOWN` distinction, and no signal to base one on.**
`Booking` has no boarding/check-in concept anywhere — no gate scan, no
check-in endpoint, nothing in the design shows one either (confirmed: no
design-reference screen mentions «عدم حضور» or no-show). Building an
automatic FLOWN-vs-NO_SHOW split would mean fabricating a boarding
signal that doesn't exist. ⚑ Product decision: **default every
`TICKETED` booking on a `DEPARTED` instance to `FLOWN`** (lazily, same
bulk-materialize pattern — a booking is presumed flown unless someone
says otherwise, matching how a real airline's default assumption works
before check-in data exists); **staff can override to `NO_SHOW`** via a
new manual action once the flight has actually departed — this is a real
operational action (ops reviewing the manifest after departure), not a
fabricated automatic flag.

- New enum values: `BookingStatus` gains `NO_SHOW`, `FLOWN`.
- `materializeFlownBookings(prisma)` (same util file): after
  materializing departed instances, bulk-flips every `TICKETED` booking
  whose instance is now `DEPARTED` to `FLOWN`.
- `PnrService.markNoShow` (new) — only from `TICKETED` or `FLOWN`
  (already lazily flipped) on an actually-`DEPARTED` instance; 409
  `FLIGHT_NOT_DEPARTED` if the flight hasn't departed yet, 409 `CONFLICT`
  if the booking is `CANCELLED`/`REFUNDED`/already `NO_SHOW`. No refund-
  penalty interaction is built here — whether a no-show forfeits a refund
  is Phase 7's `RefundPenaltyRule` engine's own decision to make later;
  this phase only adds the state and its legal transitions.

**3. Payment reconciliation — the real gap in `BookingService.pay()`.**
For `paymentMethod: 'GATEWAY'`, `gateway.request()`/`gateway.verify()`
run and can return `ok: true` (money genuinely captured by the PSP)
**before** the `$transaction` that flips `HELD`→`PAID`→`TICKETED` even
starts. If that transaction throws for ANY reason afterward — a promo
code that turns out to be already-redeemed, a DB hiccup, a process
crash — the whole transaction rolls back and the booking silently stays
`HELD` (or later expires), while the customer's money has already been
taken. Today there is **no record anywhere** that this happened; this is
a real, latent bug this phase closes, not a new feature bolted on for its
own sake.

- New `PaymentReconciliation { id, bookingId→Booking, gatewayRefId,
amountIrr, status: PaymentReconciliationStatus (PENDING|RESOLVED)
@default(PENDING), resolvedById?→User, resolvedAt?, resolutionNote?,
createdAt }`.
- `BookingService.pay()`: right after `gateway.verify()` returns
  `ok: true` (GATEWAY method only — WALLET/POINTS are synchronous
  internal ledger moves fully inside the one transaction, nothing
  external to reconcile against), creates a `PENDING` reconciliation row
  **before** entering `$transaction`. Inside that same transaction, once
  ticket issuance (`PAID`→`TICKETED`) succeeds, the row is flipped to
  `RESOLVED` in the same atomic unit. If the transaction throws for any
  reason, the row is simply never flipped — it stays `PENDING`, and its
  mere existence past that point IS the mismatch signal. No separate
  catch-block bookkeeping needed.
- New `backend/src/modules/reconciliation/` module (`FINANCE_MANAGER`
  only, matching Phase 7 refunds' own role gate — this is the same
  finance-ops surface): lists `PENDING` rows (money captured, no matching
  ticketed booking) for staff to manually resolve (re-run issuance, or
  reverse the gateway charge via the existing `PaymentGateway.reverse`),
  and a resolve action that stamps `resolvedById/At` + a free-text note.
- **Explicitly not built this phase:** automatic resolution (e.g., a
  background job that retries ticket issuance on its own) — a `PENDING`
  row means something already went wrong once; auto-retrying blind risks
  double-charging or double-issuing, exactly the kind of thing CLAUDE.md's
  idempotency-key rule exists to prevent elsewhere but shouldn't be
  re-invented ad hoc here. Staff review is the safer default until a real
  auto-resolution policy is designed.

---

## Phase 15 — step-up verification for high-risk operations

CLAUDE.md (updated 2026-07-22) requires step-up verification for sensitive
agency account changes, and the original spec's §5.1 names five more:
role change, API-key issuance/rotation, refund payout, price/capacity
change, session revocation. Confirmed by audit: none of these had any
re-authentication gate beyond the actor's existing session JWT — the same
15-minute access token that authorized every OTHER request today could
also authorize wiping every active session site-wide. This phase adds a
real, reusable step-up mechanism and wires it into every high-risk
operation that actually exists in the codebase today.

- **Reuses `TwoFactorChallenge` rather than a new table** — same
  codeHash/expiresAt/consumedAt/attempts machinery already proven at
  login, just a new `purpose: STEP_UP_VERIFICATION` and a new nullable
  `scope: StepUpScope?` column (only meaningful for that purpose) so a
  challenge issued for one sensitive action can't be replayed against a
  different one.
- New enum `StepUpScope { ADMIN_ROLE_CHANGE, API_KEY_ROTATE,
REFUND_PAYOUT, PRICE_CAPACITY_CHANGE, SESSION_REVOKE }` — exactly the
  five real call sites found (see API.md); no speculative scopes added.
- `StepUpService` (new, `backend/src/modules/auth/step-up.service.ts`):
  `request(actor, scope)` creates the challenge and sends the code
  through the SAME `TwoFactorProvider.sendCode()` already used for staff
  2FA login — not a separate delivery path. For AGENCY actors (who always
  have a phone) this is a genuine SMS OTP end-to-end (logged in Phase 14's
  `SmsLog`), satisfying CLAUDE.md's explicit "SMS OTP" wording for agency
  account changes; for staff actors it uses whatever channel their 2FA
  already uses. `verify(actor, challengeId, code, scope)` checks
  ownership, purpose, scope match, expiry, attempt cap, and code — then
  consumes the challenge. Every sensitive endpoint calls `verify()` as its
  very first action, before touching any other state.
- ⚑ **AGENCY_ACCOUNT_CHANGE was not wired to anything**: audited and
  confirmed no endpoint exists anywhere (staff-side or agency self-
  service) that changes an agency's username/phone/email/password/MFA
  device today — `agencies.service.ts` only has suspend/credit/API-key
  operations. Per CLAUDE.md workflow rule 4, this phase does not invent
  that endpoint just to attach step-up to it; the requirement stays
  documented here as a MUST for whichever future phase builds it.
- One new endpoint (`POST /auth/step-up/request`) is enough for every
  scope — no per-scope request endpoints. Verification itself is inline:
  each sensitive endpoint's existing DTO gains `stepUpChallengeId` and
  `stepUpCode` fields rather than requiring a separate "verify, get a
  temp token, attach it" round trip.

---

## Phase 16 — agency self-registration + real seat allotments

Ground truth for this phase is the live `ورود و ثبتنام.dc.html` design
(confirmed against a fresher Claude Design screenshot than the exported
`design-reference/` snapshot — user-approved as authoritative): a single
public auth page has an «آژانس همکار / کاربر عادی» account-type toggle and
«ثبت‌نام / ورود» tabs. The agency signup tab collects: نام آژانس
(agency name), شماره مجوز بند ب (license number), نام مدیر آژانس
(manager name), شماره موبایل (mobile, with an inline format-valid
checkmark), a terms checkbox, and a single submit button «ثبت درخواست و
دریافت کد» (submit request AND receive code) — no email field, no
separate "get code" step before submit.

- **This is a new front door onto the EXISTING `AgencyMembershipRequest`
  model** (`agencies.service.ts` `approveRequest`/`rejectRequest`/
  `referRequest`, built in Phase 3) — audited and confirmed that workflow
  already creates the `User(role: AGENCY)` row with a one-time temp
  password on approval. This phase adds the public submission side (never
  existed — staff could previously only view/decide on rows seeded or
  manually inserted) AND corrects the review-chain role gates to match the
  real process, per explicit user correction (not the original audit's
  reading of "any of SENIOR_MANAGER/FINANCE_MANAGER/COMMERCIAL_MANAGER can
  approve directly"): **پیش‌ثبت‌نام (this new public submission) → اول
  ادمین سایت بررسی و ارجاع می‌دهد → مدیر بازرگانی تأیید نهایی می‌کند →
  پیامک تأیید و دسترسی برای آژانس ارسال می‌شود.**
  - `SITE_ADMIN` gets read+refer access to `GET /agencies/requests`,
    `GET /agencies/requests/:id`, `PATCH /agencies/requests/:id/refer` —
    added via an explicit method-level `@Roles(...)` override on those
    three routes (the controller's class-level `@Roles(...AGENCY_TAB_ROLES)`
    excludes `SITE_ADMIN` entirely today and stays as-is for every other
    route — agency financial/credit data is NOT part of this grant).
  - `PATCH /agencies/requests/:id/approve` **tightens** from
    `SENIOR_MANAGER | FINANCE_MANAGER | COMMERCIAL_MANAGER` to
    `COMMERCIAL_MANAGER` only — final approval is that role's call, not
    three roles' shared call, per the corrected flow.
  - `PATCH /agencies/requests/:id/reject` gets `SITE_ADMIN` added
    alongside the existing gate — either the first-line reviewer or the
    final approver can reject an obviously-invalid submission; approval
    stays single-role.
  - `approveRequest` now **sends a real SMS** (same `SmsProvider` +
    `SmsLog(messageType: TEMP_PASSWORD)` pattern Phase 14 built for admin
    account creation) instead of only returning `tempPassword` in the API
    response for staff to relay by hand.
- `AgencyMembershipRequest.email` and `.city` become **nullable** (were
  `NOT NULL`) — the current design's public form collects neither; staff
  can still fill them in during review (`reviewNote`/manual follow-up),
  and the approval flow's `email` usage falls back to `null` (agency users
  can add an email later from their portal, same as any other optional
  contact field elsewhere in this schema).
- ⚑ **No public document upload this phase**: the design's public form
  (confirmed against the live screenshot) has no upload field — only
  text fields. `AgencyMembershipRequest.documents` stays the existing
  nullable `Json?` and is populated later by staff during review (they
  already have file-upload access via the existing `/files` endpoint);
  building a new _unauthenticated_ multipart upload endpoint is a real
  abuse-surface decision (anonymous file upload) that the design doesn't
  call for and shouldn't be added speculatively.
- ⚑ **No selfie step anywhere** (explicit user instruction) — not for
  this phase's agency flow (which never had one) and not for Phase 17's
  user identity fields below.
- **New model `AgencyRequestOtp`** — phone-keyed OTP for verifying the
  applicant actually controls the phone number, BEFORE any
  `AgencyMembershipRequest` row is created:
  ```
  model AgencyRequestOtp {
    id         String    @id @default(uuid())
    phone      String
    codeHash   String
    expiresAt  DateTime
    consumedAt DateTime?
    attempts   Int       @default(0)
    createdAt  DateTime  @default(now())
    @@index([phone])
  }
  ```
  ⚑ **Deliberately NOT reusing `TwoFactorChallenge`**: that table's
  `userId` is a required FK to an existing `User`, and an anonymous
  applicant has no account yet. The existing customer-OTP endpoint
  (`AuthService.requestOtp`) sidesteps this by upserting a `User(role:
USER)` row before issuing the challenge — but doing the same here would
  create a phone-linked `User` row (with what role? not yet AGENCY, since
  approval is what creates that) before staff have reviewed anything,
  which the existing approval flow doesn't expect and would collide with
  (`approveRequest` creates a fresh `User` unconditionally). A small,
  purpose-built, anonymous, phone-keyed table avoids both problems and
  never touches the security-sensitive auth table.
- Same shape/limits as every other OTP in this codebase: 6-digit code,
  2-minute TTL, 5-attempt cap, single-use, hashed at rest, delivered
  through the existing `TwoFactorProvider`/`SmsProvider` (so it lands in
  Phase 14's `SmsLog` like every other outbound code).
- Rate limiting: per-phone AND per-IP on both the OTP-send and the
  request-submit endpoints (same posture as every other OTP endpoint —
  `common/errors.ts` gets no new codes, this reuses the existing
  throttler pattern).

### Staff seat allotment — frontend only (backend already complete)

- Audited and confirmed `AgencyAllotment` (schema) and its full CRUD
  (`GET/POST /flights/:instanceId/allotments`,
  `DELETE /flights/:instanceId/allotments/:allotmentId`, all
  `SENIOR_MANAGER`/`COMMERCIAL_MANAGER`-gated, built in Phase C) have zero
  frontend callers. This phase adds ONLY the frontend: a per-flight
  allotment section in the existing flights panel (same role gate as the
  rest of that panel — no new endpoint, no new guard).
- **New endpoint** `GET /agency-portal/allotments` (agency's own token,
  tenant-scoped to `actor.agencyId` server-side — never trusts a client-
  supplied agency id) — the agency-portal side has no read of its own
  allotments today; `AgencySeatsPage.tsx` currently renders hardcoded
  sample numbers with a comment admitting it. Returns each allotment's
  flight (route, date, aircraft), `seatsAllocated`, and seats already
  consumed (derived the same way every other "used" figure in this
  codebase is derived — `COUNT` over real `Booking` rows referencing that
  allotment, never a mutated counter column).
- ⚑ **Explicitly not built this phase**: an agency actually BOOKING a
  customer against its own allotment (a "book on behalf of" flow). The
  user's request was "give agencies API access and put seats at their
  disposal" — read/issue-and-allocate, not a new booking-engine entry
  point. `booking-engine` has zero `agencyId`/`AGENCY`-role awareness
  today; wiring that in is a materially different, larger feature
  (booking-engine changes, its own pricing/commission questions) that
  needs its own docs pass and approval before any code, per workflow
  rule 1 — not silently bundled into this phase.

---

## Phase 17 — customer profile fields + completeness notification

`design-reference/پنل کاربر.dc.html`'s «پروفایل من» tab is a large page
(identity KYC with document + selfie upload, saved bank cards, active
sessions, invite-friends referral, saved passengers) — far bigger than
the user's actual request (a notification when the profile is
incomplete). Per user confirmation, this phase builds ONLY the part that
notification needs to mean something: real identity fields a user can
enter, a completion percentage, and a nudge — not the KYC
document/selfie flow, not bank cards, not active-sessions, not
invite-friends, not saved passengers. Explicit instruction: no selfie
step anywhere in the project.

- `User` gains nullable profile columns, same encrypted-PII pattern
  already used for `ClubMember`/`Passenger` (`*Enc` AES column + `*Hash`
  keyed hash for exact-match lookup, per CLAUDE.md's PII encryption
  rule) — **not** stored on `ClubMember`, because `ClubMember.userId` is
  optional (club membership is a separate, opt-in concept per Phase 5)
  and the design's profile tab is for any logged-in customer, member or
  not:
  ```
  nationalIdEnc    String?
  nationalIdHash   String?
  passportNoEnc    String?
  birthDate        DateTime?
  addressEnc       String?
  emailVerifiedAt  DateTime?
  ```
  (`fullName` and `email` already exist on `User`.)
- **Profile completion** is computed server-side, never stored — a
  simple weighted check over which of {fullName, nationalId, birthDate,
  passportNo, address, emailVerifiedAt} are present, matching the design's
  percentage bar and its "complete passport + verify email" hint text. The
  final value is rounded to an integer before it leaves the server so the UI
  never displays repeating decimals.
- `User.email` remains the existing nullable unique account column. Customer
  profile editing may update it; the value is normalized to lowercase and any
  actual change atomically clears `emailVerifiedAt` so completion cannot count
  an address that has not been verified. No migration is required.
- **Email verification**: reuses the existing OTP/2FA delivery
  machinery — a short-lived code sent to the address, confirmed via a
  new endpoint, stamps `emailVerifiedAt`. No new provider.
- **Checkout nudge**: `CheckoutPage` shows a dismissible banner ("تکمیل
  پروفایل" with the completion %) when the logged-in customer's profile
  is incomplete — informational only, never blocks the purchase flow
  (CLAUDE.md: booking/payment must keep working regardless of AI/profile
  state; national ID stays optional at the DTO level exactly as it is
  today — this phase does not make it required to book).
- ⚑ **Explicitly not built in Phase 17**: bank cards, invite-friends,
  and any document/selfie upload — all real sections of the same design
  page. Active-sessions moved to its own section below; saved-passengers
  shipped separately.

## Phase 18 — SITE_ADMIN + EMPLOYEE panel access

A full audit found `PANEL_NAV` had no entry at all for `SITE_ADMIN` or
`EMPLOYEE` — both panels rendered an empty sidebar (`getNav` fell through
to `?? []`). User confirmed the "real and complete" fix over the
"narrow/fast" option: widen backend authorization for SITE_ADMIN as
designed (adding a refund review+refer capability), and build genuine
per-employee permission enforcement for EMPLOYEE — not a shortcut that
leaves either panel nearly empty. No schema change; this phase is pure
authorization wiring on top of the `EmployeePermission`/`Permission`
tables that have existed since Phase 8.

**SITE_ADMIN** — `پنل ادمین سایت.dc.html`'s `roleDefs.siteAdmin.access` is
`["dashboard","agencies","flightops","reports","cartable","tickets","blog",
"media","club","refund"]`. Of these, `flightops` (close-flight +
نیرا-manifest-upload), `tickets` (internal support queue), `blog`, and
`media` have **no backend anywhere in the codebase for any role** — not a
SITE_ADMIN-specific gap, so they're excluded from `PANEL_NAV.SITE_ADMIN`
entirely (per this file's own "exclude coded-but-unreachable tabs"
convention) rather than shipped as `implemented:false` dead entries. The
remaining six get real, conservatively-scoped access:

- `agencies` → existing `AgenciesListPage`/`AgencyDetailPage`/
  `RequestDetailPage` (list/detail/requests/refer/reject — all already
  read-only or review-only for this role; **not** suspend, credit,
  settle, or api-key, which stay `SENIOR_MANAGER`/`FINANCE_MANAGER`-only).
- `reports` → existing `PassengerReportsPage` (passenger search).
- `cartable` → existing `CartablePage`, self-scoped to the actor; added
  directly on `CartableController`'s `@Roles(...)` rather than to the
  shared `EXEC_ROLES` constant. The compose action shown on this page grants
  `SITE_ADMIN` independently on `manager-messages`; `staff-directory` remains
  outside the role's access list.
- `club` → existing `ClubPage`, `listMembers` + `issueCard` only (no
  `createMember`, `updateLevel`, or the card-request approve/reject
  queue — those stay CEO/BOARD_CHAIR/SENIOR_MANAGER-only). `issueCard`
  only flips a card-status flag + audits — no ledger/money movement, so
  granting it doesn't cross the "no unjustified financial-write
  expansion" line this phase held to elsewhere.
- `refund` → **new** capability: `list`/`detail`/`refer` on
  `RefundsController`, mirroring the exact "review + refer to a
  specialist, never execute" pattern Phase 16 already established for
  agency requests (`SITE_ADMIN` refers, `COMMERCIAL_MANAGER` alone
  approves). `pay` (the actual payout + ledger reversal) is **never**
  granted to `SITE_ADMIN` — stays `FINANCE_MANAGER`-only.
- `dashboard` → **not** the shared sales/KPI `DashboardPage` (that reads
  real revenue/profit data via `reporting.controller.ts`, which
  `SITE_ADMIN` was deliberately not added to — no financial-data
  expansion beyond what's justified above). Instead a new, narrower
  `SiteAdminDashboardPage` combining the two lists `SITE_ADMIN` already
  has real access to (pending agency requests, refunds awaiting review) —
  a real but simplified v1 of the design's fuller combined-feed widget.

**EMPLOYEE** — `پنل کارمند.dc.html` computes its sidebar per-user:
`navKeys = ["dashboard"].concat(granted).concat(["referrals"])`, where
`granted` is the distinct set of `PERMISSION_CATALOG` section keys the
employee actually holds. This is fundamentally different from every other
role's static `PANEL_NAV` array, so `PanelsService.getNav` is now `async`
and takes the full actor (not just the role): for `role !== 'EMPLOYEE'` it
behaves exactly as before; for `EMPLOYEE` it queries the caller's real
`EmployeePermission` rows and computes the nav dynamically.

A new `EMPLOYEE_SECTION_NAV` map (`panel-nav.config.ts`) pairs each nav
section with the catalog key(s) actually wired to a real endpoint this
phase — an employee only sees a tab if they hold at least one of its
wired keys, so a granted-but-unwired permission never produces a dead
tab:

| section (nav key) | wired catalog keys                    | real endpoint(s)                                                                 |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| `agencies`        | `ag_list`, `ag_requests`, `ag_info`   | `GET /agencies`, `GET /agencies/requests(/:id)`, `GET /agencies/:id`             |
| `flights`         | `fl_view`                             | `GET /flights/{overview,airports,schedules,:id,:id/fare-rules,:id/allotments}`   |
| `pricing`         | `pr_propose`                          | `GET /pricing/proposals`, `PUT /pricing/flights/:id/proposal`                    |
| `reports`         | `rp_sales`, `rp_finance`              | `GET /passenger-reports/search` (same tab/endpoint for either dept's report key) |
| `refund`          | `rf_list`, `rf_details`, `rf_process` | `GET /refunds`, `GET /refunds/:id`, `PATCH /refunds/:id/refer`                   |

Enforcement is a new `EmployeePermissionGuard` +
`@RequiresPermission(...keys)` decorator (`src/common/`) — the guard
passes straight through for any non-EMPLOYEE actor (RolesGuard already
fully gates those), so it's safe to add to every widened controller's
`@UseGuards(...)` uniformly. For an EMPLOYEE actor, it 403s unless
`EmployeePermission` has a row matching one of the handler's declared
keys. `refunds.controller.ts` needed per-key granularity rather than a
single per-section check because its three catalog keys are genuinely
different sensitivity levels (`rf_list` list-only, `rf_details` decrypted
PII, `rf_process` refer-only, never `pay`).

⚑ **Deferred, not wired this phase** (documented so a future phase
doesn't assume silent inclusion):

- `fl_manage` (flight create/schedule/plan/aircraft/fare-rule/allotment
  writes) — blanket-granting write access across that many endpoints
  needed more individual review than this phase had time for; only
  `fl_view` (read) is wired.
- `ag_settle` (agency settlement) and `fn_invoices` (invoice
  view/issue/pay) — both real money-movement/financial-document actions;
  left unwired for the same "no unjustified financial-write expansion"
  reason `SITE_ADMIN` was held to.
- The entire `it` dept (`us_manage`, `sv_control`, `sc_manage`, `lg_view`)
  — these would touch `IT_MANAGER`-exclusive controllers (user
  management, service control, security settings, logs) that deserve
  their own dedicated review, not a blanket widen alongside the
  commercial/finance keys above.
- EMPLOYEE's `referrals` tab — `navKeys`'s formula always appends it, but
  `GET /referrals` (`referrals.service.ts`'s `list`) is sender-scoped
  (`SENIOR_MANAGER`'s own outgoing referrals); there's no recipient-side
  "referrals assigned to me" listing, only per-item `detail`/`submitReport`
  access (already granted to EMPLOYEE since referrals were first built).
  Shipping the tab today would be a 403-on-load dead entry, so it's
  omitted from the computed nav until that listing exists.

**Tests**: `test/phase18-panel-access.e2e-spec.ts` (new) covers
SITE_ADMIN's full real-access list + confirms it never gets
suspend/credit/settle/api-key/create-member/update-level/pay; EMPLOYEE
tests use the two permission combinations already in `prisma/seed.ts`
(`sales.moradi`: `ag_list`+`fl_view`; a freshly IT_MANAGER-granted
`rf_list`+`rf_details`+`rf_process` employee; a freshly granted
`pr_propose` employee) to prove per-key granularity, plus one check that
a non-EMPLOYEE role (`FINANCE_MANAGER`) is unaffected by the new guard.
`test/panels.e2e-spec.ts` gained the SITE_ADMIN nav-shape test and the
EMPLOYEE dynamic-nav test (replacing its now-obsolete "EMPLOYEE gets an
empty nav" assertion).

## Phase 19 — مدیریت رزرو (anonymous PNR self-service)

No schema change — reuses `Booking`/`Passenger`/`RefundRequest`/
`RefundPenaltyRule` exactly as Phase 2/7/13 defined them. First item from
the post-Phase-18 "dead forms" punch list; user explicitly chose the
anonymous PNR+last-name lookup model over requiring login, matching
مدیریت رزرو.dc.html and standard airline self-service UX, over the
alternative of reusing the existing authenticated `GET /bookings/pnr/:pnr`
as-is (which would have forced customers to log in just to check a
booking they may have made as a guest during checkout).

- `BookingService` gains a public `getByPnrAndLastName(pnr, lastName)`
  alongside the existing (unchanged) `getByPnr(pnr, user)` — both funnel
  through the same private `toDetail()` shaping, so the anonymous and
  authenticated views can never drift in what fields they expose.
- `RefundsService.submitFromCustomer` (authenticated) and a new
  `submitAnonymous(pnr, lastName, iban)` both call a new shared private
  `createRefundRequest(booking, iban, passengerName)` — the exact same
  `RefundPenaltyRule` lookup, `computePenalty()` call, and
  one-request-per-booking/TICKETED-or-PAID-only guards apply to both
  paths. This was a deliberate refactor (not a copy-paste) specifically
  so a future penalty-rule change can't accidentally apply to only one of
  the two customer-facing refund entry points.
- New shared pure helper `matchesLastName(fullName, lastName)`
  (`backend/src/common/passenger-name.util.ts`) — compares the input
  against the last whitespace-separated token of a passenger's stored
  `fullName`, trimmed. Used by both new anonymous endpoints. A
  false/no-match and a nonexistent PNR return the identical
  `NotFoundException` (message + code) — no timing/response-shape oracle
  that would let an attacker distinguish "wrong last name" from "PNR
  doesn't exist" while brute-forcing PNRs.
- Both new endpoints are public (no `JwtAuthGuard`) and carry the same
  `@Throttle({ limit: 10, ttl: 60_000 })` per-IP rate already used on
  `POST /bookings` — a 6-character alphanumeric PNR (`generatePnr()`) is
  guessable at scale without a rate limit, per CLAUDE.md's "rate limiting
  on... booking and money endpoints" rule.
- No audit-log row on the anonymous path — `AuditService.record`'s
  `actorId` is a required real `User.id`; an anonymous caller has none.
  Same precedent as Phase 16's anonymous agency pre-registration
  (`createPublicRequest`), which also skips the audit call for the same
  reason.

⚑ **Explicitly deferred this phase** (see docs/API.md's Phase 19 section
for the full reasoning): real seat-change and ticket-download actions
(the mock's buttons already had no handler at all — left visibly
disabled rather than built); per-passenger partial refund selection (the
mock's UI, but the real `RefundRequest` model — and every other refund
surface in the app — is 1:1 with `Booking`, never per-passenger).

## Phase 20 — تماس با ما + پشتیبانی (contact + support tickets)

Two new tables, both intentionally kept separate rather than unified
into one "message" model (see docs/API.md's Phase 20 section for the
full reasoning):

```prisma
model ContactMessage {
  id        String   @id @default(uuid())
  name      String
  phone     String
  subject   String
  body      String
  createdAt DateTime @default(now())

  @@index([createdAt])
  @@map("contact_messages")
}

enum SupportTicketDept {
  SITE
  AGENCY
}

enum SupportTicketPriority {
  HIGH
  MEDIUM
  LOW
}

enum SupportTicketStatus {
  OPEN
  IN_PROGRESS
  ANSWERED
  CLOSED
}

model SupportTicket {
  id             String                @id @default(uuid())
  trackingCode   String                @unique
  subject        String
  body           String
  requesterName  String
  requesterPhone String
  userId         String?
  user           User?                 @relation("SupportTicketRequester", fields: [userId], references: [id])
  dept           SupportTicketDept     @default(SITE)
  priority       SupportTicketPriority @default(MEDIUM)
  status         SupportTicketStatus   @default(OPEN)
  forwardedToId  String?
  forwardedTo    User?                 @relation("SupportTicketForwardedTo", fields: [forwardedToId], references: [id])
  history        Json                  @default("[]")
  attachments    Json                  @default("[]") // validated StoredFile ids
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  @@index([status])
  @@index([createdAt])
  @@map("support_tickets")
}
```

- `ContactMessage` — no `userId`/relation at all; it is a pure anonymous
  inbox, never tied to an account even if the sender happens to be logged
  in (the design's own form has no such concept).
- `SupportTicket.userId` remains optional for anonymous public submissions;
  `/my/support-tickets` writes the authenticated customer id so account
  listing and attachment authorization are owner-scoped.
- `SupportTicket.trackingCode` — generated as `TK` + 8 uppercase hex
  characters (`crypto.randomBytes(4)`), same "no collision-retry loop"
  convention already used by `generatePnr()` (Phase 2/13) — a random
  32-bit space is large enough in practice for this codebase's existing
  precedent.
- `SupportTicket.history: Json` — same append-only event-log pattern
  already established by `RefundRequest.history` (Phase 7) and
  `AgencyMembershipRequest.history` (Phase 16). Ticket replies are stored as
  append-only `step: "message"` records in this existing JSON column, so the
  conversation feature requires no schema migration or separate message table.
- `SupportTicket.attachments: Json` stores at most one owner-validated
  `StoredFile.id`; read responses resolve the ids into safe file metadata.
- `SupportTicket.dept`/`priority` exist to match the design's admin
  ticket-table columns (`پنل ادمین سایت.dc.html`'s `tkDepts`/
  `tkPriorityOptions`) but are not user-settable on the public form this
  phase — `dept` always defaults to `SITE`, `priority` always defaults to
  `MEDIUM`. Only `status` and `forwardedToId` are mutated by the new
  SITE_ADMIN endpoints.
- `forwardedToId` references `User` (any active staff role via
  `StaffDirectoryService.list()`), not a fixed department table — mirrors
  `RefundRequest.assigneeId`'s existing pattern.
- No new `AuditCategory` enum value — forward/status-change actions log
  under the existing `SYSTEM` category rather than adding a `SUPPORT`
  value for a scoped-down v1 feature.

⚑ **Still deferred:** a public anonymous "track my ticket" status lookup and a
dedicated تماس با ما admin review/reply UI (the new
`SiteAdminDashboardPage.tsx` section is this phase's only admin surface
for it). Multi-message authenticated ticket threads and attachments are now
implemented in the existing `history` and `attachments` JSON fields.

## Phase 21 — فراموشی رمز (customer forgot/set password)

No schema change. Reuses `User.passwordHash` (already nullable, already
populated for staff — see the Phase 1 schema) and the existing
`TwoFactorChallenge` row with `purpose: 'CUSTOMER_OTP_LOGIN'` (Phase 2) as
the identity proof for a password reset — no new challenge purpose was
added since proving phone ownership is exactly the same trust level for
login and for reset.

- `POST /auth/set-password` writes `passwordHash` directly with no
  current-password read/compare, unlike `changeOwnPassword` (Phase 12).
  This is intentional and gated by `@Roles('USER')` at the controller —
  see docs/API.md's Phase 21 section for why that role gate is
  security-load-bearing here (it stops a staff/agency token from ever
  reaching this no-current-password-check path).
- `POST /auth/customer/login-password` reads `passwordHash` the same way
  `staffLogin`/`agencyLogin` do, but skips the 2FA challenge step (only
  staff logins require 2FA per CLAUDE.md).

## Phase 22 — وضعیت پرواز (flight status lookup)

No schema change. Reuses `FlightInstance`/`Flight`/`Route`/`Airport`
exactly as they already exist. Confirmed during this phase:
`FlightInstanceStatus` is only `SCHEDULED | DEPARTED | CANCELLED` — there
is no gate/baggage-belt/delay-minutes/terminal column anywhere, which is
why the real `GET /flight-status` response (see docs/API.md's Phase 22
section) omits those four fields the design shows rather than inventing
values for them.

## Phase 23 — وب‌سرویس آژانس (Agency B2B webservice purchase)

New table only — `AgencyApiKey`/`AgencyApiScope`/`AgencyApiKeyStatus`
already existed (Phase 3) and are unchanged.

```prisma
enum AgencyWebserviceRequestStatus {
  PENDING
  APPROVED
  REJECTED
}

model AgencyWebserviceRequest {
  id          String                         @id @default(uuid())
  agencyId    String
  agency      AgencyProfile                  @relation(fields: [agencyId], references: [userId])
  scope       AgencyApiScope
  months      Int
  priceIrr    Int
  note        String?
  status      AgencyWebserviceRequestStatus  @default(PENDING)
  decidedById String?
  decidedBy   User?                          @relation("AgencyWebserviceRequestDecidedBy", fields: [decidedById], references: [id])
  decidedAt   DateTime?
  createdAt   DateTime                       @default(now())

  @@index([agencyId, status])
  @@map("agency_webservice_requests")
}
```

- Mirrors `AgencyCreditRequest`'s shape exactly (Phase 16) — same
  "agency requests, an `AGENCY_TAB_ROLES` staff member decides"
  lifecycle, same conditional-`updateMany` race-guard on decide.
- `priceIrr` is a snapshot computed server-side from a fixed plan catalog
  at request time (see docs/API.md's Phase 23 section) — never
  client-supplied, and never recomputed later even if the catalog price
  were to change, so an already-PENDING request's price stays stable.
- No FK from this table to the `AgencyApiKey` row that approval produces
  — deliberately deferred, see docs/API.md's Phase 23 "Explicit
  deferrals".
- Migration: `20260723160000_phase23_agency_webservice_requests`.

## Phase 24 — پرواز (flightops: sale auto-close + نیرا manifest submission)

One new nullable column — no new table. See docs/API.md's Phase 24
section for the full feature scope and explicit deferrals.

```prisma
model FlightInstance {
  // ...existing fields unchanged...

  // Phase 24: when the real passenger manifest was submitted to سامانه
  // نیرا. Set exactly once, lazily, by the first flightops read after
  // departureAt − now ≤ 5h (see NiraService) — no cron job, same pattern
  // as materializeDepartedInstances/materializeExpiry elsewhere. NULL
  // means "not yet closed" for a SCHEDULED instance; a conditional
  // updateMany on write makes the transition idempotent under concurrent
  // reads.
  niraSubmittedAt DateTime?
}
```

- Deliberately NOT a new `NiraSubmission`/log table: `niraSubmittedAt`
  alone captures the design's full displayed state (done + timestamp, or
  pending) — the design shows no submission history, retry count, or
  failure state to justify a separate table. Contrast with `SmsLog`
  (Phase 14), which exists because SMS sends are frequent, per-message,
  and have a real (if narrow) failure mode; a نیرا submission is
  one-shot-per-flight and the mock provider never fails (see
  `MockNiraProvider`), so a boolean-via-nullable-timestamp is enough.
- No FK/relation change, no new enum, no index added — the existing
  `@@index([departureAt])` already serves the "soonest departure first"
  ordering `GET /flightops` needs.
- Migration: `<timestamp>_phase24_flightops_nira_submitted_at`.

## Phase 25 — حریم خصوصی و داده‌های من (GDPR export/delete UI)

No schema change. Reuses the `User.deletedAt`/`isActive` and
`Passenger.deletedAt`/`nationalIdEnc`/`nationalIdHash`/`mobileEnc` columns
that already existed for this exact purpose (see `deletedAt | DateTime? |
soft delete (GDPR hard-delete flow is separate)` in this file's User
table notes) — `PrivacyService.deleteMyAccount` (unchanged this phase) is
that "separate" flow. This phase only adds a frontend surface for the
already-real `GET /my/privacy/export` / `DELETE /my/privacy/account`
endpoints; see docs/API.md's Phase 25 section for the full read/delete
shape.

## Phase 26 — ارجاعات (EMPLOYEE recipient-side referral listing)

No schema change. `GET /referrals/mine` reads the existing
`ManagerReferral`/`ManagerReferralRecipient`/`ManagerReferralReport`
tables (Phase 4) via the already-indexed `ManagerReferralRecipient
.recipientId` (`@@index([recipientId])`) — no new index needed. See
docs/API.md's Phase 26 section for the full endpoint shape and explicit
scope narrowing.

## Phase 27 — EMPLOYEE write/financial access: fl_manage + ag_settle + fn_invoices

No schema change. Widens which roles can reach existing write endpoints
and existing `EmployeePermission` grants (`Permission` rows for
`fl_manage`/`ag_settle`/`fn_invoices` were already seeded in Phase 8's
`PERMISSION_CATALOG`, just unwired to any real access until now) — see
docs/API.md's Phase 27 section for the full endpoint list, the
reachability fix, and the explicit `fn_invoices`/`FinancePage.tsx` scope
decision.

## Phase 28 — IT Manager external-service «تنظیمات» edit modal

No schema change. Frontend-only: wires an already-implemented, already
e2e-tested backend endpoint (`PATCH /it/services/external/:id`) into
`ServicesPage.tsx` — see docs/API.md's Phase 28 section.

## Phase 29 — referral/report attachment upload + view UI

No schema change. `ManagerReferral.attachments`/`ManagerReferralReport
.attachments` (`Json?`, raw `StoredFile` id arrays) and `StoredFile` itself
already existed since Phase 4 — this phase only resolves those ids into
displayable metadata in read responses and adds the frontend surface. Also
fixes a pre-existing bug in `FilesService.store()` (non-ASCII filenames
were stored as mojibake due to multer/busboy's default latin1 header
decoding) — no schema impact, just a corrected `fileName` value on future
uploads. See docs/API.md's Phase 29 section.

## Phase 30 — data-driven seat-map aisle gap rendering

No schema change. `AircraftSeatMap.{business,economy}ColsLeft/ColsRight`
already existed since Phase 9 as the real per-aircraft-type column-group
config; this phase only exposes `businessColsLeft.length`/
`economyColsLeft.length` in `GET /reservation/seatmap/:flightInstanceId`'s
response (as `cabinLayout`) and makes the frontend seat grid consume it
instead of a hardcoded seat index. See docs/API.md's Phase 30 section.

## Phase 31 — EMPLOYEE narrow access to the IT-dept permission keys

No schema change. `Permission` rows for `us_manage`/`sv_control`/
`sc_manage`/`lg_view` were already seeded in Phase 8's
`PERMISSION_CATALOG` — this phase only widens which methods' `@Roles`/
`@RequiresPermission` decorators an `EMPLOYEE` holding one of those grants
can reach, each scoped narrowly (dept-scoped for `us_manage`, read-only
for `sv_control`/`sc_manage`/`lg_view`) — see docs/API.md's Phase 31
section for the full reasoning, including why `GET /it/security/sessions`
was deliberately excluded from `sc_manage` despite being part of the
originally-proposed scope.

## Phase 34 — کیف پول + قفل قیمت هوشمند: retroactive docs + frontend closure

`WalletEntry` and `PriceLock` already existed (an earlier phase's merge,
never given its own docs/DB_SCHEMA.md section — retroactively documented
here). Migration `1788163200000-PriceLockFeeCharged` adds
`PriceLock.feeCharged boolean NOT NULL DEFAULT false`. The flag records
whether the lock fee was actually debited from the wallet, so cancellation
refunds only a previously charged fee. The remaining changes are additive,
non-breaking response-shape changes:

- `PriceLockService.listMine()` now joins `FlightInstance → Flight →
Route` and includes `flight: { flightNo, originCode, destCode,
departureAt }` in each returned row (previously only the `PriceLock`
  row's own columns).
- `BookingService.toDetail()` now includes `isPriceLocked: boolean`
  (`!!booking.priceLock`, correctly resolved from the already-known
  `usableLock` at creation time rather than a stale pre-transaction
  relation snapshot — see docs/API.md's Phase 34 section for the exact
  bug found and fixed).

See `docs/features/wallet-price-lock.md` for the full frontend-closure and
wallet debit/refund behavior.

## Phase 38 — تغییر نوع هواپیما: frontend closure

No schema change. `AircraftSeatMap` and `FlightInstance.aircraftTypeOverride`
already existed (Phase 13 Part A) with the write path (`changeAircraftType`)
fully built; only additive, non-breaking read/serialization changes:

- `FlightsService.aircraftTypes()` (new method) — lists every
  `AircraftSeatMap` row `{ aircraftType, capacity }`, capacity via the
  existing `enumerateSeats()` helper (same one `changeAircraftType()`
  already uses for its own capacity check) — a pure read, no new table/
  column.
- `FlightsService.detail()`'s return object gains `aircraftType` via the
  existing `resolveAircraftType()` util — no new query, the instance and
  its `flight` relation were already loaded.

See `docs/API.md`'s Phase 38 section for the endpoint shape and the
deliberately-deferred fare-rules CRUD gap, `docs/features/flight-management.md`'s
Phase 38 section for the full frontend checklist.

## Phase 39 — بازبینی مدارک آژانس: staff-side document review

No column change. `AgencyDocument.status` (`PENDING`/`APPROVED`/`REJECTED`)
has existed since the model shipped — only its write path was missing.
`AgenciesService.decideDocument()` is the first (and only) code path that
ever transitions it out of `PENDING`. The model's own comment ("Staff-side
review is deferred... every row stays PENDING until that workflow is
built") is updated to point at that method instead. `AgencyDocument` has
no `decidedById`/`decidedAt` columns, unlike `AgencyCreditRequest`/
`AgencyWebserviceRequest` — intentionally not added this phase (no
requirement surfaced for who-decided/when beyond the existing
`AuditLog(category=AGENCY)` row); a trivial additive migration if ever
needed.

See `docs/API.md`'s Phase 39 section for the endpoint shape and the
parallel credit-requests/webservice-requests frontend gap it surfaced
(flagged, not fixed this phase), `docs/features/agency-portal.md` for the
corrected deferred-list entries.

## Phase 40 — ترجیح زبان نمایش: `User.preferredLocale`

First step of the multi-language (fa/en/ar) + responsive redesign — see
`docs/API.md`'s Phase 40 section for the full reasoning.

- New enum `Locale { FA EN AR }`.
- New column `User.preferredLocale Locale @default(FA)` — meaningful for
  any role technically, but only `USER`/`AGENCY` frontends currently
  expose a language switcher (the design bundle scopes fa/en/ar to the
  public site + پنل کاربر + پنل آژانس only; staff/executive panels stay
  Persian-only). Migration: `20260730100306_add_user_preferred_locale`,
  additive-only, existing rows default to `FA` — no data migration
  needed.
- Deliberately no separate "locale preference" table: this is a single
  scalar per user, same shape as any other profile field already on
  `User` (e.g. `emailVerifiedAt`), not worth a join for.

## Phase 51 — فراموشی رمز: email password-reset path

See `docs/API.md`'s Phase 51 section for the full reasoning. Additive
only, reuses the existing `TwoFactorChallenge` table exactly like Phase 2's
`CUSTOMER_OTP_LOGIN` and Phase 17's `EMAIL_VERIFY` — no new table.

- New `TwoFactorPurpose` enum value: `PASSWORD_RESET_EMAIL`. A dedicated
  purpose rather than reusing `EMAIL_VERIFY` — "prove you own this inbox to
  change your password" and "confirm this inbox for your profile" are
  different trust decisions even though the delivery mechanics
  (`TwoFactorProvider.sendCode` with `phone: null`) are identical; keeping
  them distinct also means a leaked/replayed `EMAIL_VERIFY` challenge id
  can never be used to reset a password, and vice versa.
  Migration: `20260730140342_password_reset_email_purpose`.
- Lookup for the request step is `User.findFirst({ email, role: 'USER',
emailVerifiedAt: { not: null } })` — deliberately NOT an upsert (unlike
  `requestOtp`'s phone find-or-create). Phone OTP login/signup is a single
  merged flow by product design (see Phase 2's docs); email-based password
  reset is not a signup path, so inventing a `User` row for an arbitrary
  submitted email would let anyone probe or squat an address that isn't
  theirs. If no matching verified-email `USER` row exists, the endpoint
  401s with a generic message — same non-oracle posture Phase 21's
  `customer/login-password` already uses for phone+password.

## پنل کاربر — نشان‌شده‌ها (`SavedFlight`)

See `docs/API.md`'s matching section. Bookmarks a specific flight instance

- cabin for the logged-in customer (same granularity as `PriceLock`).

```prisma
model SavedFlight {
  id               String         @id @default(uuid())
  userId           String
  user             User           @relation("SavedFlightOwner", ...)
  flightInstanceId String
  flightInstance   FlightInstance @relation(...)
  cabin            CabinClass
  createdAt        DateTime       @default(now())

  @@unique([userId, flightInstanceId, cabin])
  @@index([userId, createdAt])
  @@map("saved_flights")
}
```

Migration: `20260731120000_saved_flights`. Cascades on user/instance
delete. Application cap: 20 rows per user (enforced in service, not DB).

## پنل کاربر — مسافران ذخیره‌شده (`SavedPassenger`)

See `docs/API.md`'s matching section. Per-user address book for checkout
autofill — separate from booking-scoped `Passenger` rows.

```prisma
model SavedPassenger {
  id             String   @id @default(uuid())
  userId         String
  user           User     @relation("SavedPassengerOwner", ...)
  fullName       String
  latinName      String
  gender         String?  // male | female
  birthDate      DateTime? @db.Date
  nationalIdEnc  String?
  nationalIdHash String?
  passportNoEnc  String?
  mobileEnc      String?
  isChild        Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([userId, createdAt])
  @@index([userId, nationalIdHash])
  @@map("saved_passengers")
}
```

Migration: `1787990400000-SavedPassengerGenderBirthDate` (adds `gender` +
`birthDate`). PII columns follow the same AES-256-GCM + HMAC hash pattern as
`ClubMember`/`Passenger`. Application cap: 20 rows per user; duplicate
national ID per user rejected in service. Checkout autofill uses gender +
birthDate so selecting a saved passenger can complete the passenger form.

## پنل کاربر — حساب‌های بانکی (`SavedBankAccount`)

Customer refund payout destination — card PAN + Iranian sheba (IBAN).
Encrypted at rest like other PII; sheba deduped per user via `shebaHash`.

```prisma
model SavedBankAccount {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation("SavedBankAccountOwner", ...)
  bankName    String
  bankShort   String
  brandColor  String
  cardPanEnc  String?
  cardLast4   String?
  shebaEnc    String
  shebaHash   String
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId, createdAt])
  @@index([userId, shebaHash])
  @@map("saved_bank_accounts")
}
```

Migration: `20260731140000_saved_bank_accounts`. Application cap: 5 rows
per user; duplicate sheba per user rejected in service.

## پنل کاربر — معرفی دوستان (Customer Referral)

Invite-friends program for the public user panel — distinct from Phase 4
`ManagerReferral` (staff workflow).

```prisma
// User.referralCode String? @unique — lazily assigned per customer

enum CustomerReferralStatus {
  SIGNED_UP   // registered with referrer's code
  BOOKED      // reserved for future use
  REWARDED    // first ticketed booking completed; points credited
}

model CustomerReferral {
  id             String                 @id @default(uuid())
  referrerUserId String
  referrer       User                   @relation("CustomerReferralsMade", ...)
  referredUserId String                 @unique
  referred       User                   @relation("CustomerReferralReceived", ...)
  status         CustomerReferralStatus @default(SIGNED_UP)
  pointsAwarded  Int                    @default(0)
  firstBookingId String?                @unique
  firstBooking   Booking?               @relation("CustomerReferralFirstBooking", ...)
  rewardedAt     DateTime?
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt

  @@index([referrerUserId, createdAt])
  @@map("customer_referrals")
}
```

Migration: `20260731150000_customer_referrals`. Reward constant: 500
points per successful first booking (server-side in
`CustomerReferralsService`).

## پنل کاربر — احراز هویت (`CustomerIdentityVerification`)

National-ID card KYC for refunds/high-value purchases. **No selfie**
(CLAUDE.md). Customer submit/status and SITE_ADMIN approve/reject are
both implemented; the admin queue is `/panel/kyc`.

```prisma
enum CustomerIdentityStatus {
  NOT_STARTED
  SUBMITTED
  APPROVED
  REJECTED
}

model CustomerIdentityVerification {
  id           String                 @id @default(uuid())
  userId       String                 @unique
  user         User                   @relation("UserIdentityVerification", ...)
  status       CustomerIdentityStatus @default(NOT_STARTED)
  idCardFileId String?                // StoredFile id
  submittedAt  DateTime?
  reviewedAt   DateTime?
  rejectReason String?
  createdAt    DateTime               @default(now())
  updatedAt    DateTime               @updatedAt

  @@map("customer_identity_verifications")
}
```

Migration: `20260731160000_customer_identity`. Profile step is computed
from `User.fullName` + `nationalIdEnc` + `birthDate` (not stored here).
The development seed creates one `SUBMITTED` verification with a real
tiny PNG `StoredFile`, so `/panel/kyc` and its protected file-streaming
endpoint can be exercised immediately after seeding.

## پنل کاربر — نشست‌های فعال (reuse `RefreshToken`)

See `docs/API.md`'s matching section. No new table — customer-facing
list/revoke over existing `RefreshToken` rows (`userAgent`, `ip`,
`revokedAt`), scoped to `userId = caller.id`.

## Phase 65 — قوانین باشگاه مشتریان (Club Tier Rules)

See `docs/API.md`'s Phase 65 section for the full reasoning and endpoint
shapes. One new singleton-pattern table (`ClubTierRule`, always exactly
one row) alongside the existing Phase 5 `ClubMember`/`ClubCardRequest`
models — not a new module, extends the existing `club` module.

```prisma
model ClubTierRule {
  id                   String   @id @default(uuid())
  goldMinPoints        Int      @default(5000)
  platinumMinPoints    Int      @default(15000)
  cardRequestMinPoints Int      @default(5000)
  updatedById          String?
  updatedBy            User?    @relation(fields: [updatedById], references: [id])
  updatedAt            DateTime @updatedAt
  createdAt            DateTime @default(now())

  @@map("club_tier_rules")
}
```

- Singleton via application logic (service always reads/updates the
  single existing row, or creates one with the defaults above if the
  table is empty — no unique-constraint trick needed since only the
  service ever touches this table).
- Defaults (`5,000` / `15,000`) intentionally match the point ranges
  already shown as marketing copy on `PublicClubPage.tsx`/
  `HomeSearchPage.tsx` (Phases 42/45) — seeding any other default would
  make the real, enforced thresholds inconsistent with what customers are
  already told on day one.
- `SILVER` has no column — its threshold is fixed at `0` in code (never
  stored, never editable), matching the design's disabled `"۰"` input.
- `prisma/seed.ts` creates the single default row so `GET
/club/tier-rules` never has to lazily create one in a normal dev/seed
  environment (the lazy-create fallback exists only for defense in
  depth, e.g. a fresh DB that skipped seeding).
- No new enum: reuses the existing `ClubTier` enum (`SILVER | GOLD |
PLATINUM`) from Phase 5.
- Migration: `20260730162159_phase65_club_tier_rules`.

## Phase 66 — نظرسنجی مسافران (Passenger Satisfaction Survey)

See `docs/API.md`'s Phase 66 section for the full design-source reasoning
and the scope decisions (SMS-only delivery, one rating not per-question,
lazy materialization via the survey module's own reads, new
non-ml-service AI provider, real token-based usage logging). New
`survey` module. Five new models:

```prisma
model SurveySettings {
  id            String   @id @default(uuid())
  enabled       Boolean  @default(true)
  title         String   @default("نظرسنجی رضایت مسافران")
  updatedById   String?
  updatedBy     User?    @relation("SurveySettingsUpdatedBy", fields: [updatedById], references: [id])
  updatedAt     DateTime @updatedAt
  createdAt     DateTime @default(now())

  @@map("survey_settings")
}

model SurveyQuestion {
  id        String   @id @default(uuid())
  label     String
  order     Int
  createdAt DateTime @default(now())

  @@map("survey_questions")
}

model SurveyInvite {
  id               String          @id @default(uuid())
  bookingId        String          @unique
  booking          Booking         @relation(fields: [bookingId], references: [id])
  flightInstanceId String
  flightInstance   FlightInstance  @relation(fields: [flightInstanceId], references: [id])
  token            String          @unique @default(uuid())
  smsSentAt        DateTime?
  respondedAt      DateTime?
  createdAt        DateTime        @default(now())
  response         SurveyResponse?

  @@map("survey_invites")
}

model SurveyResponse {
  id        String       @id @default(uuid())
  inviteId  String       @unique
  invite    SurveyInvite @relation(fields: [inviteId], references: [id])
  rating    Int
  comment   String?
  createdAt DateTime     @default(now())

  @@map("survey_responses")
}

model AiUsageLog {
  id           String   @id @default(uuid())
  provider     String
  userId       String
  user         User     @relation("AiUsageLogUser", fields: [userId], references: [id])
  contextId    String?
  inputTokens  Int
  outputTokens Int
  costIrr      Int?
  createdAt    DateTime @default(now())

  @@map("ai_usage_logs")
}
```

Plus, on the `User` model: `surveySettingsEdits SurveySettings[]
@relation("SurveySettingsUpdatedBy")` and `aiUsageLogs AiUsageLog[]
@relation("AiUsageLogUser")`, following the same named-relation pattern
as `clubTierRuleEdits` (Phase 65).

- `SurveySettings` — singleton (application-enforced, same pattern as
  Phase 65's `ClubTierRule`); `prisma/seed.ts` creates the one default
  row (`enabled: true`, design's default title).
- `SurveyQuestion` — not a singleton; IT manager CRUDs a flat list.
  `prisma/seed.ts` seeds the same 5 default questions the design ships
  with (`رضایت کلی از سفر` / `برخورد و کیفیت خدمه پروازی` / `دقت در
زمان پرواز` / `راحتی صندلی و کابین` / `سرعت پذیرش و چک‌این`), in that
  order. Deleting one is a hard delete (this is configuration, not
  passenger data — no soft-delete requirement applies).
- `SurveyInvite.bookingId` is `@unique` — at most one invite per booking,
  created lazily by `materializeSurveyInvites` (new,
  `survey-lifecycle.util.ts` — calls the existing
  `materializeFlownBookings` first) the first time a booking is observed
  `FLOWN` while `SurveySettings.enabled` is true. `flightInstanceId` is
  denormalized from the booking purely so `GET /survey/results` can
  group by flight instance without an extra join hop through `Booking`
  on every read of what's meant to be a lightweight, frequently-polled
  exec dashboard query.
- `SurveyInvite.token` is the public link's credential — a random UUID,
  `@unique`, never derived from any guessable value (not the PNR, not
  the booking id).
- `SurveyResponse.inviteId` is `@unique` — enforces "one response per
  invite" at the DB level, not just in application logic (matches the
  API's 409-on-resubmit behavior).
- `SurveyResponse.comment` is nullable — the design's own submission
  form treats the free-text box as optional, only `rating` is required.
- No `passengerId` FK on `SurveyInvite`/`SurveyResponse`: the survey is
  scoped to the booking (whoever books the trip), not to each individual
  passenger on a multi-passenger booking — matching the design's own
  one-row-per-flight aggregation, which has no concept of "which
  passenger" answered.
- `AiUsageLog` is intentionally generic (`provider: string`, not an enum)
  so a future third AI provider doesn't require a migration — first
  value written will be `'survey-summary'`. `costIrr` stays nullable
  (see API.md's scope-decision note: no per-token pricing table exists
  to compute a real cost from yet).
- No new `AuditCategory` enum value is needed for the exec-facing
  read-only endpoints (nothing to audit — they never mutate data), but
  `SurveySettings`/`SurveyQuestion` writes by `IT_MANAGER` do go through
  the existing audit-log table under a new `AuditCategory.SURVEY` value
  (added alongside the existing ten), matching how every other
  manager-editable settings screen in this codebase is already audited.
- `SmsMessageType` (the Prisma enum backing `SmsLog.messageType`, plus
  the mirrored TS union in `sms-provider.interface.ts`) gained a new
  `SURVEY_INVITE` value — this **does** require a migration (corrects an
  earlier draft assumption that it was TS-only).
- Migrations: `20260730190717_phase66_passenger_survey` (the five new
  tables + `AuditCategory.SURVEY`) and
  `20260730190905_phase66_survey_invite_sms_type`
  (`SmsMessageType.SURVEY_INVITE`).

## Phase 67 — فرصت‌های شغلی (Careers)

See `docs/API.md`'s Phase 67 section for the full design-source
reasoning and scope decisions (incl. a correction: the public
listing/application pages and the application-review UI have no design
file — only the SITE_ADMIN posting-management card grid does). New
`careers` module, three new models:

```prisma
enum JobType {
  FULL_TIME
  REMOTE
  PART_TIME
}

enum JobApplicantGender {
  FEMALE
  MALE
}

enum MaritalStatus {
  SINGLE
  MARRIED
}

enum MilitaryStatus {
  CONSCRIPT
  EXEMPT
  WAIVED
}

enum JobApplicationStatus {
  SUBMITTED
  REFERRED
  HIRED
  REJECTED
}

model CareersSettings {
  id        String   @id @default(uuid())
  enabled   Boolean  @default(true)
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@map("careers_settings")
}

model JobPosting {
  id           String           @id @default(uuid())
  title        String
  dept         String
  city         String
  type         JobType          @default(FULL_TIME)
  generalReqs  String[]
  specialReqs  String[]
  active       Boolean          @default(true)
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  applications JobApplication[]

  @@map("job_postings")
}

model JobApplication {
  id                String               @id @default(uuid())
  jobPostingId      String?
  jobPosting        JobPosting?          @relation(fields: [jobPostingId], references: [id])
  jobTitleSnapshot  String
  firstName         String
  lastName          String
  nationalIdEnc     String
  nationalIdHash    String
  fatherName        String?
  birthDate         DateTime?
  birthProvince     String?
  birthCity         String?
  gender            JobApplicantGender?
  marital           MaritalStatus?
  military          MilitaryStatus?
  exemptionType     String?
  phone             String
  email             String?
  residenceProvince String?
  residenceAddress  String?
  eduEntries        Json                 @default("[]")
  workEntries       Json                 @default("[]")
  langEntries       Json                 @default("[]")
  skills            String?
  otherLangs        String?
  resumeFileName    String?
  resumeMimeType    String?
  resumeSizeBytes   Int?
  resumePath        String?
  status            JobApplicationStatus @default(SUBMITTED)
  assigneeId        String?
  assignee          User?                @relation("JobApplicationAssignee", fields: [assigneeId], references: [id])
  history           Json                 @default("[]")
  createdAt         DateTime             @default(now())

  @@index([nationalIdHash])
  @@index([status])
  @@map("job_applications")
}
```

Plus, on the `User` model: `jobApplicationsAssigned JobApplication[]
@relation("JobApplicationAssignee")`.

- `CareersSettings` — singleton (same pattern as `SurveySettings`);
  `prisma/seed.ts` creates the one default row (`enabled: true`).
- `JobPosting.generalReqs`/`specialReqs` are native Postgres string
  arrays (`String[]`) — the admin's newline-separated textarea is
  split/joined at the API boundary, matching how the design itself
  stores these as arrays (`generalReqs: [...]` in `site-data.js`).
- `JobApplication.jobPostingId` is nullable; no delete path exists for
  `JobPosting` per the scope decision (deactivate only), so the FK never
  actually needs to survive a deletion in practice — nullable purely as
  defense-in-depth. `jobTitleSnapshot` is what the admin UI actually
  displays either way, so a later posting edit never changes what an
  already-submitted application shows.
- `JobApplication.nationalIdEnc`/`nationalIdHash` follow the exact same
  encrypted-at-rest + deterministic-hash-for-search pattern as
  `Passenger`/`ClubMember` (CLAUDE.md: PII encrypted at rest, national
  ID validated server-side with the official checksum).
- `JobApplication.resumeFileName`/`resumeMimeType`/`resumeSizeBytes`/
  `resumePath` are a small, self-contained resume-storage slice — not a
  `StoredFile` FK, since that model requires a `User` owner and a job
  applicant is anonymous (see API.md's scope decision). All four stay
  nullable: the design's own submission flow doesn't actually make the
  resume mandatory at the state-machine level (only first name/last
  name/national ID/phone are validated client-side before submit), so a
  resume-less application is a legitimate, real state to support.
- `JobApplication.eduEntries`/`workEntries`/`langEntries` are `Json`
  arrays of `{ degree, field, institute }` / `{ company, role, years }` /
  `{ lang, level }` respectively — free-form, never deeply queried, same
  pattern as `SupportTicket.history`/`ClubCardRequest.history`; capped at
  `MAX_JSON_ENTRIES = 20` server-side.
- `JobApplication.assigneeId` points at a real `User` row (see API.md's
  "referral target list is computed" scope decision) — display-only, no
  access-grant semantics, matching `ClubCardRequest.assignedTo`'s
  existing precedent in this codebase.
- New `AuditCategory.CONTENT` value (added alongside the existing
  eleven) — mirrors the design's own `_logReport("content", ...)` calls
  for every job-posting/application mutation.
- Migration applied: `20260730200910_phase67_careers`.

**Phase 67 is implemented and merged.** Backend (module, DTOs, e2e +
unit tests), frontend (public listing/apply pages, SITE_ADMIN review
page, api client, types, tests), PANEL_NAV `jobapps` tab, and footer
wiring are all complete — see `docs/features/careers.md` for the full
checked-off acceptance checklist and `docs/API.md`'s Phase 67 section
for the post-implementation design-source correction.

---

## Bug fix (post-Phase-67 senior review): revenue reporting polluted by agency debt-calibration ledger rows

Found while investigating the long-standing `reporting.e2e-spec.ts`
"sales-chart/kpis reconciliation" flake that had been repeatedly
misdiagnosed across Phases 51/65/66/67 as "shared `blujet_test` data
drift across e2e runs" — it wasn't drift, it was a real, deterministic
bug:

`AgenciesService.resetTestDebt()` (an e2e/dev-only helper, 404 in
production, that recalibrates an agency's derived debt to a fixed
figure) creates a `LedgerEntry{ type: 'SALE', agencyId, signedAmountIrr:
targetIrr - usedIrr, bookingId: null }` row — `signedAmountIrr` can be
**negative**, and the row has no associated booking, because it's a
credit-line adjustment, not a ticket sale. `LedgerEntry.type: 'SALE'` is
legitimately dual-purpose in this schema (`computeUsedIrr()` needs
`SALE - SETTLEMENT` to include it for agency-debt math), but every
company-wide _revenue_ aggregate elsewhere in the app was treating
**every** `type: 'SALE'` row as real ticket revenue:

- `ReportingService.kpis()` summed `Math.abs(signedAmountIrr)` for every
  SALE row with no `bookingId` filter — silently _adding_ a negative
  debt-adjustment as positive revenue.
- `ReportingService.sumByChannel()` (used by `salesChart()`) happened to
  exclude these rows, but only by accident — it drops any entry whose
  `booking?.channel` is falsy, which is true for any bookingless row for
  any reason, not a deliberate filter.
- `ReportingService.revenueMix()` defaulted a bookingless row's channel
  to `'SYSTEM'`, silently misattributing debt-adjustment noise into the
  "فروش سیستمی" donut slice.
- `PnrService.dashboardStats()` (کارتابل's ردیف آمار) and
  `AgencyPortalService.dashboard()`/`AgenciesService.detail()`'s
  `totalSalesIrr` had the same unfiltered `type: 'SALE'` aggregate.

Fix: every revenue/sales aggregate that queries `type: 'SALE'` now also
requires `bookingId: { not: null }` — real ticket revenue is always
booking-scoped; agency debt-line calibration never is.
`AgenciesService.computeUsedIrr()` (the one place that legitimately
wants the debt-adjustment rows) is untouched. New regression test:
`test/reporting.e2e-spec.ts` "a bookingless SALE ledger row
(AgenciesService.resetTestDebt-style agency debt calibration) never
pollutes revenue reporting" — inserts a synthetic bookingless SALE row
and asserts `kpis().revenueIrr` is unchanged and still reconciles with
`salesChart()`/`revenueMix()`. Full backend e2e suite re-run clean
(391/391) after the fix — the sales-chart/kpis reconciliation test that
had failed in every one of the last several full-suite runs this session
now passes deterministically.

---

## Int → BigInt migration: every IRR money column

Closes the "known technical debt" flagged during Phase 3 seed data: every
IRR-denominated column was Postgres `integer` (Int32 ceiling ~2.14e9 IRR ≈
214,000,000 toman) — fine for a single ticket price, but a real agency
credit line or a yearly revenue KPI aggregate can plausibly exceed that.
User explicitly reviewed and approved the migration (and the direct
`ALTER COLUMN` approach over an expand/contract dual-column pattern,
appropriate since this is still pre-launch with no live production
traffic) before it started, given it touches the entire financial core.

**Schema**: all 27 IRR columns — `FlightInstance.basePriceIrr`,
`CabinFare.priceIrr`, `FareRule.{priceIrr,taxIrr}`,
`Booking.{priceIrr,taxIrr}`, `PaymentReconciliation.amountIrr`,
`LedgerEntry.signedAmountIrr`, `AgencyAllotment.contractPriceIrr`,
`AgencyCreditLine.limitIrr`, `AgencyInvoice.amountIrr`,
`AgencyCreditRequest.requestedLimitIrr`,
`AgencyWebserviceRequest.priceIrr`,
`FarePricingProposal.{basePriceIrr,competitorPriceIrr,proposedPriceIrr,legalRateIrr,registeredPriceIrr}`,
`RefundRequest.{totalPaidIrr,penaltyAmountIrr,refundableIrr}`,
`PromoCode.value` (dual percent/fixed — a FIXED-type code's value is an
IRR amount), `PromoRedemption.discountIrr`, `WalletEntry.signedAmountIrr`,
`PriceLock.{lockedPriceIrr,feeIrr}`, `AiUsageLog.costIrr` — converted
`Int`/`Int?` → `BigInt`/`BigInt?`. Non-money `Int` fields (seat counts,
percentages like `penaltyPct`/`discountPct`, token counts, byte sizes,
minutes) deliberately untouched. Single migration
`20260731061249_money_columns_int_to_bigint`: plain
`ALTER COLUMN ... TYPE BIGINT` per column — Postgres's standard widening
conversion, no data loss, applied cleanly to both the dev and test
databases with existing data present.

**New shared infrastructure** (CLAUDE.md: "Money is NEVER a float. All
arithmetic through a single money utility module" — this module didn't
actually exist yet before this migration; it does now):

- `backend/src/common/money.ts` — `Irr = bigint`, plus `addIrr`/`subIrr`/
  `negateIrr`/`pctOfIrr` (integer-percent, half-away-from-zero rounding)/
  `roundIrrTo` (round to nearest step, e.g. the business-cabin multiplier's
  "nearest 100,000 IRR")/`divRoundBigInt` (bigint division with the same
  rounding, used for margin %, revenue-mix %, paid %, average-fare
  derivations)/`compareIrr`/`maxIrr`/`minIrr`/`isPositiveIrr`/
  `isNegativeIrr`/`isZeroIrr`/`toIrr` (parses a DTO value, throws on a
  non-integer). Every service touching money now goes through this
  instead of hand-rolled bigint arithmetic.
- `backend/src/common/bigint-json.ts` — `BigInt.prototype.toJSON` patched
  to render as a decimal string (`JSON.stringify` throws on a raw
  `bigint`; a JS `number` can't safely represent amounts above 2^53
  anyway, so every money field in every API response is now a **string**,
  e.g. `{"priceIrr": "5000000"}`). Imported for its side effect in
  `main.ts` (real app) and `test/jest-setup.ts` (e2e tests).
- `backend/src/common/dto/irr.decorator.ts` — `@IsIrrAmount()` (accepts a
  bigint/integer-number/numeric-string), `@MinIrrAmount(min: bigint)`
  (bigint-safe stand-in for class-validator's own `@Min()`, which
  mishandles bigint), `@TransformToIrr()` (converts the validated value to
  `bigint` via `class-transformer`). Applied to every DTO field where a
  client submits one of the 27 columns as input (agency credit-limit
  updates, invoice amounts, wallet top-up, booking payment confirmation,
  fare-rule/pricing-proposal prices, ...).

**ML-boundary exception** (the only place a bigint is deliberately
converted back to a plain `number`): `flights.service.ts`/
`pricing.service.ts`'s `runAiAnalysis()`, building the outbound
`PriceSuggestionItem[]` payload sent to the internal FastAPI pricing
service. Justified because ML output is advisory-only (CLAUDE.md ML
Service Rules — never authoritative, never sets a bookable price by
itself) and every real fare amount is far below 2^53, so no precision is
lost in practice; the suggestion only becomes an authoritative
`registeredPriceIrr` when a CEO explicitly registers it, at which point
`pricing.service.ts`'s `register()` converts it back to `Irr` via
`toIrr()`.

**Testing**: full backend unit suite 50/50; full backend e2e suite
391/392 (the one remaining failure is the pre-existing, previously
documented Phase-51 timeout flake on `flight-engine-completion.e2e-spec.ts`'s
Y/B/M fare-class test, confirmed unrelated to this migration by re-running
it with a longer timeout, which passes with correct values); `tsc
--noEmit` and `eslint` clean on the backend; frontend `tsc`/lint show no
new errors; frontend unit suite 327/327, 72 files.
Two intentional test-behavior changes (not weakened assertions):
`agencies.e2e-spec.ts`'s "rejects a limit beyond the Int32 ceiling" test
is obsolete by design (removing that ceiling was the point of the
migration) and now proves the validation guard against a negative limit
instead; `reporting.e2e-spec.ts`'s "money fields are raw integers"
assertion flips from `typeof === 'number'` to `typeof === 'string'`,
matching the new wire format on purpose.

## Phase D — Blog CMS (`BlogPost`)

Migration `20260731140000_blog_posts`.

```prisma
enum BlogCategory { NEWS GUIDE DEST OFFERS }
enum BlogPostStatus { DRAFT PUBLISHED SCHEDULED }

model BlogPost {
  id          String         @id @default(uuid())
  title       String
  slug        String         @unique
  body        String         @db.Text
  category    BlogCategory
  status      BlogPostStatus @default(DRAFT)
  coverFileId String?        @unique
  coverFile   StoredFile?    @relation("BlogPostCover", ...)
  authorId    String
  author      User           @relation("BlogPostAuthor", ...)
  viewCount   Int            @default(0)
  publishedAt DateTime?
  scheduledAt DateTime?
  deletedAt   DateTime?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  @@map("blog_posts")
}
```

Plus on `User`: `blogPostsAuthored BlogPost[] @relation("BlogPostAuthor")`.
Plus on `StoredFile`: `blogCoverFor BlogPost? @relation("BlogPostCover")`.

- `slug` is unique; auto-generated from title when omitted at create time.
- Public visibility: `PUBLISHED`, or `SCHEDULED` with `scheduledAt <= now()`.
- Soft-delete via `deletedAt`; admin list excludes deleted rows.
- `PANEL_NAV.SITE_ADMIN` gains `{ key: 'blog', implemented: true }`.
- Seed: five sample posts (three published, one draft, one future-scheduled)
  authored by `site.admin`.

## Phase E — Site content CMS

```prisma
enum SiteContentBlockKey { HERO_BANNER ANNOUNCEMENT_BAR PROMO_BANNER }

model SiteMediaAsset {
  id           String     @id @default(uuid())
  storedFileId String     @unique
  label        String
  uploadedById String
  deletedAt    DateTime?
  createdAt    DateTime   @default(now())
  @@map("site_media_assets")
}

model SiteContentBlock {
  key          SiteContentBlockKey @id
  enabled      Boolean             @default(true)
  title        String              @default("")
  subtitle     String              @default("")
  buttonText   String              @default("")
  badgeText    String              @default("")
  imageFileId  String?             @unique
  updatedById  String?
  updatedAt    DateTime            @updatedAt
  @@map("site_content_blocks")
}

model SiteDestinationHighlight {
  id          String    @id @default(uuid())
  airportCode String
  priceIrr    BigInt
  imageFileId String?   @unique
  sortOrder   Int       @default(0)
  deletedAt   DateTime?
  @@map("site_destination_highlights")
}

model SiteRouteHighlight {
  id              String    @id @default(uuid())
  fromAirportCode String
  toAirportCode   String
  priceIrr        BigInt
  sortOrder       Int       @default(0)
  deletedAt       DateTime?
  @@map("site_route_highlights")
}
```

Plus on `User`: `siteMediaUploaded`, `siteContentBlockUpdates`.
Plus on `StoredFile`: `siteMediaAsset`, `contentBlockImage`, `destHighlightFor`.

- Prices stored as IRR (`BigInt`); UI converts to toman at render time only.
- Blocks auto-created with Persian defaults on first admin/public read if missing.
- `PANEL_NAV.SITE_ADMIN` gains `{ key: 'media', implemented: true }`.
- Seed: three blocks + five routes + four destinations matching home mock data.

# Operational account bootstrap (2026-08-05)

The initial production management accounts use the existing `User` model; no
schema change is required. The offline bootstrap sets a named owner, unique
username, unique normalized Iranian mobile, management `Role`, Argon2
`passwordHash`, `twoFactorEnabled=true`, `isActive=true`, and
`mustChangePassword=true`. It never updates an existing identity and inserts
the requested set in one transaction.
The operation also requires an active `ExternalServiceConfig(key =
"ext_kavenegar")`; on a clean database it may create that existing-schema row
with an operator-supplied API key encrypted by `PII_ENCRYPTION_KEY` in the same
transaction. This resolves the mandatory-2FA bootstrap dependency without a
temporary authentication bypass.

## Temporary panel UAT access (2026-08-05)

`User.temporaryPasswordOnlyUntil` is a nullable `timestamp(3)`. It is non-null
only for controlled `uat.*` panel accounts. Such an account can use
password-only staff login only before this timestamp. The initial window is
seven days; a controlled owner-approved extension can add seven days once and
is hard-capped at 14 days from creation. Its access and refresh tokens cannot
outlive the
timestamp. All ordinary staff retain mandatory 2FA. Cleanup deactivates the
account, clears its password hash, and revokes its sessions while preserving
audit and business references.

The temporary credential format is 16 English letters/digits generated with a
cryptographically secure RNG. The owner-approved format rotation changes no
schema: it atomically replaces the seven existing Argon2 `passwordHash` values,
preserves each `temporaryPasswordOnlyUntil`, records security audit rows, and
revokes every active refresh token for those accounts.

## Owner super-admin access (2026-08-06)

`User.isSuperAdmin boolean NOT NULL DEFAULT false` identifies the single
owner-controlled break-glass management account. It is deliberately separate
from the `Role` enum: the persisted role remains `SITE_ADMIN`, while server
guards use this flag to grant management-role endpoints only. `USER` and
`AGENCY` owner-scoped resources are excluded from elevation.

The production bootstrap enforces at most one active `isSuperAdmin` row in its
transaction, normalizes the Iranian mobile into the existing unique `phone`
column, stores only an Argon2 password hash, sets `mustChangePassword=true`,
clears `temporaryPasswordOnlyUntil`, revokes prior refresh sessions on
rotation, and records an `AuditLog(category=SECURITY)` row without password
material.

## Phase 68 — complete multi-role sandbox UAT

### Customer completion

`profileIncomplete`, `completionPct`, and missing fields are derived from the
User fields `fullName`, `nationalIdEnc`, `birthDate`, `passportNoEnc`,
`addressEnc`, and `emailVerifiedAt`. `addressEnc` is encrypted at rest and was
added by migration `1788691200000-CustomerAddressAndFixedAncillaries`. One
shared backend helper is the source of truth; the database is never updated
with a duplicate cached percentage.

### Dual agency approval

`AgencyMembershipRequest` adds nullable, audited fields:

- `commercialApprovedById -> User`, `commercialApprovedAt`
- `financeApprovedById -> User`, `financeApprovedAt`

The existing status enum remains stable. `PENDING|REFERRED` plus no commercial
timestamp means awaiting commercial review; a commercial timestamp without a
finance timestamp means awaiting finance review; `APPROVED` requires both.
Account/profile/credit creation and the final request update run in one
transaction after a pessimistic request-row lock, preventing duplicate final
approval.

### Agency allotment consumption

`Booking` adds nullable `allotmentId -> AgencyAllotment` (`ON DELETE RESTRICT`,
indexed). It is required by service validation whenever `channel=AGENCY`.
Allotment usage is derived from Passenger rows belonging to non-cancelled,
non-expired bookings with that exact `allotmentId`; no mutable consumed counter
is stored.

Agency sale locks, in order, FlightInstance, AgencyAllotment, and
AgencyCreditLine. Within the same transaction it verifies physical seat
availability, `used + requested <= seatsAllocated`, and
`outstanding SALE+SETTLEMENT + price <= limitIrr`; then writes Booking,
Passengers, and one positive SALE LedgerEntry. This serializes concurrent
attempts and keeps inventory, allotment, and credit consistent.

## Phase 69 — Aircraft catalog, charter/agency seat commitments

Branch: `agent/commercial-operations-backend`.

### `CabinClass` enum

Adds `FIRST` (Postgres enum-value addition, irreversible per the standard
Postgres limitation — every prior `ADD VALUE` migration in this codebase
follows the same documented, one-way convention).

### `AircraftSeatMap` (existing table)

Adds a nullable FIRST band, mirroring the pre-existing COMFORT band:
`firstRowStart`, `firstRowEnd`, `firstColsLeft text[]`, `firstColsRight
text[]`. Adds `aircraftDefinitionId` (plain text column, **no FK
constraint** — see below). No existing row's BUSINESS/COMFORT/ECONOMY band
values are touched; MD-80 and Airbus A320 are unaffected until explicitly
edited through the new Aircraft CRUD.

### `FlightInstance` (existing table)

Adds `aircraftDefinitionId` (plain text column, no FK constraint),
best-effort backfilled from the existing `aircraftTypeOverride`/
`Flight.aircraftType` match against the new catalog; `NULL` when no match
is found (never fabricated).

### `AircraftDefinition` / `AircraftCabin` / `AircraftSeat` (new tables)

Normalized aircraft catalog, one row set backfilled per pre-existing
`AircraftSeatMap` row (derived from — not replacing — that row's band
description):

- `AircraftDefinition`: `id`, `code` (unique), `model`, `title`, `status`
  (`AircraftStatus`: ACTIVE/INACTIVE), `totalCapacity`, `version`
  (optimistic edit counter), `createdById`/`updatedById` (plain, no FK —
  see below), `createdAt`/`updatedAt`.
- `AircraftCabin`: `id`, `aircraftDefinitionId -> AircraftDefinition`
  (`ON DELETE CASCADE`, real FK + entity relation), `cabinType`
  (`CabinClass`), `capacity`. Unique on `(aircraftDefinitionId, cabinType)`.
- `AircraftSeat`: `id`, `aircraftDefinitionId -> AircraftDefinition`
  (`ON DELETE CASCADE`, real FK + entity relation), `row`, `column`,
  `label`, `cabinType`, `side` (`AircraftSeatSide`: LEFT/RIGHT),
  `isBlocked`. Unique on `(aircraftDefinitionId, label)`.

`AircraftCabin`/`AircraftSeat`'s `aircraftDefinitionId` DOES carry a real FK

- `@ManyToOne` relation (single level of nesting, not the recursive jsonb
  type that triggers TS2589 — safe). `AircraftSeatMap.aircraftDefinitionId`,
  `FlightInstance.aircraftDefinitionId`, and `AircraftDefinition.createdById`/
  `updatedById` are, by contrast, plain columns with **no** relation and
  **no** DB-level FK constraint — the established TS2589-avoidance convention
  in this codebase (adding a relation on an entity that already carries jsonb
  columns risks pushing unrelated `.findOneBy()`/`.update()` calls elsewhere
  in the codebase over the TypeScript compiler's type-recursion limit).
  `schema-parity.e2e-spec.ts` (which asserts the TypeORM entities describe the
  live schema byte-for-byte) is the guard rail that keeps migration DDL and
  entity relation metadata from drifting apart on this point.

### `CharterCommitment` / `AgencySeatCommitment` (new tables)

Per-cabin capacity/financial-declaration layer, additive alongside the
pre-existing `AgencyAllotment` (unchanged; continues to drive actual
per-ticket agency-channel booking). Both tables share the same shape:

- `id`, `flightInstanceId` (plain, no FK — same convention as above),
  `cabin` (`CabinClass`), `seats`, `contractPriceIrr` (bigint, renamed from
  `amountIrr`), `startDate`/`releaseAt` (nullable, renamed from
  `periodStart`/`periodEnd` — `releaseAt` matches the pre-existing
  `AgencyAllotment.releaseAt` convention; the API also accepts `endDate` as
  an alias for `releaseAt`), `status` (`CommitmentStatus`:
  ACTIVE/CANCELLED), `idempotencyKey` (nullable, unique),
  `createdById`/`cancelledById` (plain, no FK), `createdAt`/`cancelledAt`.
  Renamed in migration `1786694400000-RenameCommitmentFields` (Phase 70) —
  data preserved, only column names changed.
- `AgencySeatCommitment` additionally has `agencyId` (plain, no FK — an
  `AgencyProfile.userId`).
- Indexed on `(flightInstanceId, cabin)` for the capacity-summary
  aggregation query; `AgencySeatCommitment` additionally indexes `agencyId`.

`LedgerEntry.type` gains `COMMITMENT` (irreversible enum-value addition,
same convention as `CabinClass.FIRST`); every commitment create writes one
`LedgerEntry` row with the commitment's `contractPriceIrr` — no direct
balance mutation, matching the codebase's double-entry-ledger rule.

Capacity math (`CommitmentsService.assertCapacity`, row-locks the
`FlightInstance` first) enforces `SUM(ACTIVE commitments for the cabin) +
SUM(already-sold seats for the cabin) + new seats <= min(configured
cabinCapacities seats, physical seat-map seats for that cabin)` — a
commitment can never exceed the aircraft's real layout even if
`cabinCapacities` were configured higher. **Phase 70 fix**: the sold-seats
term was previously missing entirely, allowing a new commitment to be
accepted even when the cabin was already fully (or over-)sold — caught by
a new concurrency test exercising real seat sales against commitment
capacity.

## Phase 70 — Notifications, cartable unread state

Branch: `agent/commercial-operations-backend`. See `docs/API.md`'s Phase 70
section and `docs/api-contract-pr126.md` for the full endpoint contract.

### `Notification` (new table, migration `1786780800000-Notifications`)

- `id`, `recipientId` (plain text, no FK — same TS2589-avoidance convention
  as every other new back-reference column in this file), `category`
  (`NotificationCategory`: CARTABLE/MESSAGE/REQUEST/APPROVAL/SYSTEM),
  `action` (text — stable English code, e.g. `CREATED`/`REFERRED`/
  `APPROVED`/`REJECTED`/`ACCESS_REVOKED`), `title`, `body` (nullable),
  `entityType`/`entityId` (nullable, plain — polymorphic reference, not a
  real FK), `dedupeKey` (nullable, **unique** — the idempotency mechanism:
  `notify()` checks-then-inserts on this key), `readAt` (nullable —
  `NULL` means unread), `createdAt`.
- Indexes: `(recipientId, readAt)`, `(recipientId, category, readAt)`
  (both power the unread-count/list queries), unique on `dedupeKey`.

### `CartableTask.readAt` (new column, migration

`1786867200000-CartableTaskReadAt`)

Nullable `timestamp`, same unread-state semantics as `Notification.readAt`
(`NULL` = never viewed). Indexed as `(assigneeId, readAt)`. Existing rows
are `NULL` on migrate — pre-existing tasks are treated as unread, matching
prior behavior where every open task was effectively "new" until acted on.

### `CharterCommitment`/`AgencySeatCommitment` — no DB FK confirmed by audit

Re-confirmed during Phase 70 (cross-checked every entity file against every
migration's raw `CREATE TABLE`/`FOREIGN KEY` DDL): both tables'
`flightInstanceId` columns have **zero** DB-level constraint, matching
their entity declarations — the sandbox purge script (see API.md Phase 70)
therefore deletes these two tables explicitly by `flightInstanceId` rather
than relying on any cascade.

# 2026-08 management panel hardening (no migration)

- Panel availability continues to use `panel_access_flags`. The `OPERATIONS`
  key maps to users with role `OPERATIONS_MANAGER`.
- Disabling a panel sets `revokedAt` on every non-revoked `refresh_tokens` row
  owned by a user in the affected role. Existing access JWTs are rejected by the
  panel guard through the live panel flag.
- CEO pricing-screen retention is a query rule over
  `fare_pricing_proposals.approvedAt`; it does not delete proposal or audit rows.
- Commercial flight lifecycle views reuse `flight_reviews`, `audit_logs`,
  `fare_pricing_proposals`, and `flight_instances.aiSuggestion`; no duplicate
  history or AI-decision table is added.

## Phase 72 — V4 gaps

- `flight_schedule_templates` — seasonal template with airports, aircraft,
  weekdays, IRR prices, cabin capacity snapshot, idempotencyKey, status.
- `flight_instances.scheduleTemplateId` — nullable link to template.
- A template materializes one `flight_instances` row per matching operating
  date. These rows intentionally reuse the route's flight number, are ordered
  by their dated departure, and begin with `definitionStatus=DRAFT` and
  `publicSaleEnabled=false`. The existing approval workflow is the only path
  that opens them to public/agency sale. This invariant uses existing columns
  and requires no migration.
- `bank_loan_applications` — bankReferenceId, requestedAmountIrr, bankStatus,
  statusSummary (non-sensitive), webhook event id, optional walletCreditReference;
  unique(`userId`,`idempotencyKey`); unique partial `walletCreditReference`;
  `lastWebhookOccurredAt` for replay protection.
- `bank_loan_webhook_events` — append-only audit; unique(`provider`,`eventId`);
  redacted payload; processingResult (`APPLIED` / `DUPLICATE` / `IGNORED_*`).
- `airports.isInternational` — used by destination stats (DXB/IST/NJF seeded true).
- `bank_loan_wallet_credits` — payout ledger keyed by `creditReference`
  (atomic claim via INSERT ON CONFLICT DO NOTHING).
- `bank_loan_applications` initiation lifecycle: `INITIATING` status,
  `initiationStartedAt` / `initiationLeaseUntil` for safe bank-create retry
  with the same bank-scoped idempotency key.
- Migrations: `1787040000000-V4ScheduleTemplatesLoansDestStats`,
  `1787126400000-V4LoanScheduleHardening`,
  `1787212800000-V4LoanWalletCreditLedger`,
  `1787299200000-V4LoanInitiationLifecycle`.

### Atomic completion invariant (no migration)

The commercial Add Flight screen completes an existing
`flight_instances.scheduleTemplateId` occurrence. Its physical
`capacity`, `cabinCapacities`, aircraft definition, route and departure are
authoritative schedule/aircraft snapshots. The completion transaction may
replace `fare_rules` and update the single `fare_pricing_proposals` row, but it
must not create a second instance or allow the client to enlarge physical
capacity. Definition, fare rules, proposal and transition to
`PENDING_OPERATIONS` commit or roll back together.

## Passenger fare snapshots (2026-08-10)

`passengers` stores the immutable purchase-time classification and fare inputs:

### Persisted passenger e-tickets (2026-08-31)

Each `passengers` row is the passenger-level ticket record and gains nullable
`ticketNo` (unique) and `ticketIssuedAt` columns. Payment assigns both fields
to every passenger inside the same database transaction as the wallet debit,
booking status transition, SALE ledger entry, and payment idempotency claim.
EXST remains columns on its owning passenger and never creates a second ticket.
Existing ticketed passengers are backfilled by migration.

- `passengerType text NOT NULL` (`ADULT|CHILD|INFANT`)
- `birthDate date NOT NULL`
- `occupiesSeat boolean NOT NULL`
- `fareIrr bigint NOT NULL`
- `taxIrr bigint NOT NULL`

`seatCode` remains nullable and is null only for a lap infant. Availability and commitment checks count occupied seats, while receipts and extras may count all travellers according to their billing unit.

Migration `1788076800000-PassengerGenderPassport` also stores checkout
`gender` (`male`|`female`) and encrypted `passportNoEnc` on the passenger
row.

## Manager panel permission restrictions

- `users.panelPermissions jsonb NULL` stores an optional array of coarse manager-panel permission keys.
- `NULL` means the account follows its role defaults (backward compatibility). An empty array is an explicit restriction to unmapped/common surfaces only.
- These keys are subtractive. They do not replace role-based authorization and cannot expand a user's role.

## Agency seat-request planning and activation (updated 2026-08-21)

A pending agency request remains workflow state, not inventory. The structured
request is persisted in `agency_seat_requests` and its selected occurrences in
`agency_seat_request_flights`; `cartable_tasks(sourceType=AGENCY_REQUEST)` is
the actionable notification and `audit_logs` records every transition.

Migration `1788604800000-AgencyClassAllotments` adds nullable/backward-compatible
`cabin` (`CabinClass`) and `fareClassCode` columns to both
`agency_seat_requests` and `agency_allotments`, plus `seatRequestId` on
`agency_allotments`. A unique partial index on
`(seatRequestId, flightInstanceId) WHERE seatRequestId IS NOT NULL` makes
request activation idempotent. New portal requests always populate cabin and
class; legacy/manual allotments may keep them null.

The commercial release source of truth is `fare_rules.agencySeatsReleased` and
`fare_rules.agencyReleasePriceIrr` for the exact flight/cabin/class. Pending
requests do not reduce that quota. CREDIT approval or linked-invoice payment
locks the request, occurrences, fare rules, flight instances and existing
allotments; it then creates one `AgencyAllotment` per occurrence only when the
sum remains within both the released class quota and the aircraft cabin map.
The allotment becomes bookable inventory only after this atomic activation.

The agency **Active flights** list is a read projection, not a new inventory
table: future `SCHEDULED` + `PUBLISHED` `flight_instances` joined to their
`fare_rules` are combined with the caller's active `agency_allotments`. A
published row is visible even when its release/allotment values are zero. Zero
allocated/sold values in that projection do not create an `AgencyAllotment`;
only the existing approval/payment activation path creates bookable agency
inventory.

`FlightInstance.status` is time-driven: sold-out capacity never changes
`SCHEDULED` to a completed state. `DEPARTED` is set only at/after
`departureAt`; booking/passenger `FLOWN` projections follow that lifecycle.

## API Gateway hardening (2026-08-13)

No database schema or migration is introduced. API version aliases, request
correlation, trusted-proxy address resolution, throttling, timeouts, body-size
limits, security headers, logging, health checks, and error normalization are
transport/operational concerns. They do not persist or mutate reservation,
pricing, seat-lock, executive-approval, or financial state.

## Commercial inventory state projection (2026-08-13)

No schema change is required. Commercial active inventory is projected only
from sellable `flight_instances` (published/approved, or a pending revision
that retains an approved snapshot). The seat-map projection deliberately keeps
four existing persistence states distinct: unexpired `Booking.status=HELD`,
confirmed paid/ticketed passenger seats, active managerial `seat_locks`, and
company blocks (`seat_locks.classification=FREE`). The public 15-minute hold
deadline continues to be stored in `bookings.holdExpiresAt`; immutable financial
sales continue to be stored in `ledger_entries`.

# Senior Manager permission catalog (2026-08)

Migration `1787644800000-SeniorManagerPermissionCatalog` preserves dashboard and cartable access on existing non-null `users.panelPermissions` arrays. No new table is introduced; `panelPermissions` remains the server-enforced JSONB capability list.

# Commercial panel design refresh — schema (2026-08-18)

Migration `1787731200000-CommercialSeatRequestsAncillaries`:

- `agency_invoices.descriptionFa text NULL`
- `AgencyInvoiceStatus` gains `VOIDED` (OVERDUE is unchanged and is **not**
  VOIDED). `GET /agencies/invoices?status=UNPAID` matches `UNPAID` and `OVERDUE`.
- `agency_seat_requests`: `id`, `agencyId` (agency user id, indexed, no FK so
  the UAT sandbox identity without a profile can still persist a request),
  `routeId` FK nullable, `aircraftType`, `seats int`, `termMonths smallint`
  nullable (accepted `1|3|6|12`), `unitPriceIrr bigint`, `payMethod`
  (`CREDIT|INVOICE`), `status` (`PENDING|PENDING_FINANCE|APPROVED|REJECTED`),
  `invoiceId` FK nullable, `dueAt` nullable, `decidedById` nullable,
  `decidedAt` nullable, `cabin` nullable, `fareClassCode` nullable,
  `createdAt`, `updatedAt`. Indexes on
  `(agencyId, status)` and `(status, createdAt)`.
- `agency_seat_request_flights`: `id`, `seatRequestId` FK CASCADE,
  `flightInstanceId` FK RESTRICT, `createdAt`. Unique
  `(seatRequestId, flightInstanceId)`.
- `ancillary_services`: `key` PK (URL-safe), `category` (`SEAT|OTHER`),
  `titleFa`, `descriptionFa`, `priceIrr bigint`, `enabled`, `isCustom`,
  `updatedById` nullable, `createdAt`, `updatedAt`. Built-in 3 seat + 8 other
  rows are inserted by the migration (Persian copy from the design mock).
  Index `(category, enabled)`.

`POST /agency-portal/seat-requests` writes these tables; `cartable_tasks`
remain notifications (`sourceType=AGENCY_REQUEST`, `sourceId` = request id).
Cross-agency invoices still use `agency_invoices` only.

## Customer address and fixed checkout services (2026-08-21)

- `users.addressEnc text NULL` stores the residence address encrypted with the
  same AES-256-GCM PII helper as national ID and passport. It is decrypted only
  for the owning customer's profile/privacy export and is cleared by account
  deletion.
- Profile completeness now derives from six fields: full name, national ID,
  birth date, passport, address, and verified email.
- `travel_extra_settings.code IN ('SEAT_SELECTION','PET')` and the matching
  `ancillary_services` rows are migration-repaired to active/purchasable state.
  Service guards prevent deletion or disabling while still allowing audited
  price changes.

## Localized public travel extras (2026-08-28)

- `travel_extra_settings` adds nullable `descriptionEn` and `descriptionAr`;
  together with the existing `titleEn` and `titleAr`, every public checkout
  service can carry immutable Persian, English and Arabic display copy.
- `bookings.extrasSnapshot` remains JSONB and now stores optional `titleEn`
  and `titleAr` beside `titleFa`, so payment review and historical invoices use
  the purchase-time translation rather than a later mutable service record.

## Site-admin rules persistence (2026-08-20)

No new table or migration is required. The seven ordered categories are stored
as one JSONB value in the existing `system_settings` row whose key is
`siteRules`. Its value has the shape
`{ categories: [{ id, title, text }] }`; the API requires the fixed ids
`purchase`, `refund`, `change`, `baggage`, `club`, `privacy`, and `pets`
exactly once. `updatedById` and `updatedAt` continue to provide setting-level
provenance, while `audit_logs` records each save. Public reads expose this
value only through the allowlisted rules projection.

## Aircraft cabin capacity and route activation (2026-08-24)

- `AircraftCabin` remains the normalized, authoritative per-aircraft capacity
  table for `FIRST|BUSINESS|COMFORT|ECONOMY`. Aircraft create/update now accepts
  these values explicitly and verifies them against the physical
  `AircraftSeatMap` before replacing the rows.
- `FlightInstance.cabinCapacities` is the per-occurrence activation snapshot.
  Only selected cabins appear; each selected quantity is positive and bounded
  by the linked `AircraftDefinition -> AircraftCabin` capacity.

## Route cabin pricing and smart distance (2026-09-01)

- `aircraft_cabins.defaultClassCode text NOT NULL` stores the single standard
  fare-class code used when a route materializes its initial fare rules. The
  migration backfills `F/C/W/Y` for FIRST/BUSINESS/COMFORT/ECONOMY and a
  per-aircraft unique index prevents one class code from naming two cabins.
- `flight_schedule_templates.cabinCapacities` remains the immutable seasonal
  snapshot and each new row has
  `{ cabin, seats, basePriceIrr, defaultClassCode }`. Legacy rows without the
  new fields remain readable and fall back to the template-wide
  `agencyPriceIrr` and standard `F/C/W/Y` mapping for historical display.
- `routes.distanceKm integer NULL` stores the accepted airport-to-airport
  distance and `routes.distanceSource text NULL` is `AI` or `MANUAL`.
  `flight_schedule_templates` carries the same two nullable fields as an
  immutable seasonal snapshot. The route is the canonical persisted owner so
  every dated occurrence shares the same accepted distance.
- Initial `fare_rules` are created transactionally for every materialized
  occurrence/cabin using the per-cabin base price and aircraft default class.
  Both site and agency release counts remain zero until commercial release.

## Passenger adjacent extra seat (2026-08-24)

- `Passenger.extraSeatCode text NULL` stores the adjacent EXST assigned to the
  same traveller. It is inventory only and does not create a second passenger
  or baggage allowance.
- `Passenger.extraSeatFareIrr bigint NOT NULL DEFAULT 0` stores the audited
  base-fare amount charged for that seat. Active inventory and fare-bucket
  queries count a non-null `extraSeatCode` as one additional occupied seat.

## Customer loan bank profile (2026-08-25)

- `bank_loan_customer_profiles` has one row per USER (`userId` primary/FK).
- `membershipStatus` tracks declared bank membership/account opening without
  pretending the bank has completed a step.
- `customerNumberEnc` is AES-256-GCM encrypted; only `customerNumberLast4` is
  serialized to clients.
- `accountOpeningReferenceId` and `eligibilityReferenceId` are opaque bank
  references. Their statuses and non-sensitive summaries are persisted for
  retryable polling and audit.
- `eligibleAmountIrr` is nullable bigint IRR and is populated only from the bank
  eligibility response. It authorizes a maximum request; it is not a wallet
  balance.
- Loan disbursement remains an immutable `bank_loan_wallet_credits` claim plus a
  `wallet_entries` credit; no mutable balance column is introduced.

`agency_seat_request_flights` continues to be the authoritative occurrence list
for a seat order. The request total is calculated from persisted occurrences,
seat count and fare rule price. Credit authorization reads the immutable agency
ledger/credit-line projection and is rechecked transactionally by the server.

## Channel inventory and message attachments (2026-08-27)

- `fare_rules.siteSeatsReleased integer NOT NULL DEFAULT 0` is the commercial
  manager's explicit public-site quota for one flight/cabin/fare class.
  `siteSeatsReleased + agencySeatsReleased <= seatsAllocated` is enforced by
  the transactional command handlers that update either channel.
- `agency_messages.attachments jsonb NULL` stores an ordered array of
  `stored_files.id` values. Ownership is validated before the message is
  inserted; responses resolve the ids to immutable file metadata.
- `cartable_tasks.attachments jsonb NULL` stores the same ordered id array for
  direct employee/manager messages and manager broadcasts delivered into a
  recipient's cartable. File read authorization follows task participation.
## Independent agency sales visibility (2026-08-27)

`FlightInstance.agencySaleEnabled boolean NOT NULL DEFAULT true` is the
commercial manager's independent agency-catalogue gate. It does not alter
`publicSaleEnabled`, fare-class release quantities, agency allotments, or
existing bookings. Existing rows default to enabled so active sellable flights
remain requestable unless a commercial manager explicitly disables the agency
channel.

## Fare-class advisory pricing projection (2026-08-30)

No schema migration is required. The per-class pricing assistant is a
read-only projection over `FlightInstance`, `FareRule`, confirmed `Booking` /
`Passenger` inventory and the existing `competitorPriceIrr`. Suggestions are
not persisted as an authoritative fare and cannot change channel visibility or
inventory. Only the existing audited site-price and agency-release commands may
publish a manager-confirmed rate.

## Finance report detail and paging correction (2026-08-27)

No schema migration is required. The finance customer-flight detail is a
read-only projection over existing `bookings`, `passengers`, `flight_instances`,
`flights`, `routes`, `users`, and `ledger_entries`. Purchased cabin/fare class
and monetary fields continue to come from the immutable booking snapshot.
Report tables paginate in the client at exactly 10 visible rows per page; no
duplicate summary or mutable reporting table is introduced.

## Internal cartable support assignment and agency bulletins (2026-08-28)

No new table or migration is required.

- `support_tickets.forwardedToId` is the authoritative single assignee. Only
  SITE_ADMIN can change it. All non-site-admin staff reads and replies are
  constrained by this value; a requester reply changes status but preserves
  the assignee and conversation history.
- Targeted agency notices use one existing `notifications` row per recipient.
  `entityType = AGENCY_BULLETIN` marks the external agency-safe audience,
  `entityId` is the shared dispatch UUID, and `action` distinguishes `NOTICE`
  from `AMENDMENT`. `recipientId` remains the tenant boundary and `readAt`
  remains the per-agency read receipt. Send provenance is additionally written
  to append-only `audit_logs`.

## Ticket feedback, cartable media, and agency finance projection (2026-08-28)

No schema migration is required.

- Positive requester feedback writes `support_tickets.status = CLOSED`;
  negative feedback writes `OPEN`. An answered ticket whose `updatedAt` is at
  least five days old is closed by the lifecycle worker. Every transition is
  appended to the existing JSON history while `trackingCode`, exact assignee,
  conversation entries, and attachment ids are retained.
- Cartable and support image previews use the MIME metadata already associated
  with `stored_files`; file bytes and authorization remain in the existing
  stored-file service.
- The agency financial timeline is a read-only union of existing
  `agency_invoices`, `ledger_entries`, and `agency_credit_requests`. These
  source rows remain authoritative and no mutable reporting/event duplicate is
  introduced.

## Approved central PSS/CRS schema

These tables live in the dedicated PSS PostgreSQL database. Reliability tables
are implemented in Slice 0; reservation, inventory and accountable-document
tables remain approved contracts for later slices. The website database may
retain read-only projections after cutover but cannot authorize inventory or
document changes.

### Reservations and itineraries

- `pss_orders`: `id`, unique `pnr`, lifecycle status, owner/channel/seller,
  contact reference, currency, totals, hold expiry, payment reference,
  source idempotency key, timestamps and optimistic version.
- `pss_order_segments`: `id`, `orderId`, ordered `sequence`,
  `flightInstanceId`, origin/destination, operating/marketing carrier,
  flight/departure/arrival snapshots, cabin, fare class and segment status.
  Unique `(orderId, sequence)`; one order may have many segments.
- `pss_travellers`: encrypted identity/contact data, hashed lookup fields,
  passenger type, birth date and audit timestamps.
- `pss_order_travellers`: many-to-many order/traveller relation with pricing,
  baggage, seat and special-service snapshots.
- `pss_traveller_segments`: unique `(orderTravellerId, orderSegmentId)` with
  seat assignment and per-segment service state.

### Authoritative inventory

- `pss_inventory_buckets`: unique
  `(flightInstanceId, cabin, fareClassCode, channelScope)`, authorized capacity,
  sale window, version and status.
- `pss_inventory_transactions`: immutable `HOLD | RELEASE | SELL | REFUND |
  BLOCK | UNBLOCK | ADJUST` rows with quantity, order/segment reference,
  command idempotency key, actor and timestamp.
- Availability is derived transactionally from capacity and immutable rows;
  Redis and website projections are never authoritative.
- All multi-segment holds lock bucket rows in stable key order to prevent
  deadlocks and partial itineraries.

### Accountable documents

- `pss_document_stocks`: document type `ETICKET | EMD`, airline numeric code,
  inclusive serial range, next serial, status, source authority and audit data.
  Range overlap is forbidden; allocation uses a pessimistic row lock.
- `pss_ticket_documents`: unique accountable number, validating carrier,
  `orderTravellerId`, issue/payment references, original/replacement document,
  lifecycle `ISSUED | VOID | REFUNDED | EXCHANGED`, immutable issue snapshot.
- `pss_flight_coupons`: unique `(ticketDocumentId, couponNumber)` and unique
  active `(ticketDocumentId, orderSegmentId)`; lifecycle `OPEN | CHECKED_IN |
  BOARDED | FLOWN | VOID | REFUNDED | EXCHANGED`, segment/fare/tax/baggage
  snapshots and DCS references.
- `pss_emd_documents`: unique accountable number, EMD type `A | S`, reason
  code/sub-code, traveller, service, amount/currency, payment and replacement
  references, lifecycle `ISSUED | USED | VOID | REFUNDED | EXCHANGED`.
- `pss_emd_coupons`: ordered coupons associated with an order segment and,
  where required, a flight coupon; consumption and refund history is retained.

### Reliability and integration

- `pss_idempotency_records`: unique `(caller, operation, key)`, request digest,
  response reference and completion state. Reuse with a different digest fails.
- `pss_outbox_events`: immutable aggregate event, payload version, attempts,
  available/published timestamps and dead-letter state. Inserted in the same
  transaction as the business change.
- `pss_nira_submissions`: flight, message kind, payload digest, vendor
  correlation, attempts, acknowledgement, reconciliation/dead-letter state and
  audit timestamps. Raw PII payload retention follows the approved policy.
- `pss_partner_messages`: seller/partner, NDC version/message id, request digest,
  response reference, status and timestamps for replay protection and audit.

### Migration and compatibility

- Existing `bookings` become one-segment `pss_orders`; existing passengers map
  to order travellers and traveller segments.
- Existing random ticket numbers are not silently accepted as accountable
  stock. Backfill classifies each row as verified, quarantined or exception and
  requires an owner-approved reconciliation decision.
- Cutover uses shadow reads and reconciliation first, then a single writer flag.
  Dual writes to website and PSS inventory are forbidden.
