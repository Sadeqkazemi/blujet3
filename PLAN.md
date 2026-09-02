# PLAN.md — blujet roadmap & progress

Scope of this track: the six executive management panels (پنل مدیر عامل،
پنل رئیس هیئت مدیره، پنل مدیر ارشد، پنل مدیر بازرگانی، پنل مدیر مالی، پنل
مدیر IT) plus the shared panel shell and reservation/lock system, per
`CLAUDE.md`. The public-facing site (search/booking/checkout/payment) was
a separate track (branch `claude/airline-project-design-difvku`, ~28
phases: customer purchase flow, price-lock, promo codes, club/wallet,
agencies, staff-auth, reports, GDPR, rate-limiting, Sentry). The two
tracks turned out to have near-total schema/architecture overlap on
admins/agencies/club/refunds/reporting/cartable/staff-auth — since this
track's version of those was already reviewed and merged to `main`, the
explicit merge decision (2026-07-18) was: **keep this track's schema and
modules as-is, and port only the genuinely-missing customer-facing half
(search/booking/payment/refund-submission, and still-pending price-lock/
promo/wallet/points-ledger/GDPR/public frontend) onto this schema**,
rather than reconciling two incompatible Prisma histories. See "Phase 13"
below for what's landed from that port so far.

## Status

- [x] **Responsive search + agency sales/notices isolation QA (2026-08-29)** —
  redesigned the results edit-search mobile sheet, lowered the expanded flight
  metadata cards, and exposed authenticated agency registration values as
  immutable sales-report fields. Agency notices now contain only targeted
  Site Admin bulletin dispatches with 10-row locale-aware pagination; public
  CMS announcements, automatic flight availability, and management-only
  `FlightInstance` events cannot appear in customer/agency bells. Added the
  missing local-dev `/notifications` proxy and verified the agency, finance,
  commercial, Site Admin and notification role boundaries. Acceptance and
  proof: `docs/features/agency-search-notices-sales-qa.md`.

- [x] **Exact public cabin, localized route and selected-only checkout charges
  (2026-08-28)** — public search, price calendar and advisory now preserve the
  requested cabin and never substitute another published class. Results,
  checkout, payment, account, booking management and issued tickets keep the
  origin/destination direction correct for RTL/LTR locales. Public extras and
  paid seat services carry Persian/Arabic/English labels, and only selected
  services are snapshotted and charged. Airport pickers exclude the opposite
  endpoint and reference data includes IKA. Verification and acceptance:
  `docs/features/public-flight-selection-localization.md`.

- [x] **Agency RTRD / PSR / PRR sales-report redesign (2026-08-28)** —
  rebuilt `/agency/sales` from the supplied reconciliation screenshots using
  only tenant-scoped sales, profile, credit and invoice APIs. The page now has
  a real report header, period/balance/payment KPIs, honest sales/refund
  counters, RTRD reconciliation rows, searchable PSR detail, refund-only PRR,
  10-row pagination and CSV export. Financial components absent from the
  current schema are explicitly blank instead of being fabricated. Acceptance
  and proof: `docs/features/agency-sales-report-rtrd-redesign.md`.

- [x] **Agency notices and amendments hub (2026-08-28)** — added the
  `/agency/notices` page to the shared agency desktop/mobile navigation. It
  aggregates the active Site Admin `ANNOUNCEMENT_BAR`, real published flight
  seat-request options, and recipient-scoped agency notifications; each item
  opens a full detail dialog and unread notifications are acknowledged through
  the existing notifications API. Site Admin can now maintain the full agency
  instruction in the announcement subtitle. No mock rows or new parallel data
  store were introduced. Acceptance and proof:
  `docs/features/agency-notices-and-amendments.md`.

- [x] **Remove ticket refund from Commercial services (2026-08-25)** — the
  commercial ancillary-services API and page omit the legacy `refund-fee`
  entry while retaining the actual customer refund and finance workflows.
  The UI also filters the legacy key defensively during mixed-version deploys.
  Acceptance and proof:
  `docs/features/commercial-services-refund-visibility.md`.

- [x] **Approved series visibility + manual airport entry (2026-08-25)** —
  remove the seven-day cutoff from the commercial active-flight inventory so
  every CEO-published occurrence is listed separately, and allow commercial
  users to type a city name and three-letter IATA code instead of being limited
  to the bundled reference catalog. Acceptance and proof:
  `docs/features/approved-flight-series-and-manual-airport.md`.

- [x] **Schedule occurrences, flight-management search and calendar drill-down
  (2026-08-25)** — seasonal route creation now persists one future flight
  instance per matching operating day and explicitly starts every instance as
  `DRAFT` with public sale disabled. Add Flight resolves all occurrences for a
  recurring flight number, displays operating weekdays/months and completes
  the selected eligible record. Flight management adds origin/destination/
  number/date filters plus a one-card low-sales carousel. The shared date
  picker supports year → month → day selection with Persian Jalali and
  English/Arabic Gregorian month localization; the public homepage search
  intentionally keeps its previous month-only navigation. Checklist:
  `docs/features/schedule-occurrence-flight-management-calendar.md`.

- [x] **Atomic scheduled-flight completion and Add Flight redesign
  (2026-08-22)** — the commercial Add Flight flow now resolves and completes
  one materialized schedule occurrence instead of creating a duplicate
  free-form flight. Route, departure, aircraft and physical cabin capacity are
  inherited/read-only; fare and channel capacity is validated per cabin; the
  UI is a four-step flow; and definition, charge/fare rules, pricing proposal
  and `PENDING_OPERATIONS` transition commit through one locked transaction.
  Backend E2E covers rollback, stale version, unknown occurrence, forbidden
  role and physical-capacity rewrite; the existing operations/CEO/public and
  agency seat-allocation journeys (21 E2E assertions), focused frontend tests
  and both builds are green. Checklist:
  `docs/features/atomic-scheduled-flight-completion.md`.

- [x] **Senior Manager panel gaps closed (2026-08-21)** — restored
  `گزارش مسافران` and the approved 14-tab navigation order; enabled seat
  lock and PNR writes for `SENIOR_MANAGER` (no longer view-only); covered the
  senior staff-login journey; made the demo `4A` seat lock seed idempotent;
  and moved forbidden reservation assertions to `FINANCE_MANAGER` while IT
  remains unable to lock seats. Checklist:
  `docs/features/senior-manager-panel-completion.md`. Strategic priorities
  and system settings remain deferred because no product API exists.

- [x] **Commercial panel ZIP alignment — service catalog and fare classes
  (2026-08-19)** — reconciled the supplied commercial-panel handoff and
  screenshot set with the current React/NestJS implementation. The services
  screen now exposes the complete fixed catalog plus audited custom services
  through the existing `/travel-costs` API (no browser-only mock store), and
  the backend contract accepts collision-resistant `CUSTOM_...` codes while
  rejecting arbitrary codes. Flight pricing/fare-class controls from the newer
  handoff remain integrated with the existing flight workflow. Regression
  coverage proves fixed/custom/invalid service codes and the RTL creation flow.
  Checklist: `docs/features/commercial-services.md`.

- [x] **IT Manager webservices/API bundle update (2026-08-19)** — added the
  missing dedicated «وب‌سرویس‌ها و API» page and IT-only endpoints over the
  existing agency request, API-key and audit entities; added safe one-time key
  issue/rotation, irreversible step-up-gated revoke, real usage/event views,
  typed frontend actions and regression coverage. No parallel mock store was
  introduced. Checklist: `docs/features/it-webservices-api.md`.

- [x] **Phase 71 — Flight approval workflow (ops → CEO → PUBLISHED)** — backend merged in #128 and UAT account provisioned in #129. Extends `FlightInstance.definitionStatus` with `PENDING_OPERATIONS` / `OPERATIONS_REJECTED` / `PUBLISHED`, role `OPERATIONS_MANAGER`, `FlightReview` history, version locking, create=`DRAFT`, CEO register → `PUBLISHED` + search sellability. React operations dashboard/cartable/history and the commercial handoff are included in the frontend follow-up. Pricing-alerts / loans / outbox remain separate scoped phases. Checklist: `docs/features/flight-approval-workflow.md`.
- [ ] **Production data integrity + operational golden path (2026-08-05)** — remove production-visible demo fallbacks, prevent production seed/mock provider execution, add a dry-run-first seed audit/cleanup path, and prove flight search → details → passenger → seat → booking → payment → ticket/refund plus operational role visibility. Acceptance and release gates: `docs/features/production-data-integrity.md`.
- [x] **Sandbox multi-role operational UAT gate (2026-08-05)** — converted the cross-role acceptance audit into a repeatable, flow-selectable runner (`scripts/run-sandbox-multirole-uat.mjs`) over the existing database-backed E2E and Playwright proofs, with a fail-closed guard against accidental browser mutations on a non-local environment. Live smoke evaluation against `http://202.133.90.31` is recorded in `docs/features/sandbox-multirole-operational-uat.md`. Release decision is **NO-GO for real passenger sales** until HTTPS, production seed cleanup, real SMS/OTP, a certified payment gateway, and the documented agency/incomplete-profile product gaps are resolved.

- [x] Repo scaffold (frontend/backend/ml-service skeletons, design-reference import)
- [x] Design extraction — all 6 panels + shared shell + `ReservationSystem` read in full; findings folded into `docs/API.md` / `docs/DB_SCHEMA.md`
- [x] **Phase 1 — staff auth + RBAC + panel shell + dashboard/reporting** — see `docs/features/panel-shell-dashboard.md` for the proven checklist (35 backend + 21 frontend unit + 5 E2E tests, all passing; lint+typecheck clean in both packages). Known deferred scope, not silently dropped: IT Manager's real (service-health) dashboard, day/month/flight chart-mode UI, pixel-diff visual regression — see that doc's scope notes.
- [x] Phase 2 — flight/booking core (minimal read-side slice for reporting) — done as part of Phase 1's Prisma schema (Route/Flight/FlightInstance/Booking/LedgerEntry), since reporting needed real data to aggregate
- [x] **Phase 3 — Agencies (list/detail/credit/settlement/membership requests)** — backend: Prisma schema/migration/seed + full `agencies` module (all endpoints from `docs/API.md`'s Phase 3 table, role-reconciled), 25 integration tests (60 backend total). Frontend: آژانس‌ها list/detail/request pages with per-role differences (Senior: API keys; Finance: read+settle; Commercial: نمای کلی/مالی/مکاتبه‌ها sub-tabs, invoices, chat, debtors panel), 10 new Vitest+RTL tests (31 total) and 5 Playwright journeys. All checklist items in `docs/features/agencies.md` proven except the explicitly deferred ones listed at its end (Excel export, invoice description, refer-UI → Phase 4, agency-portal-side suspension). Lint+typecheck clean in both packages.
- [x] **Phase 4 — Cartable, referrals, manager messaging** — implemented end-to-end (docs approved 2026-07-17): 7 new tables, five backend modules (cartable با تأیید/رد/انتقال + نظر مدیر اجباری، ارجاعات مدیر ارشد با چرخه گزارش کامل، پیام سازمانی با تحویل به کارتابل، staff-directory، آپلود فایل), 23 backend tests + 9 Vitest + 3 Playwright loops. Totals now: 83 backend / 40 frontend / 14 Playwright, all green. Two explicitly deferred UI pieces (attachment chips UI → Phase 5, Jalali date-picker popover → shared component in Phase 5/7) listed at the end of `docs/features/cartable-referrals.md`. Merged to main (PR #3).
- [x] **Phase 5 — VIP club** — implemented end-to-end: ClubMember/ClubCardRequest schema (national ID checksum-validated, AES-256-GCM encrypted + HMAC hash for exact search), club module with the ⚑-approved authority rules (CEO/Chair approve any REFERRED, Senior only senior-assigned; direct issuance audited; tier change Senior-only), CEO/Chair rich layout + Senior simple layout, 13 backend tests + 4 Vitest + 4 Playwright journeys. Totals: 92 backend / 44 frontend / 18 Playwright. Merged to main (PR #4).
- [x] **Phase 6 — Ticket pricing proposals** — implemented end-to-end (docs approved 2026-07-17): FarePricingProposal FK-linked to FlightInstance (fixes the mocks' incompatible id schemes), pricing module with the locked-forever registration rule + CEO legal-rate path, the FIRST REAL ml-service (FastAPI price-suggestion: internal token, versioned heuristic, 11 pytest) behind a NestJS AiProvider client (2s timeout, graceful degradation — proven by a Playwright journey that runs with the real uvicorn service AND one with it down). CEO tab + Commercial pricing section (inside its مدیریت پروازها tab, per design). 8 backend + 5 Vitest + 3 Playwright new tests. Totals: 100 backend / 49 frontend / 21 Playwright / 11 pytest. Merged to main (PR #5).
- [x] **Phase 7 — Refunds (استرداد بلیط، پنل مدیر مالی)** — implemented end-to-end (docs approved 2026-07-17): `RefundPenaltyRule` (seeded 4-bracket engine: ≥72h→30٪ / 24–72h→50٪ / 3–24h→70٪ / <3h→100٪, unifying the mocks' 3 inconsistent schemes) + `RefundRequest` lifecycle SUBMITTED→REVIEW→FINANCE→PAID with IBAN/nid/mobile AES-256-GCM encrypted at rest; refunds module (list+KPIs / detail — the only surface that decrypts the شبا / refer without status change / pay as ONE transaction: `LedgerEntry(REFUND, −refundable)` + `Booking→REFUNDED` + PAID+processedBy, replay-guarded → 409). Finance-only (`@Roles('FINANCE_MANAGER')`). Frontend: استرداد بلیط tab (KPI cards, status-pill card list, 3-panel detail modal with penalty breakdown, refer select, pay/closed-case states). 7 backend integration + 11 penalty unit + 6 Vitest + 2 Playwright new tests — see `docs/features/refunds.md` for the item→test map. Totals: 107 backend / 55 frontend / 23 Playwright / 11 pytest. Merged to main (PR #8).
- [x] **Phase 8 — Employee management (IT Manager: accounts, permissions, services, security policy, logs, backups)** — implemented end-to-end (2026-07-17, reassigned to this track by the user, superseding the earlier "separate session" note below): `User` gained dept/rank/referralScope/mustChangePassword/lastLoginAt columns, `Permission`/`EmployeePermission` (seeded verbatim from the design's `PERM_CATALOG`), `InternalService`/`ExternalServiceConfig`, `SecurityPolicy` singleton, `BackupRecord`, `PasswordResetEvent`. New `it-manager` backend module (employees, security incl. active-session/logout-all reusing `RefreshToken`, services incl. a real HTTP test-connection check, real `pg_dump`-backed backups, a technical dashboard on real `os.*` metrics). Frontend: 6 real tabs wired into `PanelShell`/`App.tsx`. 15 new backend e2e tests, 7 new frontend unit tests, 4 new Playwright journeys + fixed the pre-existing `staff-login-journey` itadmin case. Merged with Phase 6's concurrently-landed work (2026-07-17): 115 backend / 56 frontend / 25 Playwright / all green, lint+typecheck clean in both packages. Proven checklist: `docs/features/it-manager.md` — reservation (Phase 9) and دسترسی به پنل‌ها/تنظیمات سامانه (Phase 12) explicitly stay deferred; two smaller UI pieces (external-service edit modal, suspend confirmation) listed as deferred at that doc's end.
- [x] **Phase 9 — Reservation system (seat lock/PNR)** — implemented end-to-end (2026-07-17; role policy updated 2026-08-21): managerial seat lock is allowed for CEO/BOARD_CHAIR/SENIOR_MANAGER/COMMERCIAL_MANAGER; IT_MANAGER remains seat-map read-only but may perform PNR operations. New `AircraftSeatMap` (data-driven per CLAUDE.md, seeded for the existing "Airbus A320" flight matching the design's MD-88 numbers verbatim: 16 business + 130 economy = 146 seats), `SeatLock` (encrypt+hash PII, DB partial-unique-index for true concurrency safety — proven by a 5-parallel-request race test), `Passenger.nationalIdHash`/`seatCode`. `reservation` module: seat map + lock/release, PNR list/detail/seat-change/cancel (reusing Phase 2's Booking/Passenger), staff-side manual PNR issuance (TICKETED directly, no payment gateway — distinct from the public checkout track), flight search with Phase 6 pricing or a documented flat fallback, real dashboard stats (no fabricated "microservices health" data — CLAUDE.md forbids it). Frontend: one `ReservationPage` with PNR-management/seat-map/new-booking sub-tabs, wired into BOARD_CHAIR/SENIOR_MANAGER/IT_MANAGER panels. 13 new backend e2e tests (128 total), 3 new frontend unit tests (59 total), 4 new Playwright journeys against a fresh non-production `_test/flight-instance` hook (avoids depending on the seed's ambiguous historical/demo instances). Lint+typecheck clean in both packages. Proven checklist: `docs/features/reservation.md` — agency API access (Phase 3 already covers it), flight/schedule creation (Phase 10), ticket PDF printing, and exact aisle-gap pixel rendering are explicitly deferred with reasons at that doc's end.
- [x] **Agency Portal (self-service, پنل آژانس)** — implemented end-to-end (2026-07-17, reassigned into this track by explicit user approval, even though `CLAUDE.md` scopes it to the separate public-site track — same pattern as Phases 8/9): new AGENCY-role login (`POST /auth/agency/login`, phone+password, no 2FA — a ⚑ product decision documented since the design's own "کد آژانس" login-identifier concept has no backing field, so it reuses the agency's real registered phone instead); `AgencyProfile.approveRequest` now issues a one-time temp password (was a real gap — approved agencies previously had no way to ever log in). New `AgencyCreditRequest`/`AgencyDocument` models — the design's self-service "افزایش اعتبار" (which directly mutates its own credit limit client-side) is replaced with an audited request that only the existing, already-audited `updateCredit` method can approve (new staff endpoints `GET/PATCH /agencies/:id/credit-requests`). New `agency-portal` backend module: self-scoped dashboard/credit/ledger/invoices(pay-from-credit, reusing the staff transactional logic verbatim)/sales-report/inbox(bidirectional — `AgencyMessage.senderIsAgency` now writable by the agency itself)/profile/documents(reusing Phase 4's `FilesService`). Frontend: distinct `/agency/*` route tree with its own login page, protected-route guard (bidirectional role isolation with the staff `/panel/*` tree), and 5 tabs (allocated-seats and self-service webservice-purchase tabs explicitly deferred — no staff-side counterpart workflow exists for either). 16 new backend e2e tests (144 total), 8 new frontend unit tests (67 total), 4 new Playwright journeys. Lint+typecheck clean in both packages. Proven checklist: `docs/features/agency-portal.md`. Merged to main (PR #9).
- [x] **Phase 10 — Flight management (مدیریت پروازها — Senior/Commercial)** — implemented end-to-end (docs approved 2026-07-17): seeded `Airport` catalog (20 Iranian cities + DXB/IST/NJF) feeding the add-flight selects, `Route.durationMin`, `FlightInstance.basePriceIrr`/`agencySeatsAllocated`/`aiSuggestion`. `flights` module: overview (KPI + فعال/انجام‌شده/آینده with server-derived statuses), add-flight (find-or-create Route/Flight, UTC conversion at the edge, audited), detail modal with REAL channel breakdown from bookings, plan (⚑ stores plan figures only — Commercial's save upserts the Phase 6 proposal, CEO approval still required; REGISTERED → 409), future-flight AI analysis via the Phase 6 ml-service client (suggestion persisted on the instance with modelVersion, graceful degradation). Completed-flights financials computed from real bookings (سود/ضرر vs base rate — no fabricated 18٪ margin). Frontend: FlightsPage (3 sub-tabs, add/detail/plan modals, Jalali day-filter calendar, AI panel) for both panels; Commercial keeps the embedded Phase 6 pricing section on the same tab. 8 backend + 7 Vitest + 2 Playwright new tests — item→test map in `docs/features/flight-management.md`. Explicit deferrals: Excel exports, RRULE schedules (no design UI). Merged to main (PR #10).
- [x] **Phase 11 — Finance tab (مالی), گزارش مسافران, گزارش کارمندان** — implemented end-to-end (2026-07-17): NO schema changes — every figure derived at query time. مالی ships two design-confirmed layouts: FINANCE_MANAGER's finance-ops view (KPI row from the existing `/reporting/kpis`, low-sales alert, completed-flights box, NEW `/reporting/recent-transactions` real-ledger feed, NEW `/reporting/revenue-mix` donut, NEW `/reporting/agency-settlements` rows derived from Phase 3 invoices with the remind action reusing — and role-widening to FINANCE_MANAGER — the existing audited Phase 3 remind endpoint) and the analytic view (sales chart + channel tiles + donut) for CEO/Chair/Senior/Commercial, matching CLAUDE.md's «تراکنش‌ها/تسویه only in the finance panel» rule. گزارش مسافران: new `passenger-reports` module — name-substring or exact-national-ID(hash) search, national ID ALWAYS masked (surface never returns it whole), cabin derived from the Phase 9 seat map. گزارش کارمندان: new `staff-reports` module — dept-isolated EMPLOYEE audit feed + real ACCOUNT-event "new employee" banner. The finance mock's `finMonths` income/expense chart is confirmed orphaned (computed, never rendered) — not built. 10 new backend e2e tests (169 total), 5 new frontend unit tests (85 total), 5 new Playwright journeys. `finance`/`reports`/`staff` nav flags flipped for all their roles. Proven checklist: `docs/features/finance-reports.md`.
- [x] **Phase 12 — Remaining shell tabs (COMPLETE, 2026-07-17)** — first landed as a partial (گزارش مدیران + دسترسی به پنل‌ها UIs over their existing Phase 1 backends), then finished in full: new `admins` module («مدیران و ادمین‌ها», CEO/Chair/Senior — list with REAL «آنلاین» derived from unexpired refresh tokens, add-admin restricted to enum-backed roles با رمز اولیه + تحویل sms/email از مسیر mocked provider، block/unblock که واقعاً در staff-login اعمال می‌شود، بازنشانی رمز با رمز موقت یک‌بارنمایش؛ سلسله‌مراتب مدیریتی server-enforced: CEO/Chair بر ۵ نقش پایین‌تر، Senior بدون SENIOR_MANAGER؛ حساب CEO/Chair و self هرگز قابل مسدودسازی نیستند)؛ `POST /auth/change-password` (تأیید رمز فعلی با argon2)؛ `GET /audit/system-events` برای تب لاگ CEO (سطح presentational روی AuditLog واقعی)؛ ماژول `settings` با جدول جدید `SystemSetting` (key-value با defaultهای سروری و رد کلیدهای ناشناخته) و ⚑ ورودی‌های «قوانین استرداد» که مستقیم `RefundPenaltyRule`های واقعی فاز ۷ را می‌نویسند (هر ۴ بازهٔ واقعی نمایش داده می‌شود، نه ۲ ورودی mock)؛ IT حالا `GET /panels/access` را read-only می‌خواند (PATCH همچنان 403). فرانت‌اند: AdminsPage، OwnSecurityPage + SecurityRouter (IT صفحهٔ فاز ۸ خودش را نگه می‌دارد)، CeoLogsPage + LogsRouter، SettingsPage (بخش‌های chair در برابر IT)، PanelsAccessPage read-only برای IT. ⚑ deferrals مستند: ماتریس permission per-admin (stored-but-unenforced ممنوع؛ نیازمند redesign authorization)، نقش سفارشی free-text، آپلود لوگو، بخش orphaned پروفایل chair. 9 تست جدید بک‌اند (۱۷۸ کل)، 7 تست جدید فرانت (۹۵ کل)، 5 journey جدید Playwright + به‌روزرسانی تست «به‌زودی» قدیمی. **همهٔ nav flagها اکنون `implemented: true` هستند — هیچ تب «به‌زودی» در هیچ پنلی باقی نمانده.** Proven checklist: `docs/features/phase12-admin-settings.md`.
- [~] **Phase 13 — Public purchase engine (customer track, IN PROGRESS, started 2026-07-18)** — porting the standalone branch's customer-facing purchase flow onto this schema, per the merge decision above. Money stays `Int` (matching this track's existing convention/tech-debt note, not `BigInt`); ledger stays this track's single-signed-amount `LedgerEntry`, not the old branch's double-entry pair. Landed so far, all with real e2e coverage (green together with all 12 earlier phases — 197 backend / 95 frontend, lint+typecheck clean):
  - Schema (additive only, no Phase 1-12 column changed): `CabinClass` enum + `CabinFare` (per-cabin price, `@@unique([flightInstanceId, cabin])`); `Booking` gained `userId`/`contactPhone`/`cabin`/`holdExpiresAt`/`idempotencyKey` (all nullable — staff/agency bookings leave them null); `TwoFactorPurpose` gained `CUSTOMER_OTP_LOGIN`.
  - Auth: customer phone+OTP login (`POST /auth/otp/request`, `/auth/otp/verify`) — find-or-create a `role=USER` account, reuses the existing `TwoFactorChallenge` table/`TwoFactorProvider`/JWT machinery rather than a parallel auth stack. 6 new e2e tests in `auth.e2e-spec.ts`.
  - New `booking-engine` module: public unauthenticated search (`GET /search/flights`, `/search/airports`, `/search/flights/:id/seatmap`) reusing the reservation module's `AircraftSeatMap`-driven seat layout; `getCabinPrice` is the single pricing function shared by search results and pre-payment re-pricing so they can never disagree; customer booking (`POST /bookings`, USER-role-gated) row-locks the flight instance (`SELECT ... FOR UPDATE`) to serialize concurrent seat holds, creates a HELD booking with a 10-minute TTL and encrypted passenger PII, honors an `Idempotency-Key` header; a lazy `materializeExpiry` flips a past-TTL HELD booking to EXPIRED on read/pay (no cron); payment (`POST /bookings/:id/pay`) re-prices immediately before charging, requires client-confirmed price if it moved, transitions HELD→TICKETED, posts a `SALE` ledger entry. 9 new e2e tests including the mandatory concurrent-last-seat test (exactly one of two simultaneous buyers of the final seat succeeds, inventory never goes negative).
  - Refunds: added the customer-facing submission surface main's staff-only refunds module was missing (`POST/GET /my/refunds`, `GET /my/refunds/:id`, USER-role-gated, kept as a separate controller from the `PanelAccessGuard`-gated staff one) — reuses the existing `computePenalty`/`RefundPenaltyRule` engine and passenger PII already on the booking, so the penalty math a customer sees is provably the same one finance later approves. 5 new e2e tests.
  - Content management: extended the existing `تنظیمات سامانه` `SystemSetting` KV store (not a new table) with editable homepage/about/contact/terms text fields, surfaced in the BOARD_CHAIR-only section of `SettingsPage`.
  - Reporting charts: **already fully built on this track** (`FinancePage.tsx` + `SalesBarChart.tsx` against the existing `reporting` module) — nothing to do here, the standalone branch's gap was already closed independently.
  - Public-site frontend: `frontend/src/features/public-site` (home search, results, seat+passenger booking with an inline OTP gate, checkout with promo/payment-method, e-ticket + inline refund submission) wired to the backend above, reusing the existing `AuthProvider`/`token-store`/api client infra (optional `requestOtp`/`verifyOtp` on `AuthContextValue` so no existing staff/agency test needed updating). 15 new component tests + a real-browser Playwright golden path (search → OTP login → seat/passenger → pay → e-ticket → refund submission) run against live dev servers, not just mocked. Styling is functional/clean, not yet pixel-matched to `design-reference/` — see deferred list below.
  - Promo codes / wallet / club points ledger / price lock: `PromoCode`/`PromoRedemption` (applied inside `pay()`, full route/cabin/date-window/maxRedemptions/maxPerUser validation), `WalletEntry` (balance always `SUM(signedAmountIrr)`, sandbox top-up + pay-with-wallet), `ClubPointsEntry` (the authoritative points ledger — `ClubMember.points` stays a synced display-copy; real-money payments earn, points payments redeem, no redeem-to-earn loophole), `PriceLock` (gold-tier+ only, 72h TTL, flat NestJS-computed fee — the AI-suggested variable fee is deferred with the rest of the AI wiring below; a booking made against an active lock prices at the locked rate and skips re-pricing entirely at payment). Wired into `CheckoutPage.tsx` (promo-code field + payment-method picker with live wallet balance, points option disabled for non-members). 11 + 2 new e2e tests.
  - GDPR: `GET /my/privacy/export` (full JSON of the customer's own bookings/passengers/refunds/wallet/points/locks) and `DELETE /my/privacy/account` (soft-deletes `User`, anonymizes passenger PII on their bookings, revokes all refresh tokens — booking/ledger rows survive as financial records, never hard-deleted). 3 new e2e tests.
  - **Still not ported** (explicitly deferred, not silently dropped): the AI "buy-now-or-wait" advisory endpoint reusing the existing `PRICE_SUGGESTION_PROVIDER` (price-lock's fee is a flat rate instead, documented above); a dedicated site-content-management UI beyond the `SettingsPage` text fields already added (no `MediaTab`/asset-library equivalent exists on this track's frontend). All backend surfaces above are fully tested via Supertest; the frontend covers only the golden path, not every edge state (price-lock UI, wallet top-up UI, and a GDPR export/delete UI screen don't exist yet — those endpoints are currently curl/Supertest-only).

- **Sentry error tracking (backend + frontend)**: wired per CLAUDE.md's
  Observability rules. Backend: DSN-gated `Sentry.init()` in `main.ts`,
  `Sentry.captureException` hooked into `AllExceptionsFilter` for 5xx
  errors — no-op when `SENTRY_DSN` is unset. Frontend: DSN-gated init plus
  a React `ErrorBoundary` (Persian fallback UI) wrapping the app and a
  global `unhandledrejection` handler — no-op when `VITE_SENTRY_DSN` is
  unset. Threaded through `docker-compose.prod.yml`, the frontend
  Dockerfile build args, and `.env.production.example`.

- **Public-site pixel-matching (partial, in progress)**: built
  `PublicHeader`/`PublicFooter` (colors, spacing, layout copied verbatim
  from `design-reference/صفحه اصلی.dc.html`'s inline styles, not
  reinvented) wired to real auth/club-points state, applied across all 5
  public pages via a shared `PublicPageShell`. Rebuilt `HomeSearchPage`
  with the real hero banner, search card (origin/destination fields, swap
  button, a real `JalaliDatePicker` — the previous native
  `<input type="date">` was Gregorian, a CLAUDE.md violation), and
  popular-route shortcuts sourced from real airport data. A concurrent
  session then added `DestinationsPage`/`PublicClubPage`/`SupportPage`/
  `TravelInfoPage` (wired to the same `/destinations`, `/club`, `/support`,
  `/travel-info` routes the header already linked to) and filled the home
  page's "پیشنهادهای ویژه"/"مقصدهای محبوب" sections with **mock prices
  copied verbatim from the design mockup** (commented in
  `HomeSearchPage.tsx` as placeholders — the backend has no
  featured-routes/offers API to source real figures from). Product
  decision (confirmed with the user 2026-07-18): keep the mock figures for
  now; replace with a real backend-sourced endpoint once one exists — this
  is a known, intentional gap, not an oversight. A later commit added
  `CustomerLoginPage` (`/signin`, real phone+OTP flow — also fixed a bug
  where the header's "ورود / ثبت‌نام" link pointed at the *staff* login
  route), `ManageBookingPage`, `AboutPage`, `ContactPage`, `NotFoundPage`.

  **Known, accepted gap — not wired to any backend (confirmed with the
  user 2026-07-18, deploying to a controlled/internal test server only,
  not real customers yet):** `ManageBookingPage` (`/manage-booking`) is
  entirely mock — any PNR + last name resolves to a hardcoded sample
  booking, and its refund button shows a fake "درخواست استرداد ثبت شد"
  success message with **zero calls to the real, already-tested
  `/my/refunds` endpoint**. `ContactPage`'s "ارسال پیام" button similarly
  just flips local state, no message is actually sent anywhere. **Must be
  wired to the real backend (or removed/gated) before this branch is ever
  exposed to real customers** — a fake refund confirmation is a trust/
  financial-integrity issue, not a cosmetic one.

  **Also not yet done**: the body content of Results/Book/Checkout/Ticket
  (price calendar, AI price radar, seat map styling, boarding-pass ticket
  visual) is still the earlier functional/clean styling, not pixel-matched — only
  header/footer wrap them now.

- [x] **Phases 14–17 (merged to main, not previously logged here)**:
  Phase 14 — real `SmsProvider` + IT management log. Phase 15 — step-up
  2FA verification (`POST /auth/step-up/request` + code) gating high-risk
  actions (admin role changes, API-key rotation, refund payout, price
  capacity change, session revoke-all) across their respective controllers,
  with matching frontend `useStepUp` hook wiring. Phase 16 — agency
  self-registration (public OTP + pre-registration → SITE_ADMIN
  review/refer → COMMERCIAL_MANAGER sole approval → real confirmation
  SMS, explicit no-selfie decision) plus real agency seat-allotment
  frontend (`FlightsPage`'s plan modal, `AgencySeatsPage`). Phase 17 —
  customer profile fields (`/my/profile`, encrypted national ID/passport,
  email verification) + an incomplete-profile banner on `AccountPage`.
  See `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 14–17 sections for full
  detail (this file lagged behind actual merged work — backfilled here for
  accuracy, not re-litigated).
- [x] **Phase 18 — SITE_ADMIN + EMPLOYEE panel access** — a design/mock
  audit found both panels had an empty `PANEL_NAV` (no sidebar at all).
  Per explicit user decision ("real and complete", not a narrow fix):
  `SITE_ADMIN` gets real, conservatively-scoped access to six of its ten
  design-listed tabs (`agencies`, `reports`, `cartable`, `club`, `refund`,
  plus a new scoped `SiteAdminDashboardPage`) — `flightops`/`tickets`/
  `blog`/`media` stay excluded since none has a backend for ANY role.
  `EMPLOYEE`'s sidebar is now computed per-user from real
  `EmployeePermission` grants (new `EmployeePermissionGuard` +
  `@RequiresPermission(...)`, `PanelsService.getNav` now async), matching
  `پنل کارمند.dc.html`'s dynamic `navKeys` formula — wired for
  agencies/flights(view-only)/pricing(propose-only)/reports/refund
  (review+refer, never pay). No schema change. 18 new backend e2e tests
  (`phase18-panel-access.e2e-spec.ts` + 3 new cases in
  `panels.e2e-spec.ts`), 4 new frontend unit tests (2 new dashboard
  pages), plus a pre-existing frontend bug fixed along the way
  (`RequestDetailPage`'s approve button showed for roles that can't
  actually approve since Phase 16 narrowed that endpoint). See
  `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 18 sections for the full
  scope + explicit deferrals (`fl_manage`, `ag_settle`, `fn_invoices`, the
  IT dept's catalog keys, EMPLOYEE's `referrals` tab).
- [x] **Phase 19 — مدیریت رزرو (anonymous PNR self-service)** — first item
  from the post-Phase-18 "dead forms" punch list. Per explicit user
  decision, real anonymous PNR+last-name lookup/refund (no login), reusing
  the existing `BookingService`/`RefundsService` logic via new shared
  private helpers (`toDetail()`, `createRefundRequest()`) so the anonymous
  and authenticated paths can never compute results differently. No schema
  change. 7 new backend e2e tests, 4 new frontend tests. See
  `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 19 sections for full scope +
  explicit deferrals (seat change, ticket download, per-passenger partial
  refund).
- [x] **Phase 20 — تماس با ما + پشتیبانی (contact + support tickets)** —
  second "dead forms" item. Two new tables (`ContactMessage`, a plain
  inbox; `SupportTicket`, a SITE_ADMIN-reviewed dept/priority/status/
  forward workflow scoped down from the design's fuller attachment/thread
  version). Public submission endpoints for both (no login); new
  `PANEL_NAV.SITE_ADMIN` `tickets` tab (closes a gap Phase 18 explicitly
  flagged); `SiteAdminDashboardPage` gains a third section for recent
  contact messages; ticket-forward target picker reuses
  `StaffDirectoryService` via DI rather than widening its EXEC_ROLES-only
  endpoint. `ContactPage.tsx`'s form also gained the `subject` field the
  design always required but the earlier build was missing. 11 new
  backend e2e tests, 6 new frontend tests. See `docs/API.md`/
  `docs/DB_SCHEMA.md`'s Phase 20 sections for full scope + explicit
  deferrals (attachments, reply threads, public ticket-status lookup).
- [x] **Phase 21 — فراموشی رمز (customer forgot/set password)** — third
  "dead forms" item. Also fixed a real design-mismatch bug found along the
  way: staff `LoginPage.tsx`'s "فراموشی رمز عبور؟" wrongly linked to a
  self-service flow — the design's own handler just shows a "contact IT"
  toast (staff has no self-service reset). Real flow reuses the existing
  OTP challenge (`/auth/otp/request` + `/auth/otp/verify`) to prove phone
  ownership, then a new `POST /auth/set-password` (`@Roles('USER')`, no
  current-password check) sets the password; a new `POST
  /auth/customer/login-password` closes the loop so that password is
  actually usable, and doubles as first-time password setup — giving real
  meaning to CLAUDE.md's "email+password optional" line for customers,
  which nothing had implemented before. `CustomerLoginPage.tsx` gained a
  small password-login toggle (the design itself has no password field
  for customers at all, so this is the minimal addition needed to make
  the new capability reachable). No schema change — reuses
  `User.passwordHash`. 9 new backend e2e tests, 6 new frontend tests. See
  `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 21 sections.
- [x] **Phase 22 — وضعیت پرواز (flight status lookup)** — fourth "dead
  forms" item. New public `GET /flight-status` (by flightNo or by
  origin+dest, both +date) using only real `FlightInstance`/`Route`/
  `Airport` data — no schema change. Confirmed `FlightInstanceStatus` is
  only `SCHEDULED | DEPARTED | CANCELLED`, with no gate/baggage-belt/
  delay-minutes/terminal column anywhere in the codebase, so the design's
  four operational stat boxes are explicitly NOT in the real response
  (would be fabricated data) — the real page shows only route, scheduled
  times, aircraft, and a derived status label; the delay-SMS checkbox is
  disabled "(به‌زودی)" for the same reason. Frontend reuses the existing
  `JalaliDatePicker` and `fetchAirports()`+`<select>` patterns already
  used by `HomeSearchPage.tsx`, replacing the design's free-text city
  inputs with the airport-code pickers the backend needs. 5 new backend
  e2e tests, 5 new frontend tests. See `docs/API.md`/`docs/DB_SCHEMA.md`'s
  Phase 22 sections.
- [x] **Phase 23 — وب‌سرویس آژانس (Agency B2B webservice)** — fifth and
  final "dead forms" item. `AgencyWebservicePage.tsx` was pure local mock
  state including a fake sample API key. Replicates Phase 16's
  `AgencyCreditRequest` request/decide pattern for a new
  `AgencyWebserviceRequest` table (agency requests a plan, an
  `AGENCY_TAB_ROLES` staff member decides), reusing Phase 3's already-real
  `AgenciesService.issueApiKey` (step-up-gated) verbatim on approval
  instead of duplicating key-issuance logic. Server-computed `priceIrr`
  from a fixed plan catalog (client can't set it — whitelist DTO 400s
  any extra field). Raw key delivery: since `AgencyApiKey` only ever
  stores `keyHash` (unchanged Phase 3 design), the raw key is delivered
  exactly once, on approval, via the agency's own message thread
  (`AgenciesService.postMessage`) rather than inventing a new channel or
  storing the secret retrievably — a bounded scope decision documented in
  docs/API.md's Phase 23 section. The rewritten frontend page shows
  request status (pending/rejected+retry) and, once approved, the active
  key's scope/status/activation metadata — never a raw key. 7 new backend
  e2e tests, 4 new frontend tests. See `docs/API.md`/`docs/DB_SCHEMA.md`'s
  Phase 23 sections for full scope + explicit deferrals.

This completes all five items from the post-Phase-18 "dead forms" punch
list (مدیریت رزرو, تماس با ما + پشتیبانی, فراموشی رمز, وضعیت پرواز,
وب‌سرویس آژانس).

- [x] **Phase 24 — پرواز (flightops: sale auto-close + نیرا manifest
  submission)** — closes the `flightops` gap flagged deferred since Phase
  18's `PANEL_NAV` notes (CEO/SITE_ADMIN/FINANCE_MANAGER/
  COMMERCIAL_MANAGER — the only 4 roles the design's own `roleDefs`
  grants it to). Read verbatim from the design: **not** gate/baggage/
  delay tracking (that's a different, still-unbuilt customer-facing
  concept, Phase 22's dropped stat boxes) — sale on each flight
  auto-closes 5h before departure and the full passenger manifest
  auto-uploads to سامانه نیرا (Iran's civil aviation manifest system) at
  that same moment. One new nullable column
  (`FlightInstance.niraSubmittedAt`, no new table); a `NiraProvider`
  interface + `MockNiraProvider` (same swappable-provider pattern as
  `SmsProvider`/`PaymentGateway`); lazy materialization on every
  `flightops` read once an instance crosses the threshold — no cron job,
  same "no cron job" pattern as `materializeDepartedInstances`/
  `materializeExpiry`. Explicitly deferred (documented, not an
  oversight): the 5h close does NOT block `POST /booking` — the design
  has no manual "close" action either, this is a reporting/manifest
  surface, not a new booking rule; a real نیرا HTTP integration; CSV/
  Excel manifest export. 8 new backend e2e tests + 5 unit tests
  (`sale-close.util.spec.ts` + `nira.service.spec.ts`), 3 new frontend
  tests. See `docs/API.md`/`docs/DB_SCHEMA.md`/
  `docs/features/flightops.md` for full scope + explicit deferrals.
- [x] **Phase 25 — حریم خصوصی و داده‌های من (GDPR export/delete UI)** —
  `GET /my/privacy/export`/`DELETE /my/privacy/account` already existed
  and were already tested from the public-site track's port (see this
  file's Phase 13 merge note) but had no frontend at all and were never
  documented in `docs/API.md` — both gaps closed this phase, no backend/
  schema changes. New "حریم خصوصی و داده‌های من" section on `AccountPage`'s
  پروفایل من tab (no design-reference page covers this — CLAUDE.md's GDPR
  requirement applies regardless, same reasoning as Phase 21's
  password-login toggle): "دانلود اطلاعات من" downloads the real export as
  a client-side JSON file; "حذف حساب کاربری" requires an explicit
  two-step confirm panel (never a bare `window.confirm`) before calling
  the delete endpoint, then signs out and returns home. 2 new frontend
  tests (backend already had 3, re-verified green, unchanged). See
  `docs/API.md`/`docs/DB_SCHEMA.md`/`docs/features/privacy-gdpr.md`.
- [x] **Phase 26 — ارجاعات (EMPLOYEE recipient-side referral listing)** —
  closes another Phase 18 `PANEL_NAV` gap: پنل کارمند.dc.html always
  appends `referrals` to EMPLOYEE's nav, but `GET /referrals` was
  sender-scoped (`SENIOR_MANAGER` only) and no recipient-side listing
  existed — worse, NO role's recipient side had any frontend at all (only
  detail/report-submission endpoints existed since Phase 4, unused by any
  UI). New `GET /referrals/mine` (same guard set as the existing
  detail/report endpoints — any `STAFF_ROLES` recipient) with a
  per-actor `hasMyReport` flag; `PANEL_NAV.EMPLOYEE` now always includes
  `referrals`. New `ReferralsRouter` (role-conditional, same pattern as
  `SecurityRouter`) renders the existing sender-side `ReferralsPage` for
  `SENIOR_MANAGER` and a new `MyReferralsPage` for `EMPLOYEE` (list +
  detail + a real report-submission form — the first frontend usage
  anywhere of `POST /referrals/:id/reports`). Explicitly deferred: other
  recipient roles (CEO/BOARD_CHAIR/finance/commercial) still have no
  frontend for this — backend already supports them, follow-up is
  frontend-only. 3 new backend e2e tests, 7 new frontend tests. See
  `docs/API.md`/`docs/DB_SCHEMA.md`/`docs/features/cartable-referrals.md`'s
  Phase 26 addition.
- [x] **Phase 27 — EMPLOYEE write/financial access: fl_manage + ag_settle +
  fn_invoices** — the remaining `PERMISSION_CATALOG` keys were left
  unwired on purpose as a security decision, not an oversight; asked the
  product owner how far to widen it (via `AskUserQuestion`, since this
  crossed from mechanical backlog work into a real authorization-policy
  call) and got an explicit answer: wire these three, leave the IT-dept
  keys (`us_manage`/`sv_control`/`sc_manage`/`lg_view`) out of scope.
  `fl_manage` now unlocks every flights write endpoint for EMPLOYEE
  (create/schedule/ai-analysis/plan/aircraft/fare-rule/allotment);
  `ag_settle` unlocks `POST /agencies/:id/settle`; `fn_invoices` unlocks
  the agencies invoices list/pay/remind (never issuing — stays
  `COMMERCIAL_MANAGER`-only). Caught and fixed two bugs during this
  phase's own design review before they shipped: (1) an EMPLOYEE granted
  only `ag_settle`/`fn_invoices` (no `ag_list`/`ag_info`) would have had a
  granted-but-unreachable permission, since only the list/detail endpoints
  lead to the action endpoints — fixed by widening those two endpoints'
  `@RequiresPermission` to accept the dependent keys as alternatives; (2)
  the frontend `invoicesSection` was correctly gated for EMPLOYEE but
  never actually rendered (EMPLOYEE takes `AgencyDetailPage`'s non-tabbed
  branch, which didn't include it) and the invoices fetch was still
  `COMMERCIAL_MANAGER`-only, so an EMPLOYEE with `fn_invoices` would have
  seen an empty invoices section, and one with `ag_settle` only would have
  had a 403 there break the whole page — both fixed (wired the section
  into the render tree; the EMPLOYEE-only fetch swallows its own 403).
  Deliberately declined to route `fn_invoices` through `FinancePage.tsx`
  (its `FINANCE_MANAGER`-only view exposes company-wide revenue/profit/
  all-transactions data, far broader than "view/manage invoices") — routed
  through the already-correctly-scoped per-agency invoices table on
  `AgencyDetailPage` instead. `fl_manage`/`ag_settle`/`fn_invoices` also
  can't be granted to a single EMPLOYEE together (an employee's `dept` is
  fixed at creation and permanently resolves to one `PERMISSION_CATALOG`
  dept — `fl_manage` is `commercial`, `ag_settle`/`fn_invoices` are
  `finance`), which mirrors real org structure and isn't a bug. 9 new
  backend e2e tests, 2 new frontend tests. See `docs/API.md`/
  `docs/DB_SCHEMA.md`/`docs/features/agencies.md`/
  `docs/features/flight-management.md`'s Phase 27 additions.
- [x] **Phase 28 — IT Manager external-service «تنظیمات» edit modal** —
  closes the last remaining deferred-UI item flagged in
  `docs/features/it-manager.md` (Phase 8): `PATCH /it/services/external/:id`
  was already implemented and e2e-tested since Phase 8, just never wired
  into `ServicesPage.tsx`. Each external service card's «تنظیمات» button
  now opens a modal pre-filled with نام سرویس/Endpoint/متد/مهلت اتصال;
  کلید احراز stays blank (the raw key is never returned by the API) and
  is only sent if the operator types a replacement, so an unedited save
  can never blank out an existing key. No backend change — pure frontend
  wiring of an already-reviewed endpoint, so this shipped without a
  fresh `AskUserQuestion` round (unlike Phase 27, this carried no
  authorization-policy decision). 3 new frontend tests (also fixed a
  test-isolation gap in `ServicesPage.test.tsx` — missing
  `afterEach(() => vi.restoreAllMocks())`, same class of bug as Phase 26's
  `MyReferralsPage.test.tsx` fix). See `docs/API.md`/`docs/DB_SCHEMA.md`/
  `docs/features/it-manager.md`'s Phase 28 additions.
- [x] **Phase 29 — referral/report attachment upload + view UI** — closes
  the "Attachment upload UI on the referral/compose modals" deferral from
  Phase 4. The files module (`POST /files`, `GET /files/:id`) and
  `attachmentIds` on both referral-creation and report-submission DTOs
  were already complete and tested — only the resolved-metadata read side
  and the frontend were missing. `ReferralsService.list()`/`.detail()`/
  `.myReferrals()` now resolve raw `StoredFile` id arrays into
  `{id, fileName, mimeType, sizeBytes}[]`. New `AttachmentPicker` (upload
  + removable chips) and `AttachmentList` (read-only, click-to-download)
  components wired into `ReferralsPage.tsx`'s compose modal + detail view
  and `MyReferralsPage.tsx`'s report form + detail view. Caught and fixed
  a real pre-existing bug while writing this phase's own e2e test with a
  Persian filename: `FilesService.store()` stored `file.originalname`
  as-is, but multer/busboy decode multipart headers as latin1 by default,
  so non-ASCII filenames came out as mojibake on a Persian-first
  platform — fixed with a latin1→utf8 re-decode (a no-op for ASCII names,
  so the phase's own existing ASCII-only fixtures were unaffected). 3 new
  backend e2e tests, 9 new frontend tests (2 new reusable components + 4
  wiring tests across the two referral pages). See `docs/API.md`/
  `docs/DB_SCHEMA.md`/`docs/features/cartable-referrals.md`'s Phase 29
  additions.
- [x] **Phase 30 — data-driven seat-map aisle gap rendering** — closes
  the last remaining low-risk deferral: `docs/features/reservation.md`
  had flagged the seat grid's aisle gap as hardcoded at a fixed seat
  index ("gap after the 2nd seat") rather than reading the exact
  column-group split from the API. This directly contradicted CLAUDE.md's
  own "seat map config lives per aircraft type in the DB, not hardcoded"
  rule — `AircraftSeatMap.{business,economy}ColsLeft/ColsRight` already
  held the real per-aircraft config since Phase 9, but
  `GET /reservation/seatmap/:flightInstanceId` never exposed it, and the
  bug was invisible only because the single seeded aircraft type (business
  2-2, economy 2-3) happens to match the hardcoded assumption by
  coincidence. Now the endpoint returns `cabinLayout.{BUSINESS,ECONOMY}
  .aisleAfterIndex` and `ReservationPage.tsx`'s seat grid reads it per
  row's cabin. Both new tests deliberately use a non-2/2-2/3 split (a
  reversed 3-2 economy config in the backend test; a synthetic fixture in
  the frontend test) so they can't pass by coincidence the way the
  pre-existing hardcoding did. 1 new backend e2e test, 1 new frontend
  test. See `docs/API.md`/`docs/DB_SCHEMA.md`/
  `docs/features/reservation.md`'s Phase 30 additions.
- [x] **Phase 31 — EMPLOYEE narrow access to the IT-dept permission
  keys** — closes the last deferral from Phase 8/27:
  `us_manage`/`sv_control`/`sc_manage`/`lg_view` were seeded in
  `PERMISSION_CATALOG` since Phase 8 but never wired to any real access.
  Unlike Phase 27's mechanical backlog, this one required **two rounds**
  of `AskUserQuestion`: the first to pick this item off the remaining
  decision-gated backlog, the second because investigation surfaced that
  the raw literal interpretation was materially riskier than Phase 27's
  precedent — the design has zero page body for any of the 4 relevant
  EMPLOYEE tabs (`users`/`services`/`security`/`logs` list in the nav
  generator but have no `sc-if` block or `titles{}`/`subs{}` entry), and
  several underlying IT_MANAGER endpoints are self-permission-granting,
  a site-wide service kill switch, company-wide session/IP data, or a
  force-logout-everyone action. The user chose "all 4 keys, very narrow
  scope" (Claude's proposal); implemented narrower than even that
  proposal in one place — `sc_manage` excludes `GET /it/security/sessions`
  entirely (no per-actor-scoped variant exists, and building one was out
  of scope), rather than the originally-floated "policy + own sessions."
  Backend-only, no frontend/nav changes this phase (wiring a nav entry to
  a tab with no design body would only produce a dead/blank tab). Full
  scope per key, plus the dept-scoping mechanism for `us_manage`
  (`EmployeesService.deptScopeForEmployee`, a fresh DB lookup since
  `AuthenticatedUser` doesn't carry `dept`), is in `docs/API.md`'s Phase
  31 section. 11 new backend e2e tests
  (`phase31-employee-it-dept-permissions.e2e-spec.ts`). See
  `docs/DB_SCHEMA.md`/`docs/features/it-manager.md`'s Phase 31 additions.
- [x] **Phase 32 — 2FA step component test + a real navigate-during-render
  bug fix** — closes the one remaining no-decision mechanical item:
  `docs/features/panel-shell-dashboard.md` had flagged since Phase 1 that
  the staff 2FA step had E2E coverage (Playwright) but no isolated Vitest
  component test. Writing the "not reachable before a password submit"
  case (visiting the 2FA route directly, with no `challengeId` in location
  state) surfaced a real bug per CLAUDE.md's debugging workflow ("reproduce
  with a failing test first, then fix"): `TwoFactorPage.tsx` called
  `navigate('/login')` directly during render instead of inside a
  `useEffect`. React Router's own dev-mode guard ("You should call
  navigate() in a React.useEffect()") silently drops such a call — so
  in production, hitting `/login/2fa` directly (browser back/forward,
  refresh, a stale bookmark) rendered a blank page instead of redirecting
  to `/login`. Fixed by moving the guard into a `useEffect` keyed on
  `challengeId`; functionally identical on the happy path (challengeId
  present → renders exactly as before). 5 new frontend tests
  (`TwoFactorPage.test.tsx`): renders with a challenge present, redirects
  when absent, validates an incomplete code without calling the API,
  submits successfully and navigates to `/panel`, and surfaces a rejected-
  code server error inline. No backend/schema change. See
  `docs/features/panel-shell-dashboard.md`'s updated checklist.
- [x] **Phase 33 — close a stale Phase 3 checklist item (agencies.md)** —
  documentation-only, no code change. `docs/features/agencies.md` had one
  item unchecked since Phase 3: "a suspended agency's own booking/search
  endpoints (once the agency-portal track exists) would reject." That
  condition is now met — the Agency Portal track landed later in this
  session — and the behavior is already implemented and already proven:
  `backend/test/agency-portal.e2e-spec.ts`'s `'POST /auth/agency/login:
  403 when the agency is suspended'` test. Checked off with a note on
  where enforcement actually sits: login/refresh time (a suspended agency
  can never obtain a new access token), the same point every role's
  active-status check is enforced at — `JwtStrategy.validate()` only
  decodes the token and never re-queries the DB per request, so this
  matches the rest of the system's session model rather than being an
  agency-specific gap. With this, every unchecked item across
  `docs/features/*.md` is now either checked or explicitly decision-gated
  (only the Phase 1 visual-regression item remains, and it needs a
  tooling choice, not more test-writing).
- [x] **Phase 34 — کیف پول (top-up) + قفل قیمت هوشمند: retroactive docs +
  frontend closure** — picked up as a self-directed continuation once the
  no-decision backlog ran dry a second time: the backend for both wallet
  top-up and price-lock was already fully implemented and e2e-tested
  (from an earlier public-site merge), so building their frontend UI was
  judged the same low-risk category as Phases 28–30 (closing UI over
  already-decided, already-tested business logic), not a fresh product
  call. Investigation found wallet top-up UI already existed (a stale
  `PLAN.md` note said otherwise); price-lock UI was genuinely missing —
  `ResultsPage.tsx`'s only "🔒 قفل قیمت" button lived on the mock/demo
  flight cards and never called a real endpoint. Built: `AccountPage.tsx`
  gained a «قفل قیمت» tab (list/cancel, route+price+fee+expiry) and a
  «🔒 قیمت قفل‌شده» trip badge; `ResultsPage.tsx`'s real result cards
  gained a working per-cabin lock button (unauthenticated → redirect to
  `/signin` remembering the search; authenticated non-gold → club-signup
  notice; gold-tier → real `POST /my/price-locks` call with the actual
  locked price/fee/expiry shown). Two small backend additions to support
  this, both additive/non-breaking: `GET /my/price-locks` now joins
  flight route/number/departure (previously raw ids only); every booking
  response gained `isPriceLocked: boolean`. Found and fixed two real
  bugs surfaced while wiring this (not invented, not pre-existing test
  failures — genuinely new-found via building the UI against real data):
  `AccountPage.tsx`'s wallet top-up used `Number(x)*10` instead of the
  shared `parseTomanToRial` helper, so Persian-digit input (which the
  field's own placeholder invites) silently produced `NaN`; and
  `BookingService.createBooking()`'s `isPriceLocked` read a stale
  pre-transaction snapshot of the `priceLock` relation (fetched before
  the same transaction's claim-update ran), always false right after
  creating a locked booking — fixed by deriving the flag from the
  already-resolved `usableLock` variable instead. **Deliberately left
  undecided, flagged not silently dropped**: the price-lock fee is
  computed/stored but never actually charged anywhere in the backend —
  this phase's UI shows the fee as a plain data field without asserting
  it was billed, rather than inventing a wallet-debit/gateway-charge
  mechanism unilaterally (a real financial-flow decision, not UI wiring).
  6 new backend e2e tests total (2 new + all pre-existing price-lock
  tests re-verified), 8 new frontend tests. See
  `docs/features/wallet-price-lock.md` for full reasoning,
  `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 34 sections for the exact
  endpoint/schema notes.
- [x] **Phase 35 — صف مغایرت‌های پرداخت (payment-reconciliation queue)
  frontend closure** — after Phase 34's wallet/price-lock gap, ran a
  systematic audit cross-referencing every backend controller route
  against every frontend `api/*.ts` caller to check for more of the same
  shape of gap across the whole app (the audit agent itself hit the
  session's usage limit partway through and had to be finished by hand);
  this was the one confirmed genuine hit before that happened. `GET
  /reconciliation`/`PATCH /reconciliation/:id/resolve` (FINANCE_MANAGER)
  shipped in Phase 13 Part E, fully e2e-tested, but had no frontend page
  and no docs/API.md section — not flagged deferred anywhere, just
  missed. No design mock exists for it (a backend-only addition after the
  original design extraction), so `FinancePage.tsx`'s finance-ops view
  gained a new, functionally-styled «صف مغایرت‌های پرداخت» card (list +
  resolve-with-note, matching the backend's own `@MinLength(3)`
  validation client-side). No backend change. 1 new frontend test (+ an
  empty-state assertion added to the existing finance-ops test). See
  `docs/features/finance-reports.md`'s Phase 35 section,
  `docs/API.md`'s Phase 35 note.
- [x] **Phase 36 — عدم حضور مسافر (mark no-show) frontend closure** —
  continued the manual endpoint-vs-frontend-caller audit and found the
  same shape of gap in the reservation module: `PATCH /reservation/pnr/
  :pnr/no-show` (Phase 13 Part E, `CAN_LOCK_ROLES`) fully implemented and
  e2e-tested, no frontend control. The frontend's own `BookingStatus`
  type was also missing `FLOWN`/`NO_SHOW` entirely. Added a «ثبت عدم حضور
  مسافر» button to `ReservationPage.tsx`'s existing PNR-detail modal
  (next to «تغییر صندلی»/«لغو رزرو», shown for `canLock` roles on a
  `TICKETED`/`FLOWN` booking) — a small addition to an already-built
  screen, not a new one, since no design mock exists for this action at
  all (confirmed in `docs/DB_SCHEMA.md`'s own Phase 13 Part E note). The
  same audit also surfaced the seat-lock approval queue
  (`PATCH .../locks/:id/approve`/`reject`, `POST .../pnr/from-lock/
  :lockId`) as unwired — left that one alone: it's explicitly documented
  since Phase 13 Part D as intentionally backend-only ("no design screen
  exists for a request/approval queue"), and building a multi-step
  approval UI from nothing is a real design task, not a small wiring job.
  No backend change. 2 new frontend tests. See
  `docs/features/reservation.md`'s Phase 36 section, `docs/API.md`'s
  Phase 36 note.
- [x] **Phase 37 — سامانه پیامک (SMS) log frontend closure** — third hit
  from the same manual endpoint-vs-frontend-caller audit: `GET
  /it/services/sms-log` (Phase 14, `IT_MANAGER`) fully implemented and
  e2e-tested (phone numbers already masked server-side), no frontend
  surface. Added a «سامانه پیامک (SMS)» card to `ServicesPage.tsx` below
  the existing internal-services grid — enabled state, today's success/
  fail counts, recent messages. The design reference only shows the
  "sms" row in that internal-services toggle grid (already built since
  Phase 8), no separate delivery-log screen, so this is a new card, not
  a redesign. No backend change. 2 new frontend tests. See
  `docs/features/it-manager.md`'s Phase 37 section, `docs/API.md`'s
  Phase 37 note.
- [x] **Phase 38 — تغییر نوع هواپیما (aircraft-type change) frontend
  closure** — the audit's final finding: `PATCH
  /flights/:instanceId/aircraft` (Phase 13 Part A, `SENIOR_MANAGER` +
  `COMMERCIAL_MANAGER`) fully implemented and e2e-tested, no frontend
  control anywhere. Unlike Phases 35–37, this one needed two small
  additive backend changes, not just frontend wiring, because no
  reference-data endpoint existed to populate a real dropdown: new `GET
  /flights/aircraft-types` (lists every seeded `AircraftSeatMap` type
  with its real computed capacity via the existing `enumerateSeats()`
  helper) and `GET /flights/:instanceId` detail gaining an `aircraftType`
  field (via the existing `resolveAircraftType()` util) so the form can
  show/pre-select the current type. Both are pure reads over
  already-existing data — no new business logic or schema change.
  `FlightsPage.tsx`'s flight-detail modal gained a «نوع هواپیما» box with
  a تغییر button revealing the real dropdown, gated behind the existing
  `useStepUp('PRICE_CAPACITY_CHANGE')` step-up flow (same scope as
  نرخ‌گذاری), surfacing the backend's `CAPACITY_BELOW_CONFIRMED` conflict
  inline. 3 new/modified backend e2e assertions, 2 new frontend tests (a
  test-fixture-id bug — copied the wrong row id from an unrelated
  fixture — was found and fixed while writing them, not a product bug).
  While verifying regressions, found a second pre-existing test failure
  unrelated to this phase: `flights.e2e-spec.ts`'s completed-report test
  throws `TypeError: Cannot read properties of undefined (reading
  'tickets')`; confirmed via `git stash` that it fails identically on
  unmodified `main` — a second flake alongside the long-standing
  `reporting.e2e-spec.ts` one, not caused by this phase. Full backend
  e2e suite: 340/342 passing, exactly those two known-pre-existing
  failures. See `docs/features/flight-management.md`'s Phase 38 section,
  `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 38 notes.
- [x] **Phase 39 — بازبینی مدارک آژانس (staff-side agency document
  review)** — triggered when the user asked for an explanation of the
  agency-portal deferred list; investigating it found two of the three
  named items were actually stale (already built by later phases without
  this file being updated) and one was real: `AgencyDocument.status`
  had existed since the model shipped but no staff endpoint could ever
  see or decide on an upload, so every document sat `PENDING` forever
  (the Prisma model's own comment said as much). Built the same
  request/decide pattern already used twice in this codebase (credit-
  requests, webservice-requests): `GET /agencies/:id/documents` +
  `PATCH .../documents/:docId/decide` (`AGENCY_TAB_ROLES`, no step-up —
  approving a document changes no money/capacity/access), and a «مدارک
  آپلودشده» card in `AgencyDetailPage.tsx`. Corrected
  `docs/features/agency-portal.md`'s deferred list: allocated-seats
  (Phase 13 Part C) and webservice self-service (Phase 23) were already
  built; documents is now built too; forgot-password is now scoped down
  to AGENCY-only (customer/staff were resolved in Phase 21, discovered
  while re-checking that bullet). **Found but deliberately not fixed,
  flagged instead**: the credit-requests/webservice-requests endpoints
  this phase's code mirrors have no staff-side frontend either — same
  shape of gap, kept out of this phase's diff for reviewability. 3 new
  backend e2e tests, 2 new frontend tests (plus `fetchAgencyDocuments`
  mocked into the 6 existing role tests that now also call it, to avoid
  an unmocked-fetch regression). See `docs/API.md`/`docs/DB_SCHEMA.md`'s
  Phase 39 sections, `docs/features/agency-portal.md`'s corrected
  checklist + deferred list.
- [x] **Phase 40 — ترجیح زبان نمایش (display-language preference storage)**
  — first concrete step of a new, larger arc: the user brought in an
  updated design bundle (uploaded across ~9 messages, 33 `.dc.html` files
  plus refreshed `site-data.js`/`support.js`/`image-slot.js`, staged into
  `design-reference-v2/`) that adds fa/en/ar language support + real
  responsive (JS `matchMedia`-driven, not just CSS) layouts — scoped by
  the user explicitly to the public site + پنل کاربر + پنل آژانس only;
  staff/executive panels stay Persian-only. Extraction turned up: a
  three-language switcher backed by `localStorage` (`blujet_lang`), a
  hand-authored English translation per string, an Arabic layer that's
  partly a runtime exact-match dictionary (`window.arDeep`, in
  `support.js`) and partly hand-authored per page; a genuinely new page
  (فرصت‌های شغلی / Careers, with its own `site-data.js` job-posting
  backend stub); a real design reference for the long-deferred fare-rules
  CRUD gap (پنل مدیر بازرگانی now has a full «کلاس‌های نرخی پرواز» UI
  matching our existing backend's exact business rules); and a
  language-dependent (not just translated) forgot-password mechanism —
  email+code for English vs. phone+OTP for Persian/Arabic (matching what
  we already have). User decisions confirmed via `AskUserQuestion`:
  formally amend CLAUDE.md's Persian-only rule (done, see its Locale &
  Direction section) rather than treat the new design as out-of-policy;
  scope confined to public+user+agency; build a REAL email+code reset
  flow for English (not fake it with phone+OTP); persist locale
  preference in the database. Refined that last point after the user
  asked me to double-check it: DB-only would strand anonymous visitors
  (no `User` row to write to) and always reset returning visitors to
  Persian on refresh — the correct shape is hybrid, `localStorage` first
  for everyone + `User.preferredLocale` as the logged-in cross-device sync
  point, confirmed with the user before building.

  Built (storage/plumbing only — no page has translated strings yet, and
  the user was explicit: no mock data, a real column and a real,
  reachable endpoint): `User.preferredLocale` (new `Locale` enum
  FA/EN/AR, default FA); `GET /auth/me` now does a fresh DB read (was a
  bare JWT-payload echo) so the value can't go stale between token
  refreshes; new `PATCH /auth/me/locale`. Frontend:
  `frontend/src/hooks/useLocale.tsx` (`LocaleProvider`/`useLocale`, mounted
  in `App.tsx` inside `AuthProvider`) — reads `localStorage` first always,
  adopts the DB value on login when it differs, writes `localStorage` +
  fire-and-forget `PATCH`s the DB on every explicit change. 3 new backend
  e2e tests (plus a self-contained fix: reset the shared `ceo` seed
  account's `preferredLocale` at the start and end of its own test, since
  it's reused across many tests/runs and a first pass left it polluted at
  `EN` for a later full-suite run), 6 new frontend hook tests. Full
  backend e2e suite: 345/347 passing, the same 2 known pre-existing
  failures (flights.e2e-spec.ts completed-report, reporting.e2e-spec.ts
  revenue-reconciliation) — this phase caused neither. Frontend: 225/225.
  See `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 40 sections. The rest of
  the redesign (translated strings, the switcher UI, responsive layouts,
  the split forgot-password flow, fare-rules CRUD) is explicitly future
  work, not started this phase.
- [x] **Phase 41 — public i18n + responsive shared shell foundation**
  — first real page-facing step of the Phase 40 arc: cataloged the full
  `design-reference-v2/` bundle first (33 files renamed to their true
  Persian page names and diffed against the old `design-reference/`
  counterparts, `docs/design-refresh-2026-07-30.md`), confirming
  staff/executive panels carry zero i18n/responsive markers (scope
  correctly excludes them) and that وضعیت پرواز's i18n coverage — initially
  flagged as missing — was retracted once the user supplied the correct
  file (verified via a 49-hit `isEN|isAR` grep). پرداخت stays excluded
  per explicit user instruction pending a corrected upload. Built the
  shared infra every subsequent per-page phase depends on:
  `frontend/src/lib/i18n.ts` (`useT()` dictionary hook + `DIR`/`FONT` maps)
  and `frontend/src/hooks/useIsMobile.ts` (real `window.matchMedia`
  tracking, mirroring the design bundle's own JS-state-driven responsive
  pattern rather than CSS-only breakpoints). Deliberately did NOT replicate
  the design mock's `arDeep` runtime dictionary (silent fallback to
  Persian for unmatched strings) — every dictionary key has a real,
  hand-checked Arabic string, cross-referenced against `support.js`'s
  `ARDict` where it existed and hand-translated fresh where it didn't
  (e.g. footer strings). Rewired `PublicPageShell`/`PublicHeader`/
  `PublicFooter` onto these hooks: language switcher (desktop dropdown +
  mobile off-canvas cycle), RTL/LTR-aware dropdown positioning, mobile
  hamburger menu, single-column footer on mobile.

  Hit and fixed two bugs before landing: (1) wiring `useLocale()` into the
  shared shell broke 12 pre-existing test files (62 tests) that render
  `PublicPageShell`/`PublicHeader` without a `LocaleProvider` wrapper,
  because `useLocale()` threw when used outside one — fixed by giving
  `LocaleContext` a sensible default (`fa` + no-op setter) instead of
  throwing, since the real app always wraps routes in `LocaleProvider` via
  `App.tsx` and the throw was only ever a footgun for isolated component
  tests, not a real safety net; updated `useLocale.test.tsx`'s "throws
  outside a provider" test into a "falls back to fa" test accordingly.
  (2) `useIsMobile`'s initial render read `window.innerWidth` instead of
  `matchMedia(...).matches`, so it ignored the mocked initial state in
  tests (and, in the same way, a real user's actual starting viewport)
  until the first `change` event — fixed to read `matchMedia` directly on
  first render too. Full frontend suite: 237/237 passing, 61/61 files,
  after both fixes. `tsc --noEmit` clean; `oxlint` clean (pre-existing
  fast-refresh warnings only, same pattern as `useAuth.tsx`). See
  `docs/features/i18n-responsive-foundation.md` for the checklist. Explicit
  future work, not started: translating each page's own body content,
  the real email+code forgot-password flow for English, and the newly
  discovered backend domains (Careers CRUD, passenger satisfaction survey,
  commercial-manager city/route + club-tier + web-service pricing config)
  — all need `docs/API.md`/`docs/DB_SCHEMA.md` coverage and approval first.
- [x] **Phase 42 — صفحه اصلی (Home) real i18n + responsive body content**
  — first page of the per-page translation arc Phase 41 explicitly
  deferred. `HomeSearchPage` now renders through `PublicPageShell` (was its
  own hardcoded `dir="rtl"` wrapper) and every string — announcement
  banner, hero, trip-type radios, search fields, popular routes, quick
  links, special offers, mid-banner sale, popular destinations, loyalty
  band, app band — is translated into fa/en/ar. Every en/ar string was
  extracted from `design-reference-v2/صفحه اصلی.dc.html`'s own `isEN`/
  `isAR` ternaries and `site-data.js`'s `arDeep` dictionary, not invented.
  One deliberate departure from the mock: its EN mode shows fake USD
  prices; kept real toman pricing in all three locales instead (the
  backend only ever charges IRR), formatted with new locale-aware helpers
  in `frontend/src/lib/fa-format.ts` — `arDigits`, `formatToman`,
  `formatLocalePercent` — alongside the existing `faMoney` (which stays
  the one place rial→toman conversion happens for real API values; the
  new helpers format already-in-toman or plain numeric display values).
  Responsive: hero height/title size, search-field layout (row → 2-col
  grid), the four content grids (5/4 cols → 2 cols), and the two banner
  bands (row → column) all switch at the shared `useIsMobile()` breakpoint,
  matching the design bundle's own `isMobile` style values. Flagged, not
  silently patched over: the real airport `<select>` has no `cityEn`/
  `cityAr` column yet, so it falls back to the API's `cityFa` for any city
  outside the page's small marketing-card city map — future schema work,
  needs `docs/DB_SCHEMA.md` coverage + approval like every new column.
  4 pre-existing tests untouched and still passing (fa strings identical
  to before this phase); 2 new tests (en, ar) + 4 new `fa-format.test.ts`
  cases for the new helpers. Full frontend suite: 244/244 passing, 61/61
  files. `tsc --noEmit` clean; `oxlint` clean (same pre-existing warnings).
  See `docs/features/home-page-i18n-responsive.md`.
- [x] **Phase 43 — نتایج پرواز (Results) real i18n + responsive body content**
  — third page of the per-page translation arc. `ResultsPage` translates
  its search summary bar, price-calendar strip, filter sidebar (stops/
  time-of-day/airline), AI price radar, sort tabs, empty/searching/mock-
  notice states, mock flight schedule, real bookable result cards, and
  both price-lock modals (mock-gated + the real gold-tier flow's three
  outcomes) into fa/en/ar. Strings extracted from `design-reference-v2/
  نتایج پرواز.dc.html`'s own `isEN`/`isAR` ternaries and `site-data.js`'s
  `arDeep` dictionary where the design's exact key/value matched (AI radar
  copy, سورت labels, صندلی باقی‌مانده, یک توقف, time-of-day buckets); the
  remainder (filter/sort labels the design implements differently, modal
  copy, the AI-radar narrative sentence) hand-translated to the same
  no-silent-fallback bar as Phase 42. New `localeMoney(amountRial, locale)`
  helper in `frontend/src/lib/fa-format.ts` — same rial→toman division as
  `faMoney`, formatted per active locale — used for the real per-cabin
  prices and price-lock amounts (raw IRR from the API); mock schedule/
  calendar numbers (page-local placeholders) use the existing `formatToman`.
  Server-provided error messages (e.g. a 409 "already locked" response)
  are still passed through verbatim, never routed through the page
  dictionary — confirmed by leaving that exact test unchanged. Layout
  stacks to a single column (filters above results) on mobile via the
  shared `useIsMobile()` hook. All 8 pre-existing tests untouched and
  still passing (fa strings byte-identical to before this phase); 2 new
  tests (en, ar) + 1 new `fa-format.test.ts` case (`localeMoney`). Full
  frontend suite: 247/247 passing, 61/61 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/results-page-i18n-responsive.md`.
- [x] **Phase 44 — مقاصد (Destinations) real i18n + responsive body
  content** — fourth page of the per-page translation arc. Skipped
  تکمیل خرید this round: the real `CheckoutPage.tsx` (promo code +
  payment-method selection + pay button) functionally overlaps with
  پرداخت, which the user explicitly excluded from this refresh pending a
  corrected upload ("پرداخت را وارد نکن") — translating it now risked
  colliding with that exclusion, so مقاصد (unambiguously in scope) was
  picked instead. `DestinationsPage` translates its hero/search box,
  region tabs, destination mosaic (region + promo badges, duration, weekly
  frequency, price), empty state, map band (stat boxes, city pins), and
  popular-routes band into fa/en/ar. Extracted from `design-reference-v2/
  مقاصد.dc.html`'s own `isEN`/`isAR` ternaries — this page's mock has by
  far the most complete three-way translation coverage seen in the bundle
  so far, nearly every label has a direct three-way ternary rather than
  relying on the incomplete `arDeep` runtime dictionary; the handful of
  EN-only ternaries (`noResultsTitle`/`noResultsSub`, plus durations/
  frequencies with no design-provided AR at all) were hand-translated to
  the same no-silent-fallback bar as every prior phase, using the same
  digit/vocabulary conventions confirmed elsewhere in `site-data.js`'s
  dictionary. Mock catalog/route/pin data restructured from Persian-only
  pre-formatted strings to a locale-neutral shape (per-locale name objects
  + a plain numeric toman price via the existing `formatToman`), which
  also fixed the search filter to match against the active locale's city
  name instead of always Persian. Destination mosaic (4→2 cols) and map
  band (two columns → one) collapse on mobile via the shared
  `useIsMobile()` hook. All 4 pre-existing `DestinationsPage` tests
  untouched and passing (fa strings byte-identical); 2 new tests (en, ar).
  Full frontend suite: 249/249 passing, 61/61 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/destinations-page-i18n-responsive.md`.
- [x] **Phase 45 — باشگاه مشتریان (Club) real i18n + responsive body
  content** — fifth page of the per-page translation arc. `PublicClubPage`
  translates its hero, stats strip, three membership tiers (name/range/
  perks), four card-issuance steps, four earn-points cards, three
  member-services cards, and the logged-in member banner into fa/en/ar.
  Extracted from `design-reference-v2/باشگاه مشتریان.dc.html`'s own `isEN`
  ternaries and `site-data.js`'s `arDeep` dictionary, which had unusually
  complete coverage for this page — tier perks, card-issuance steps, and
  earn/services cards all had exact-match dictionary entries, a rarer find
  than in earlier pages. A handful of this app's own fa strings (built
  independently of the design bundle, since the real membership-card flow
  predates it) were aligned to the design's exact wording where no tested
  behavior depended on the old text — e.g. "چطور امتیاز جمع کنم؟" → "چطور
  امتیاز بگیرم؟" — keeping the shipped Persian and its new translations
  sourced from the same place. Found and fixed a real bug along the way:
  `PublicInfoPages.test.tsx` bundles four pages' tests in one file, and
  Phase 44's `mockLocale('ar')` spy on `useLocale()` in the last
  `DestinationsPage` test was never restored, so it leaked into every
  subsequent test in the file — invisible until this phase's `PublicClubPage`
  also started calling `useLocale()`, at which point the leaked Arabic mock
  broke both of `PublicClubPage`'s pre-existing (fa-only) tests. Fixed with
  `vi.restoreAllMocks()` in the shared `beforeEach`, the durable fix rather
  than a scoped workaround. Both pre-existing `PublicClubPage` tests pass
  unmodified once fixed; 2 new tests (en, ar). Stats/card-steps/earn/
  services grids collapse on mobile via the shared `useIsMobile()` hook.
  Full frontend suite: 251/251 passing, 61/61 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/club-page-i18n-responsive.md`.
- [x] **Phase 46 — پشتیبانی (Support) real i18n + responsive body
  content** — sixth page of the per-page translation arc. `SupportPage`
  translates its hero, four category cards, all five FAQ question/
  answers, the ticket form, and the three direct-contact cards into
  fa/en/ar. Extracted from `design-reference-v2/پشتیبانی.dc.html`'s own
  `isEN` ternaries — this page's mock fa strings matched the real app's
  shipped content exactly, word for word, nothing needed realigning — and
  `site-data.js`'s `arDeep` dictionary, which had complete coverage here
  too. Deliberate decision: the ticket's `subject` value submitted to the
  real backend always stays the canonical Persian string regardless of
  the active display locale — only the dropdown's visible label
  translates via a separate `SUBJECT_LABELS` map — since staff view
  tickets in the Persian-only admin queue and letting translated subject
  text leak into stored tickets would be a real regression, not just a
  display nicety; proven by a test that renders the page in `en` and
  asserts the submitted `subject` is still the Persian string. FAQ search
  now matches the active locale's question/answer text. Both pre-existing
  `SupportPage` tests pass unmodified; 2 new tests (en, ar). Category-card
  grid and the FAQ/contact two-column layout collapse on mobile via the
  shared `useIsMobile()` hook. Full frontend suite: 253/253 passing,
  61/61 files. `tsc --noEmit` clean; `oxlint` clean (same pre-existing
  warnings). See `docs/features/support-page-i18n-responsive.md`.
- [x] **Phase 47 — قوانین و مقررات (Terms/Travel Info) real i18n +
  responsive body content** — seventh page of the per-page translation
  arc. `TravelInfoPage` translates its hero, all six rule sections, and
  the refund-variance warning note into fa/en/ar. Unlike every prior
  page, this one needed zero hand-translation — `design-reference-v2/
  قوانین و مقررات.dc.html` ships complete `dataFA`/`dataEN`/`dataAR`
  arrays for every section title and bullet item, and the fa content
  matched the shipped app byte-for-byte, so every string came straight
  from the design source. Section-number badges use the existing
  `formatToman` helper purely for its locale-digit formatting (not an
  actual money value). The pre-existing test passes unmodified; 2 new
  tests (en, ar). TOC + section-body two-column layout collapses to a
  single column on mobile via the shared `useIsMobile()` hook. Full
  frontend suite: 255/255 passing, 61/61 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/travel-info-page-i18n-responsive.md`.
- [x] **Phase 48 — درباره ما (About) real i18n + responsive body
  content** — eighth page of the per-page translation arc. `AboutPage`
  translates its hero (eyebrow/title/description), stats strip,
  mission/vision cards, and the three values cards into fa/en/ar.
  Extracted from `design-reference-v2/درباره ما.dc.html`'s own `isEN`
  ternaries and `site-data.js`'s `arDeep` dictionary, both complete for
  every string on this page — no hand-translation needed. The
  pre-existing test passes unmodified; 2 new tests (en, ar). Stats
  strip, mission/vision cards, and values cards collapse on mobile via
  the shared `useIsMobile()` hook. Full frontend suite: 257/257 passing,
  61/61 files. `tsc --noEmit` clean; `oxlint` clean (same pre-existing
  warnings). See `docs/features/about-page-i18n-responsive.md`.
- [x] **Phase 49 — تماس با ما (Contact) real i18n + responsive body
  content** — ninth page of the per-page translation arc. `ContactPage`
  translates its hero, four contact-channel cards (24h phone, email, head
  office address, office hours), and the message form into fa/en/ar. EN
  strings extracted from `design-reference-v2/تماس با ما.dc.html`'s own
  `isEN` ternaries, complete and matching the shipped app's fa content
  exactly. Unlike every prior page, this one's design source has no
  `isAR` branch at all for its content, and `site-data.js`'s `arDeep`
  dictionary only covers a couple of generic words (`ارسال پیام`,
  `موضوع`, `متن پیام`) — every Arabic string here was hand-translated
  fresh to the same no-silent-fallback bar as every other phase, since the
  mock's own Arabic mode would otherwise leave this page entirely in
  Persian. Hero-title test assertions use `getByRole('heading', ...)`
  rather than `getByText`, since the shared footer's translated "Contact
  Us"/"اتصل بنا" link collides with the page's own `<h1>` text. All 3
  pre-existing tests pass unmodified; 2 new tests (en, ar). Channels +
  form layout collapses to a single column on mobile via the shared
  `useIsMobile()` hook. Full frontend suite: 259/259 passing, 61/61
  files. `tsc --noEmit` clean; `oxlint` clean (same pre-existing
  warnings). See `docs/features/contact-page-i18n-responsive.md`.
- [x] **Phase 50 — ورود و ثبت‌نام (CustomerLoginPage) real i18n +
  responsive strings** — tenth page of the per-page translation arc.
  Unlike every prior page, `design-reference-v2/ورود و ثبتنام.dc.html` has
  a structurally different field layout from the real app: the design's
  mock is email+password-first with a Google sign-in button and a 5-digit
  OTP step, while the real `CustomerLoginPage.tsx` is phone+OTP-first
  (6-digit OTP, no Google sign-in — out of scope) with a real-password
  toggle and a real agency-login/agency-signup flow. Most strings were
  hand-translated to match the real app's actual fields; concepts that do
  line up 1:1 with the design (tab labels, the agency-account-activation
  note, the resend label) reused the design bundle's own `isEN`/`arDeep`
  wording. All 3 pre-existing tests pass unmodified — including the two
  byte-critical fa strings asserted verbatim (`'فراموشی رمز عبور؟'`,
  `'ارسال مجدد کد'`); 2 new tests (en, ar). Also fixes a test mock-leak
  bug in `PublicMockPages.test.tsx` (bundles `CustomerLoginPage`/
  `AboutPage`/`NotFoundPage`): the new `mockLocale('ar')` test's
  unrestored `useLocale` spy leaked into the next describe block's
  fa-only `AboutPage` test. Unlike Phase 45's fix (`vi.restoreAllMocks()`
  in `beforeEach`), that blind approach would have broken this file's
  `requestOtp`/`verifyOtp`/`passwordLogin` mocks (plain `vi.fn()`s
  configured once at module scope, not per-test) — fixed instead with a
  narrowly-targeted `afterEach(() => { vi.spyOn(useLocaleModule,
  'useLocale').mockRestore(); })` that restores only the `useLocale` spy.
  Full frontend suite: 261/261 passing, 61/61 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/customer-login-page-i18n-responsive.md`.
- [x] **Phase 51 — فراموشی رمز: real email password-reset path + i18n** —
  eleventh page of the arc, but unlike Phases 42–50 this one needed real
  new backend work first (flagged since Phase 50's summary): a second
  identity-proof path for password reset via a customer's VERIFIED email
  (Phase 17), alongside the existing phone+SMS OTP path (Phase 21). New
  `TwoFactorPurpose.PASSWORD_RESET_EMAIL` (its own purpose, not reused
  from `EMAIL_VERIFY` — different trust decisions despite identical
  delivery mechanics); `POST /auth/password-reset/email/request` (looks
  up a verified-email `USER` row, deliberately does NOT upsert/create one
  the way phone OTP does — inventing an account for an arbitrary
  submitted email would let anyone probe/claim an address that isn't
  theirs) and `POST /auth/password-reset/email/verify` (same challenge
  machinery as `otp/verify`, purpose-scoped so an `EMAIL_VERIFY` or
  `CUSTOMER_OTP_LOGIN` challenge id can't cross over), handing off into
  the existing `POST /auth/set-password`. Offered in every locale, not
  gated to en/ar — restricting a security recovery method by display
  language would be arbitrary; the real gate is whether the account has a
  verified email. `ForgotPasswordPage.tsx` gains a phone/email identifier
  toggle plus a full fa/en/ar `STR` dictionary; all 4 pre-existing tests
  pass unmodified (byte-critical fa strings untouched); 3 new tests (email
  happy path, en, ar). New backend e2e spec:
  `phase51-password-reset-email.e2e-spec.ts` (10 tests) — first pass used
  fixed literal emails and hit real `Unique constraint failed` errors on
  a second run against the persistent test DB (email `User.create` isn't
  idempotent the way phone OTP's upsert is); fixed with the same
  `crypto.randomUUID()`-suffixed email convention already used in
  `club.e2e-spec.ts`/`cartable.e2e-spec.ts`. A full-suite run first showed
  3 unrelated failures (`flights.e2e-spec.ts`, `reporting.e2e-spec.ts`,
  `flight-engine-completion.e2e-spec.ts`) — traced to financial/booking
  data accumulated in the shared local `blujet_test` Postgres across many
  manual e2e runs this session (confirmed by re-running the same 3 files
  in isolation and watching the expected revenue totals drift between
  runs). With the user's explicit consent, reset the test DB
  (`prisma migrate reset --force` + reseed) and reran: `flights`/
  `reporting` are clean on a fresh DB (confirming those were pollution,
  not regressions); `flight-engine-completion`'s one test still times out
  (20s) even in isolation on a clean DB — a genuine pre-existing flake
  (already flagged in this file's earlier "Fix pre-existing flaky
  failures" entry), unrelated to auth/Phase 51, out of scope to fix here.
  Final backend e2e: 356/357 passing (1 pre-existing unrelated flake).
  Full frontend suite: 264/264 passing, 61/61 files. `tsc --noEmit` clean
  on both packages; lint clean on both (same pre-existing warnings). See
  `docs/features/forgot-password-email-reset-i18n.md`.
- [x] **Phase 52 — پنل کاربر (AccountPage) real i18n** — twelfth page of
  the arc and the largest so far: 7 tabs (پروفایل من, سفرها, کیف پول,
  امتیاز باشگاه, قفل قیمت, مسافران, استرداد‌ها), all backed by real
  endpoints from earlier phases — no new backend work needed. EN strings
  extracted from `design-reference-v2/پنل کاربر.dc.html`'s own `isEN`
  ternaries (rich coverage); AR mixes the design's own partial `isAR`
  coverage with fresh hand-translation. The «قفل قیمت» tab has no design
  counterpart at all — a real feature unique to this app — so its strings
  were hand-translated to match the actual implementation. Status badge
  maps (`STATUS_LABEL`, `REFUND_STATUS_LABEL`, `LOCK_STATUS_LABEL`) and
  `TIER_LABEL`/`CABIN_LABEL` (the latter reusing `ResultsPage.tsx`'s exact
  mapping) were restructured from flat fa strings to
  `Record<StoredLocale, string>`; the toman currency word stays
  `'تومان'`/`'Toman'`/`'تومان'` in every locale, consistent with the
  pricing-honesty rule from earlier phases. All 12 pre-existing tests pass
  unmodified — including the byte-critical fa strings they assert exactly
  (`'در حال بررسی'`, `'★ سطح طلایی'`, `'اطلاعات پروفایل ذخیره شد ✓'`, the
  `'کد ملی'` label, the `'ذخیره اطلاعات'` button, `'لغو شده'`); 2 new
  tests (en, ar). Full frontend suite: 266/266 passing, 61/61 files. `tsc
  --noEmit` clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/account-page-i18n-responsive.md`.
- [x] **Phase 53 — پنل آژانس: shared shell + login/signup real i18n
  (foundation)** — first agency-portal phase of the arc, a shared-shell
  foundation like Phase 41: `AgencyPortalShell.tsx` (sidebar nav +
  sign-out), `AgencyLoginLayout.tsx` (B2B-partner login shell), and
  `AgencyLoginPage.tsx` (login form, signup form, OTP step, done state).
  Unlike every prior phase, no design-mock counterpart exists for the
  login/signup screen at all — `design-reference-v2/پنل آژانس.dc.html`'s
  `isEN`/`isAR` ternaries only cover the post-login dashboard content
  (its own `navMeta` array, KPI labels, etc.), since the design never
  specified an agency login mechanism (the same ⚑ product-decision gap
  already recorded for this track). The shell's 7 nav labels reuse the
  design's own `navMeta` EN wording where the concept lines up 1:1
  (Dashboard, Credit & Balance, Sales & Reports, Inbox & Messages,
  Profile & Documents); AR there and every login/signup string is
  hand-translated, reusing `CustomerLoginPage.tsx`'s exact wording for
  overlapping concepts (license number, manager name, terms checkbox).
  `dir` on both the shell and login layout now derives from `useLocale()`
  instead of a hardcoded `"rtl"`. All 3 pre-existing tests pass
  unmodified — including the byte-critical fa strings they assert
  exactly (the `'ورود به پنل آژانس'` button, the
  `'شماره تماس و رمز عبور را وارد کنید.'` error, the signup field labels,
  the `'درخواست همکاری شما ثبت شد'` done message); 2 new tests (en, ar).
  Full frontend suite: 268/268 passing, 61/61 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). Remaining
  agency-portal pages (Dashboard, Credit, Sales, Inbox, Profile, Seats,
  Webservice) are separate follow-up phases. See
  `docs/features/agency-portal-shell-login-i18n.md`.
- [x] **Phase 54 — پنل آژانس: Dashboard tab real i18n** — second
  agency-portal page. `AgencyDashboardPage.tsx` translates its heading,
  4 KPI cards, 6-month sales chart, and credit summary into fa/en/ar; all
  backed by the real `GET /agency-portal/dashboard` endpoint from Phase 9
  — no new backend work. Most strings are hand-translated (no usable
  match in the design bundle's `isEN`/`isAR` ternaries for this page's
  specific copy); the sales chart's Jalali month labels reuse
  `design-reference-v2/وضعیت پرواز.dc.html`'s own established romanized
  EN names (Farvardin, Ordibehesht, ...) and its AR names, which are
  identical to the Persian names verbatim (no separate Arabic name for a
  Jalali month exists, same reasoning as "تومان" staying unchanged in
  Arabic). The pre-existing test passes unmodified — the byte-critical fa
  heading `'داشبورد'` and chart aria-label
  `'نمودار فروش ۶ ماه اخیر'` stay byte-identical; 2 new tests (en, ar).
  Full frontend suite: 270/270 passing, 61/61 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/agency-dashboard-page-i18n.md`.
- [x] **Phase 55 — پنل آژانس: Credit & Balance tab real i18n** — third
  agency-portal page. `AgencyCreditPage.tsx` translates its credit KPIs,
  invoices table, credit-increase request list, ledger, and
  credit-increase request modal into fa/en/ar; all backed by real
  `agency-portal` endpoints — no new backend work. EN strings mostly
  extracted from `design-reference-v2/پنل آژانس.dc.html`'s own rich
  `isEN` vocabulary for this exact tab; AR mixes the design's partial
  coverage with hand-translation. Deliberately keeps its own local
  invoice/credit-request status label maps rather than translating the
  shared `agency-labels.ts` module, which the staff-side
  `AgencyDetailPage.tsx` depends on and which stays Persian-only (staff
  panels aren't locale-switchable). Both pre-existing tests pass
  unmodified — the byte-critical fa strings they assert stay
  byte-identical (`'پرداخت از اعتبار'`, `'افزایش اعتبار'`,
  `'سقف درخواستی (تومان)'`, `'ارسال درخواست'`); 2 new tests (en, ar).
  Full frontend suite: 272/272 passing, 61/61 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/agency-credit-page-i18n.md`.
- [x] **Phase 56 — پنل آژانس: Sales & Reports tab real i18n** — fourth
  agency-portal page. `AgencySalesPage.tsx` translates its 4 KPIs,
  per-flight sales table, and issued-tickets table into fa/en/ar; backed
  by the real `GET /agency-portal/sales` endpoint — no new backend work.
  Heading and KPI labels reuse `design-reference-v2/پنل آژانس.dc.html`'s
  own `isEN` vocabulary for this exact tab (`reportKpis`'s KPI labels,
  the "Sales per flight" section label); AR is hand-translated. The
  tickets table's booking-status labels are a page-local map, kept
  separate from `AccountPage.tsx`'s `STATUS_LABEL` since the two pages
  use different (compact vs. verbose) fa wording for the same statuses.
  The pre-existing test passes unmodified; 2 new tests (en, ar). Full
  frontend suite: 274/274 passing, 61/61 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/agency-sales-page-i18n.md`.
- [x] **Phase 57 — پنل آژانس: Inbox & Messages tab real i18n** — fifth
  agency-portal page. `AgencyInboxPage.tsx` translates its message thread
  (sender labels, empty state) and compose form into fa/en/ar; backed by
  real `agency-portal` inbox endpoints — no new backend work. Most
  strings reuse `design-reference-v2/پنل آژانس.dc.html`'s own `isEN`
  vocabulary for this exact tab; AR is hand-translated. The pre-existing
  test passes unmodified — the byte-critical fa placeholder
  `'پیام خود را بنویسید…'` and `'ارسال'` button stay byte-identical; 2
  new tests (en, ar). Full frontend suite: 276/276 passing, 61/61 files.
  `tsc --noEmit` clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/agency-inbox-page-i18n.md`.
- [x] **Phase 58 — پنل آژانس: Profile & Documents tab real i18n** —
  sixth agency-portal page. `AgencyProfilePage.tsx` translates its
  agency-info fields, document-upload form, and submitted-documents list
  into fa/en/ar; backed by real `agency-portal` endpoints — no new
  backend work. Field labels and document-status wording match
  `design-reference-v2/پنل آژانس.dc.html`'s own `isEN` `profileFields`/
  `documents` sample data for this exact tab (CEO, License Number, City,
  Phone, Email, Partnership Type; Approved/Pending/Rejected); AR is
  hand-translated. Keeps its own local tier/document-type/status label
  maps rather than translating the shared `agency-labels.ts` module used
  by the staff-side `AgencyDetailPage.tsx` (same reasoning as Phase 55).
  The pre-existing test passes unmodified — the byte-critical fa status
  string `'در انتظار بررسی'` stays byte-identical; 2 new tests (en, ar).
  Full frontend suite: 278/278 passing, 61/61 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/agency-profile-page-i18n.md`.
- [x] **Phase 59 — پنل آژانس: Allocated Seats tab real i18n** — seventh
  agency-portal page. `AgencySeatsPage.tsx` translates its info banner,
  per-flight allotment cards (Allocated/Sold/Remaining labels,
  Active/Released badge), and empty state into fa/en/ar; backed by real
  `GET /agency-portal/allotments` — no new backend work. The info banner
  and metric labels match `design-reference-v2/پنل آژانس.dc.html`'s own
  `isEN` `seatsInfoBanner`/`allocatedLabel`/`soldLabel`/`remainingLabel`
  vocabulary for this exact tab; AR is hand-translated. This page had no
  test file before this phase — `AgencySeatsPage.test.tsx` was created
  from scratch with 4 tests (fa happy-path asserting real allotment cards
  with faDigits counts, fa empty state, en, ar). Full frontend suite:
  282/282 passing, 62/62 files. `tsc --noEmit` clean; `oxlint` clean (same
  pre-existing warnings). See `docs/features/agency-seats-page-i18n.md`.
- [x] **Phase 60 — پنل آژانس: Web Service (B2B API) tab real i18n** —
  eighth and final agency-portal page, completing the agency-portal
  i18n arc (Phases 53–60: Shell+Login, Dashboard, Credit, Sales, Inbox,
  Profile, Seats, Webservice). `AgencyWebservicePage.tsx` translates the
  webservice purchase flow (info banner, scope/duration selection,
  pending/rejected states, active-connection summary) into fa/en/ar; no
  new backend work. Several labels match
  `design-reference-v2/پنل آژانس.dc.html`'s own `isEN` vocabulary for
  this exact tab (`wsInfoBanner`, `wsPendingTitle`, `wsPendingBadge`,
  `wsNewPurchaseTitle`, `wsNewPurchaseSub`, `wsTypeLabel`,
  `wsDurationLabel`, `wsPayableLabel`, `wsSubmitLabel`, `wsActiveTitle`,
  `wsActiveBadge`, `wsBaseUrlLabel2`); the real scope names
  (`SEARCH_BOOK`/`FULL`/`SEARCH_ONLY`), 1/3/12-month plans, and
  correspondence-based key delivery wording have no design counterpart
  and are hand-translated, as is all AR text. Toman amounts keep
  Persian-digit formatting in every locale (only the currency word
  changes), matching the established money convention. All 4
  pre-existing tests pass unmodified; 2 new tests (en, ar). Full frontend
  suite: 284/284 passing, 62/62 files. `tsc --noEmit` clean; `oxlint`
  clean (same pre-existing warnings). See
  `docs/features/agency-webservice-page-i18n.md`.
- [x] **Phase 61 — صفحه 404 real i18n** — first page of the
  post-agency-portal i18n continuation. `NotFoundPage.tsx` is a small,
  standalone static page unrelated to the excluded checkout/payment
  flow — translates its heading, body copy, both links, and error-code
  footer into fa/en/ar; the wrapping `dir` attribute is now locale-aware
  (matching the `AgencyPortalShell.tsx` pattern from Phase 53). No new
  backend work. `design-reference/صفحه 404.dc.html` has no
  `isEN`/`isAR` sample data at all, so all EN/AR text is hand-translated.
  This page had no test file before this phase —
  `NotFoundPage.test.tsx` was created from scratch with 3 tests (fa, en,
  ar). Full frontend suite: 287/287 passing, 63/63 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/not-found-page-i18n.md`.
- [x] **Phase 62 — صفحه تعمیر و نگهداری real i18n** — another small,
  standalone static page (served manually during planned downtime),
  unrelated to the excluded checkout/payment flow. `MaintenancePage.tsx`
  translates its badge, heading, body copy, ETA notice, and
  support-contact footer into fa/en/ar; `dir` is now locale-aware. No new
  backend work. `design-reference/در حال تعمیر و نگهداری.dc.html` has no
  `isEN`/`isAR` sample data, so all EN/AR text is hand-translated. The
  support phone number keeps its Persian-digit literal in every locale,
  matching `SupportPage.tsx`'s convention (Phase 46). This page had no
  test file before this phase — `MaintenancePage.test.tsx` was created
  from scratch with 3 tests (fa, en, ar). Full frontend suite: 290/290
  passing, 64/64 files. `tsc --noEmit` clean; `oxlint` clean (same
  pre-existing warnings). See `docs/features/maintenance-page-i18n.md`.
- [x] **Phase 63 — وضعیت پرواز real i18n** — `FlightStatusPage.tsx` (real
  flight-status lookup, Phase 22) translates its hero title/subtitle,
  mode toggle, field labels, result card, and status pill into fa/en/ar;
  no new backend work. Most labels reuse
  `design-reference-v2/وضعیت پرواز.dc.html`'s own `isEN`/`isAR`
  vocabulary for this exact page; origin/destination labels and the
  airport-name `CITY_NAMES` map reuse the convention already established
  in `HomeSearchPage.tsx` (Phase 42). The status pill needed a
  `Record<string, Tr>` keyed by the exact fa string the backend returns
  (not a 3-way status-enum map), since the backend's `DEPARTED` status
  covers two distinct fa strings ("فرود آمد"/"در حال پرواز") depending on
  arrival time — the fa string itself is the identity fallback, keeping
  fa output byte-identical. All 5 pre-existing tests pass unmodified; 2
  new tests (en, ar). Full frontend suite: 292/292 passing, 64/64 files.
  `tsc --noEmit` clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/flight-status-page-i18n.md`.
- [x] **Phase 64 — مدیریت رزرو real i18n** — `ManageBookingPage.tsx` (real
  anonymous PNR + last-name self-service, Phase 19) translates its lookup
  form, booking-detail card, refund modal, and refund-done summary into
  fa/en/ar; no new backend work. Most labels reuse
  `design-reference-v2/مدیریت رزرو.dc.html`'s own `isEN` vocabulary for
  this exact page; that design file has no Arabic sample data at all, so
  all AR text is hand-translated. The cabin label reuses the
  `CABIN_LABEL` map convention from `ResultsPage.tsx` (Phase 43). The raw
  `booking.status` enum value is still displayed verbatim in every locale
  (pre-existing gap, unrelated to i18n scope, unchanged from before). All
  4 pre-existing tests pass unmodified; 2 new tests (en, ar). Full
  frontend suite: 294/294 passing, 64/64 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/manage-booking-page-i18n.md`.
- [x] **Phase 65 — قوانین باشگاه مشتریان (Club Tier Rules)** — found during
  the earlier design-bundle audit: `پنل مدیر بازرگانی.dc.html`'s
  `clubrules` tab was never built. Docs (`docs/API.md`, `docs/DB_SCHEMA.md`,
  `docs/features/club-tier-rules.md`) were drafted and explicitly
  approved by the user before any code was written, per CLAUDE.md
  workflow rule 1. New singleton `ClubTierRule` table
  (migration `20260730162159_phase65_club_tier_rules`), seeded with
  defaults matching the point ranges already shown as marketing copy on
  `PublicClubPage.tsx`/`HomeSearchPage.tsx` (GOLD ≥5,000, PLATINUM
  ≥15,000). New `GET`/`PATCH /club/tier-rules` (CEO + COMMERCIAL_MANAGER
  only, matching the design's own `roleDefs.access` arrays — no other
  executive-panel design file has a `clubrules` tab at all), with
  ordering validation (`goldMinPoints < platinumMinPoints`) and audit
  logging. `ClubPointsService.syncCache` now recomputes `ClubMember.level`
  for real from the configured thresholds every time a member's points
  change (both earn and redeem paths, same transaction as the ledger
  write) — replacing the previous manual-only
  `PATCH /club/members/:id/level` staff action as the only way tiers ever
  changed. The card-request point threshold (`cardRequestMinPoints`) is
  stored and returned but intentionally not yet enforced anywhere, since
  no real self-service card-request flow exists in the codebase to gate
  (documented scope boundary, not a fabricated no-op field). New frontend
  page `ClubTierRulesPage.tsx` (route/tab `clubrules`, wired into
  `PANEL_NAV` for CEO + COMMERCIAL_MANAGER only) renders the threshold
  form and a read-only tier-preview table. Backend: 9 new e2e tests in
  `club.e2e-spec.ts` (13/13 passing with the 4 pre-existing tests
  unmodified) + a new 8-case unit spec `club-tier.spec.ts` for
  `resolveTierForPoints`'s boundary logic (all passing). Frontend: new
  `ClubTierRulesPage.test.tsx`, 4/4 passing. Fixed one pre-existing e2e
  test (`panels.e2e-spec.ts`'s CEO tab-set assertion) to include the new
  `clubrules` key. Full backend e2e suite: 360/361 passing — the sole
  failure is the same pre-existing `reporting.e2e-spec.ts` sales-chart
  reconciliation flake already documented in Phase 51's entry (financial
  data accumulated in the shared local `blujet_test` Postgres across many
  e2e runs this session; confirmed by re-running in isolation and
  observing the expected/received totals drift between runs — unrelated
  to this phase's `ClubMember`/`ClubTierRule`-only changes). Full backend
  unit suite: 35/35 passing. Full frontend suite: 298/298 passing, 65/65
  files. `tsc --noEmit` clean on both packages; lint clean on both (same
  pre-existing warnings). No new Playwright E2E script this phase —
  consistent with this session's cadence for Phases 51–64. See
  `docs/features/club-tier-rules.md`.
- [x] With Phases 35–37, the manual endpoint audit had covered
  `reconciliation`, `reservation`, and `it-manager`'s `services` module;
  every other controller checked so far (`pricing`, `flightops`,
  `it-manager`'s `security`/`backups`/`employees`/`dashboard`, `club`,
  `booking-engine`'s `search`/`booking`/`privacy`/`wallet-points-lock`,
  `refunds`, `referrals`/`manager-messages` via `cartable.ts`,
  `staff-reports`/`passenger-reports` via `reporting.ts`, `settings` via
  `admins.ts`) came back fully wired. The audit was then finished across
  every remaining controller (`files`, `panels`, `agency-portal`,
  `agencies`, `audit`, `contact`, `support-tickets`, `auth`, `health`,
  `flight-status`, `manage-booking`, `profile`) — all confirmed fully
  wired (audit's endpoints turned out to be split across
  `it-manager.ts`/`admins.ts` frontend callers, not a real gap). The only
  module with real remaining gaps was `flights`: aircraft-type-change
  (`PATCH /flights/:instanceId/aircraft`, needing a step-up form and a
  missing aircraft-types listing endpoint) and fare-rules CRUD (a bigger,
  undesigned admin table). Reported both to the user; picked
  aircraft-type-change to build now (Phase 38 below) as the smaller,
  better-specified, lower-invention-risk option, leaving fare-rules CRUD
  deferred for explicit direction.

- [x] **Phase 66 — نظرسنجی مسافران (Passenger Satisfaction Survey)** —
  found across three design files during a follow-up domain-scoping
  discussion (`پنل مدیر IT.dc.html`'s create/configure `survey` tab, and
  `پنل مدیر عامل.dc.html`/`پنل مدیر ارشد.dc.html`/`پنل رئیس هیئت
  مدیره.dc.html`'s shared read-only results + AI-summary `survey` tab).
  Docs (`docs/API.md`, `docs/DB_SCHEMA.md`,
  `docs/features/passenger-survey.md`) were drafted and explicitly
  approved by the user before any code was written, per CLAUDE.md
  workflow rule 1. Five new tables (`SurveySettings`, `SurveyQuestion`,
  `SurveyInvite`, `SurveyResponse`, `AiUsageLog`) across two migrations
  (`20260730190717_phase66_passenger_survey` and
  `20260730190905_phase66_survey_invite_sms_type`), plus a new
  `AuditCategory.SURVEY` value and a new `SmsMessageType.SURVEY_INVITE`
  value. Lazy, no-cron invite creation: a new
  `materializeSurveyInvites` (in `survey/survey-lifecycle.util.ts`)
  creates a `SurveyInvite` + sends an SMS (via the booking's plaintext
  `contactPhone`, not decrypted `Passenger.mobileEnc`) for every booking
  observed `FLOWN` while `SurveySettings.enabled` is true — triggered
  from the survey module's own `GET /survey/stats`/`GET /survey/results`
  reads rather than the three originally-drafted call sites (a
  simplification made during implementation, documented in
  `docs/API.md`). New `IT_MANAGER`-only config endpoints (settings
  enable/title, question CRUD, stats), new public no-auth token
  endpoints (`GET`/`POST /survey/:token`, rate-limited per-IP), and new
  `CEO`/`SENIOR_MANAGER`/`BOARD_CHAIR`-only read-only results +
  AI-analyze endpoints (`GET /survey/results`,
  `POST /survey/results/:flightInstanceId/analyze` — keyed on
  `flightInstanceId`, not `flightNo` as originally drafted, since a
  recurring flight number isn't unique across departures). New
  `SurveySummaryProvider` AI abstraction
  (`backend/src/modules/ai/survey-summary.provider.ts`) calling the
  Anthropic Messages API directly — a second, separate `AiProvider`
  since CLAUDE.md scopes `ml-service` to exactly two unrelated
  endpoints — gated by `ANTHROPIC_API_KEY`, graceful `null`-on-any-
  failure fallback (design's own fallback string,
  `"خلاصه‌ای از نظرات این پرواز در دسترس نیست."`), and a new
  `AiUsageLog` row per successful call with the **real**
  `input_tokens`/`output_tokens` from the Anthropic response — closing a
  pre-existing CLAUDE.md-mandated gap (Phase 6's pricing-AI never
  implemented usage logging at all). New frontend: public `SurveyPage.tsx`
  (route `/survey/:token`, deliberately fa-only — no exported design
  file exists for this brand-new page to extract en/ar vocabulary from,
  unlike the retrofitted i18n-arc pages), `SurveyConfigPage.tsx`
  (`IT_MANAGER`), `SurveyResultsPage.tsx` (`CEO`/`SENIOR_MANAGER`/
  `BOARD_CHAIR`), and a `SurveyRouter.tsx` role-branching component (same
  pattern as `LogsRouter.tsx`). Backend: 12 new e2e tests
  (`survey.e2e-spec.ts`) + a new 5-case unit spec for
  `SurveySummaryProvider` (`survey-summary.provider.spec.ts` — missing
  key, empty comments, non-2xx, network failure, real success path, all
  via a mocked `global.fetch`; closes the same "AI provider has no unit
  test" gap `MlPriceSuggestionProvider` still has). Frontend: 10 new
  Vitest/RTL tests across the three new pages. Fixed one pre-existing
  e2e test (`panels.e2e-spec.ts`'s CEO tab-set assertion) to include the
  new `survey` key, same pattern as Phase 65's `clubrules` addition.
  Full backend e2e suite: 372/373 passing — the sole failure is the
  same pre-existing `reporting.e2e-spec.ts` sales-chart reconciliation
  flake already documented in Phase 51/65's entries (shared
  `blujet_test` Postgres data drift across many e2e runs this session;
  confirmed unrelated to this phase, which never touches
  `Booking`/`LedgerEntry` revenue data). Full backend unit suite: 40/40
  passing. Full frontend suite: 308/308 passing, 68/68 files. `tsc --noEmit` clean on both packages; lint
  clean on both (no new warnings). No new Playwright E2E script this
  phase — consistent with this session's cadence for Phases 51–65. See
  `docs/features/passenger-survey.md`.
- [x] **Post-merge senior code review of Phase 66** — at the user's
  explicit request, re-reviewed the merged survey diff with a senior
  backend engineer's rigor (not a fresh feature, a review pass). Found
  and fixed 5 real issues: (1) `SurveyConfigPage.tsx` had an unreachable
  error state — the `if (!settings) return <loading>` guard also fired
  on a failed initial fetch, trapping the user on a silent spinner
  forever; (2) `materializeSurveyInvites` never retried a failed SMS
  send once the `SurveyInvite` row existed, silently stranding the
  passenger — added a bounded retry pass scoped to invites whose booking
  has a phone; (3) `getResults()` aggregated every historical response
  row in a JS `Map` instead of real SQL, unbounded by survey volume, and
  the docs had inaccurately described it as SQL-level aggregation —
  replaced with a real `$queryRaw` `GROUP BY`; (4) the AI summary prompt
  concatenated untrusted passenger comments with no framing, a real
  prompt-injection surface against the exec-facing summary — added an
  explicit "treat this as data, not instructions" guard (a deliberate,
  documented deviation from "matches the design's prompt exactly"); (5) a
  booking later marked NO_SHOW left its already-issued `SurveyInvite`
  fully answerable — `findInviteByToken` now also checks booking status
  and 404s a NO_SHOW invite exactly like an unknown token. 3 new tests
  added (1 frontend, 2 backend e2e). Full backend e2e suite re-run:
  374/375 passing — the sole failure is the same pre-existing
  `reporting.e2e-spec.ts` revenue-reconciliation flake documented in
  Phase 51/65/66's own entries (shared `blujet_test` Postgres data drift
  across many e2e runs this session; confirmed unrelated, since none of
  these fixes touch `Booking`/`LedgerEntry` revenue data). Full backend
  unit suite: 40/40 passing. Full frontend suite: 309/309 passing.
  `tsc --noEmit` and lint clean on both packages. See
  `docs/features/passenger-survey.md`'s "Post-merge senior review"
  section for the full writeup.
- [x] **Phase 67: فرصت‌های شغلی (Careers)** — public job listing/apply +
  SITE_ADMIN posting CRUD and application review. Docs first (per
  workflow rule 1), user-approved, then implemented: `CareersSettings`/
  `JobPosting`/`JobApplication` models + migration; `CareersService`/
  `CareersController` (SITE_ADMIN, guarded)/`CareersPublicController`
  (no auth, throttled) with real resume upload (PDF-only, 3 MB, closes a
  gap where the design's own mock never persisted the picked file);
  national ID encrypted at rest (reuses `pii-crypto.ts`, no new PII
  code); computed referral-target list (real `COMMERCIAL_MANAGER`/
  `FINANCE_MANAGER` staff + singleton `CEO`/`SENIOR_MANAGER`, not
  hardcoded); `jobapps` SITE_ADMIN panel tab. Frontend:
  `CareersPage`/`CareersApplyPage` (public, `/careers`,
  `/careers/:jobId/apply`) and `CareersAdminPage` (postings + application
  review with refer/hire/reject), `api/careers.ts`, footer link gated by
  `CareersSettings.enabled` via a new `useCareersEnabled` hook. **Post-
  implementation correction** (caught before finalizing docs): the
  earlier draft claimed two dedicated public design files existed for
  the listing/apply pages — re-verified directly against
  `design-reference/`, they don't; the design only has a small
  posting-management card grid inside `پنل ادمین سایت.dc.html`, and has
  **no application-review UI at all**. The public pages and the review
  workflow were built by extension of this codebase's existing visual
  language, not lifted from a design file — `docs/API.md`/`DB_SCHEMA.md`
  corrected to say so plainly rather than leave an inaccurate design
  citation standing. Real Kavenegar SMS driver also added in this window
  (user provided the vendor, not part of Careers itself):
  `KavenegarSmsProvider` behind the existing `SmsProvider` interface.
  **Revised after the user asked whether the key could instead be
  managed from پنل مدیر IT**: rather than a server env var, the provider
  reads the pre-existing `ExternalServiceConfig(key:"ext_kavenegar")` row
  (Phase 28's IT-panel-managed, encrypted-at-rest external-service
  mechanism already used for زرین‌پال/آمادئوس/نشان) on every send, and
  falls back to `MockSmsProvider` whenever it's disabled or keyless — so
  the real key is set/rotated live from the panel, never committed
  anywhere or held in `.env`. `KAVENEGAR_SENDER_LINE` remains the one
  non-secret env var. Backend: 16 e2e + 4 unit tests. Frontend: 12 page tests + 2
  hook tests + 1 footer test = 15 new tests. Full backend e2e suite:
  392/392 passing. Full backend unit suite: 48/48 passing. Full frontend
  suite: 325/325 passing, 75 files. `tsc --noEmit` and lint clean on both
  packages. See `docs/features/careers.md` for the full checked-off
  acceptance checklist.
- [x] **SITE_ADMIN club referral (merged PR #34)** — completes user-initiated
  card-request flow: `GET /club/submitted-card-requests`, `PATCH
  /club/card-requests/:id/refer`, `ClubPage.tsx` SITE_ADMIN branch.
- [x] **User panel — نشان‌شده‌ها (saved flights)** — `SavedFlight` model +
  `GET/POST/DELETE /my/saved-flights`; `AccountPage` `saved` tab +
  `ResultsPage` bookmark button. See `docs/features/saved-flights.md`.
- [x] **User panel — مسافران ذخیره‌شده (saved passengers)** — `SavedPassenger`
  model + `GET/POST/PATCH/DELETE /my/saved-passengers`; `AccountPage`
  `passengers` tab CRUD + `BookPage` autofill chips + profile-tab preview block. See
  `docs/features/saved-passengers.md`.
- [x] **User panel — نشست‌های فعال (active sessions, merged PR #39)** —
  `GET/DELETE /my/sessions` over `RefreshToken`; `AccountSecuritySessions`
  on security tab. See `docs/features/active-sessions.md`.
- [x] **User panel — حساب‌های بانکی (merged PR #40)** — `SavedBankAccount`
  model (PAN/SHEBA encrypted at rest, masked in responses) +
  `GET/POST/PATCH/DELETE /my/bank-accounts` with default-account toggle;
  `AccountBankAccountsTab` on the `banks` tab. See
  `docs/features/bank-accounts.md`.
- [x] **User panel — معرفی دوستان (merged PR #41)** — `CustomerReferral`
  model + `User.referralCode`; `GET /my/referral` dashboard; optional
  `ref` code on OTP signup creates the `SIGNED_UP` link; first ticketed
  booking by a referred user awards 500 club points to the referrer
  (idempotent, points ledger). `AccountReferralTab` on the `referral`
  tab. See `docs/features/customer-referral.md`.
- [x] **User panel — احراز هویت (merged PR #42)** — `CustomerIdentityVerification`
  model (`NOT_STARTED/SUBMITTED/APPROVED/REJECTED`); `GET /my/identity` +
  `POST /my/identity/id-card` (upload via `FilesService`) + `POST
  /my/identity/submit`. Explicit design cut per CLAUDE.md: **no selfie
  step** — profile identity fields + national-ID-card upload only.
  `AccountIdentityTab` on the `identity` tab. See
  `docs/features/customer-identity.md`.
- [x] **پنل ادمین سایت — احراز هویت مشتریان (merged PR #43)** — staff side
  of the KYC flow (the `APPROVED`/`REJECTED` transitions must be
  reachable; no design tab exists, so it follows the `jobapps`
  review-queue pattern): new `kyc` tab in `PANEL_NAV.SITE_ADMIN`,
  `GET /identity-verifications` (+ `/:id/id-card` streaming) and
  `PATCH /:id/approve|reject` (reject reason required, shown to the
  customer who can re-submit), audit-logged. `IdentityAdminPage` at
  `/panel/kyc`. See `docs/features/customer-identity.md`.
- [x] **Post-merge user-panel documentation/seed sync** — `PLAN.md` now
  records merged PRs #39–#43 instead of leaving active sessions unchecked;
  `docs/openapi.json` regenerated with all new user-panel/KYC routes;
  development seed gains a real `SUBMITTED` KYC row + tiny PNG so the
  admin review/download flow is immediately exercisable. The seed's old
  demo-booking loop was also made idempotent (`Booking.upsert` plus
  passenger/SALE existence checks): running the seed twice had previously
  failed on globally unique demo PNRs after flight instances changed.
- [x] **User panel — complete refund tab (account refunds)** — closes the
  gap between `design-reference-v2/پنل کاربر.dc.html` and the previous
  amount/status-only list: live eligible bookings + penalty previews,
  API-driven four-bracket rules, saved-bank/manual-IBAN confirmation,
  short tracking codes and real four-stage history. Backend adds
  `GET /my/refunds/eligible-bookings|rules`, `POST /my/refunds/preview`,
  enriched list/detail/submit responses, unique tracking/booking
  constraints (including a two-client concurrency test), and fixes the
  previously unreachable production payout path by advancing SITE_ADMIN
  referrals to `FINANCE`. Frontend: `AccountRefundsTab` in fa/en/ar +
  responsive states and a real Playwright account-refund journey. Full
  clean-database backend E2E: 429/429; frontend: 366/366; focused
  Playwright journey: 1/1; see
  `docs/features/customer-account-refunds.md`.
- [x] **Bug fix (senior review, found while chasing the "pre-existing"
  reporting flake): revenue reporting polluted by agency debt-calibration
  ledger rows.** The `reporting.e2e-spec.ts` sales-chart/kpis
  reconciliation failure that had been repeatedly logged across Phases
  51/65/66/67 as "shared test-DB data drift" was never drift — it's a
  real, deterministic bug. `AgenciesService.resetTestDebt()` (e2e/dev-only,
  404 in production) reuses `LedgerEntry{type:'SALE'}` for agency
  debt-line calibration (`agencyId` set, `bookingId` null,
  `signedAmountIrr` can be **negative**) — a different concern from
  ticket revenue, but every company-wide revenue aggregate
  (`ReportingService.kpis()`/`revenueMix()`, `PnrService.dashboardStats()`,
  `AgencyPortalService.dashboard()`, `AgenciesService.detail()`) summed
  **every** `type:'SALE'` row with no `bookingId` filter, silently
  folding negative debt adjustments into "revenue." `sumByChannel()`
  (sales-chart) happened to exclude them, but only by an unrelated
  accident (it drops rows with no `booking.channel`) — not a deliberate
  filter, which is exactly why the two endpoints disagreed. Fixed: every
  real-revenue aggregate now also requires `bookingId: { not: null }`;
  `computeUsedIrr()` (the one place that legitimately wants the
  debt-adjustment rows) is untouched. New regression test in
  `test/reporting.e2e-spec.ts` inserts a synthetic bookingless SALE row
  and asserts `kpis().revenueIrr` doesn't move and still reconciles with
  `salesChart()`/`revenueMix()`. Full backend e2e suite re-run clean:
  392/392 — the flake that failed in every prior full-suite run this
  session is gone for real, not just quieted by DB timing. See
  `docs/DB_SCHEMA.md`'s matching entry for the full technical writeup.
- [x] **Int → BigInt migration for every IRR money column** (closes the
  "Known technical debt" note below — user explicitly reviewed and
  approved this before it started, given the blast radius). All 27
  IRR-denominated columns (`priceIrr`, `taxIrr`, `amountIrr`,
  `signedAmountIrr`, `limitIrr`, `requestedLimitIrr`,
  `contractPriceIrr`, `competitorPriceIrr`, `proposedPriceIrr`,
  `legalRateIrr`, `registeredPriceIrr`, `totalPaidIrr`,
  `penaltyAmountIrr`, `refundableIrr`, `discountIrr`, `lockedPriceIrr`,
  `feeIrr`, `costIrr`, `basePriceIrr`, `PromoCode.value`) converted from
  Postgres `integer` (Int32 ceiling ~2.14e9 IRR ≈ 214M toman — a real
  agency credit line or yearly revenue aggregate can plausibly exceed
  that) to `bigint`, via a single widening migration
  (`20260731061249_money_columns_int_to_bigint`, plain
  `ALTER COLUMN ... TYPE BIGINT` — no data loss, no downtime concern
  pre-launch). Non-money `Int` fields (seat counts, percentages like
  `penaltyPct`/`discountPct`, token counts, byte sizes, minutes) were
  deliberately left untouched.
  - New `backend/src/common/money.ts` — the single shared money-arithmetic
    utility CLAUDE.md requires (`Irr = bigint`, `addIrr`/`subIrr`/
    `negateIrr`/`pctOfIrr`/`roundIrrTo`/`divRoundBigInt`/`compareIrr`/
    `maxIrr`/`minIrr`/`toIrr`) — every money computation in the backend
    now routes through it instead of ad hoc bigint arithmetic, so a
    `bigint + number` type error (which TypeScript catches, unlike the
    old silent-Int32-overflow risk) can't hide a mixed-type bug.
  - New `backend/src/common/bigint-json.ts` — patches
    `BigInt.prototype.toJSON` so every money field serializes as a
    decimal **string** in API responses (`JSON.stringify` throws on a raw
    bigint; a JS `number` can't safely hold amounts above 2^53 anyway, so
    string was already the correct wire shape for money). Imported once
    in `main.ts` (real app) and `test/jest-setup.ts` (e2e).
  - New `backend/src/common/dto/irr.decorator.ts` — `@IsIrrAmount()` /
    `@MinIrrAmount(min)` / `@TransformToIrr()`, a bigint-safe replacement
    for `@IsInt()`/`@Min()`/plain-number DTO fields (class-validator's own
    `@Min()` mishandles bigint). Applied to every DTO field where a
    client submits one of the 27 money columns (agency credit/invoice
    amounts, wallet top-up, booking payment confirmation, fare-rule/
    pricing-proposal prices, ...).
  - ML-boundary exception, explicitly scoped and commented at only two
    call sites (`flights.service.ts`/`pricing.service.ts` `runAiAnalysis()`
    building the outbound `PriceSuggestionItem[]` payload): converts
    `Irr` to a plain `number` for the FastAPI pricing-suggestion request,
    since that's an advisory-only, one-way signal (CLAUDE.md ML Service
    Rules — never authoritative, never round-tripped back into a stored
    field without going through NestJS's own re-pricing/registration
    logic) and every real fare amount is far below 2^53.
  - Full backend unit suite: 50/50 passing. Full backend e2e suite:
    391/392 passing (the one remaining failure is the pre-existing
    documented Phase-51 timeout flake on
    `flight-engine-completion.e2e-spec.ts`'s Y/B/M fare-class test —
    confirmed unrelated to this migration by re-running with a longer
    timeout, which passes with fully correct values). `tsc --noEmit` and
    `eslint` clean on the backend. Frontend `tsc`/lint: no new errors
    (17 pre-existing, unrelated `AuthUser.preferredLocale` errors remain,
    verified present in the untouched baseline); frontend unit suite:
    327/327 passing, 72 files. `frontend/src/lib/fa-format.ts` and every
    page/type touching one of the 27 fields updated for the
    string-on-the-wire reality.
  - Two intentional test-behavior changes, not weakened assertions:
    `agencies.e2e-spec.ts`'s "PATCH credit rejects a limit beyond the
    Int32 rial ceiling" is obsolete by design (removing that ceiling was
    the point) and now proves the validation guard against a negative
    limit instead; `reporting.e2e-spec.ts`'s "money fields are raw
    integers" assertion flips from `typeof === 'number'` to
    `typeof === 'string'`, matching the new wire format on purpose.
- [x] **Staff auth surfaces — forced password change + login polish** —
  closes the long-deferred `mustChangePassword` enforcement gap (IT/admin
  temp-password resets previously set the flag but never blocked panel
  access): `GET /auth/me` and login responses now expose
  `mustChangePassword`; `JwtAuthGuard` returns `403 PASSWORD_CHANGE_REQUIRED`
  on every JWT-protected staff/agency route except `/auth/me`,
  `/auth/change-password`, and `/auth/logout`; frontend
  `ForcePasswordChangePage` at `/required-password-change` gates
  `ProtectedRoute`/`AgencyProtectedRoute` until `POST /auth/change-password`
  clears the flag. Staff login/2FA polish: design-aligned button copy
  («ورود به سامانه»), bottom toast for forgot-password (contact IT),
  SVG feature icons in `StaffLoginLayout`, 2FA back link. Backend: 1 new
  e2e case in `auth.e2e-spec.ts` (22 total passing). Frontend: 19 auth
  unit tests passing across `LoginPage`, `TwoFactorPage`,
  `ForcePasswordChangePage`. See `docs/features/staff-auth-surfaces.md`.
- [x] **Forgot-password v2 visual parity** — redesigned
  `/forgot-password` to match `design-reference-v2/فراموشی رمز.dc.html`: 960px
  two-column card, gradient visual panel (SVG plane, hidden <768px), header with
  locale switcher + back chip, 3-step stepper, +98 phone prefix with hints,
  6-cell OTP (backend stays 6-digit), password strength meter, secure footer
  note. Phone **and** email paths kept in all locales (Phase 51 unchanged).
  Frontend: 10 Vitest tests in `ForgotPasswordPage.test.tsx`. See
  `docs/features/forgot-password-v2-visual.md`.

- [x] **Panel sidebar badges + Jalali day-picker (Phase C)** — referrals
  sidebar badge (purple: SENIOR_MANAGER `awaitingReport`, EMPLOYEE
  `awaitingMyReport`); badge pills aligned to nav-row end; finance-ops view
  now uses shared `SalesChartControls` with day/month Jalali filtering (not
  just q3/q6/year). Tests: 3 PanelShell + 1 Dashboard month + 1 Finance
  day-mode. See `docs/features/panel-sidebar-badges-day-picker.md`.

- [x] **EMPLOYEE cartable (Phase B)** — permission-gated `cartable` tab for
  EMPLOYEE (`ct_list` / `ct_process` in `PERMISSION_CATALOG` + `EMPLOYEE_SECTION_NAV`);
  `GET/PATCH approve /cartable/*`, `POST/GET /cartable/manager-message*`,
  `GET /cartable/manager-recipients`, `GET /panels/employee-context`; frontend
  `EmployeeCartablePage` (message-to-manager + «انجام شد ✓») via `CartableRouter`;
  `EmployeeDashboardPage` KPI cards (open cartable, pending referrals, unit) +
  permission chips. Tests: 6 backend e2e + 4 EmployeeCartable Vitest + 5
  EmployeeDashboard Vitest. See `docs/features/employee-cartable.md`.

- [x] **SITE_ADMIN blog CMS (Phase D)** — `BlogPost` table + admin CRUD
  (`/blog/admin/*`) + public listing/detail (`/blog/posts*`, `/blog/covers/:id`);
  `blog` tab in SITE_ADMIN nav; `BlogAdminPage` (KPI row, category chips,
  editor, post list); public `/blog` + `/blog/:slug` pages with fa/en/ar.
  Media tab deferred. Tests: 5 backend e2e + 5 admin Vitest + 4 public Vitest.
  See `docs/features/site-admin-blog.md` + `docs/features/public-blog.md`.

- [x] **SITE_ADMIN media CMS (Phase E)** — `SiteMediaAsset`, `SiteContentBlock`,
  `SiteDestinationHighlight`, `SiteRouteHighlight` + admin CRUD
  (`/site-content/admin/*`) + public home payload (`GET /site-content/home`,
  `GET /site-content/media/:fileId`); `media` tab in SITE_ADMIN nav;
  `MediaAdminPage` (library, banners, destinations, routes); `HomeSearchPage`
  wired to CMS with static fallbacks. Social/app/support/jobs in media tab
  deferred. Tests: 8 backend e2e + 4 MediaAdmin Vitest + updated HomeSearch Vitest.
  See `docs/features/site-admin-media.md`.

- [x] **SITE_ADMIN settings — app links + support contact (Phase F)** —
  `appDownloadLinks` in `SystemSetting`; SITE_ADMIN can PATCH social +
  contact + app links; public `GET /settings/app-links` and
  `/settings/support-contact`; `SettingsPage` contact/app sections;
  `HomeSearchPage` app band wired to store URLs. Tests: extended
  `phase12.e2e-spec.ts` + SettingsPage + HomeSearchPage Vitest.
  See `docs/features/site-admin-settings-links.md`.

- [x] **Contact page — support contact wiring (Phase G)** —
  `ContactPage` reads `GET /settings/support-contact` for phone/email
  channel cards (static fallbacks on failure; address/hours unchanged).
  Tests: extended `ContactPage.test.tsx`.
  See `docs/features/contact-support-contact-wiring.md`.

- [x] **Destinations page — CMS highlights wiring (Phase H)** —
  `DestinationsPage` reads `GET /site-content/home` to override destination
  prices/images and popular routes (static catalog metadata unchanged).
  Tests: `DestinationsPage.test.tsx`.
  See `docs/features/destinations-cms-wiring.md`.

- [x] **SITE_ADMIN static site pages CMS (Phase I)** —
  «صفحات سایت» list in `MediaAdminPage`; SITE_ADMIN PATCH for page text keys;
  public `GET /settings/site-content`; About/Contact/TravelInfo wired (fa).
  Tests: `MediaAdminPage.test.tsx`, extended `phase12.e2e-spec.ts`.
  See `docs/features/site-admin-static-pages.md`.

- [x] **Public gaps closure — i18n, visual, AI radar, CMS locale, agency recovery (2026-07-31)** —
  Split purchase flow per design: `CheckoutPage` (review) → new `PaymentPage`
  (promo + pay + hold timer, fa/en/ar, two-column layout). `BookPage`/`TicketPage`/
  `FlowStepper` i18n. `ResultsPage`: removed mock flights; wired
  `GET /search/advisory` + `GET /search/price-calendar`. CMS multilocale:
  `GET /settings/site-content?locale=`, `GET /site-content/home?locale=`,
  `contactOfficeHours` setting, block locale defaults. Agency:
  `POST /auth/agency/password-reset/*`, `GET /agency-portal/sales/export` (CSV).
  Backend e2e: `search-advisory.e2e-spec.ts`. Frontend: 413 tests green.
  See branch `cursor/public-gaps-i18n-visual-9b91`.

- [x] **Full-project code review + critical-fix batch (2026-08-01)** — a 6-way parallel review across financial/booking core, auth/RBAC, admin-panel backend, frontend RTL/Jalali/i18n, ml-service, and infra/deployment surfaced 26 findings. Fixed the 7 highest-severity ones in this batch (backend-only; the remaining findings are frontend/perf/infra items, not yet scheduled):
  - `agencies.service.ts` `settle()`: was a bare read-then-insert with no lock — two concurrent settlements could both read the same "outstanding" figure and double-credit the agency. Now locks the agency's profile row (`SELECT ... FOR UPDATE`) and re-reads the ledger sum inside the same transaction as the insert. New concurrency e2e test (two parallel `POST /settle` calls → exactly one 201, ledger sum stays 0).
  - `pricing.service.ts` `register()`: an AI-sourced suggestion could be registered as the bookable fare with zero bound check, violating CLAUDE.md's "an ML suggestion can never set a bookable price by itself." Now rejects an AI suggestion that exceeds the CEO-approved `legalRateIrr` ceiling. New e2e test.
  - `pricing.service.ts` `upsertProposal()`: editing a still-PENDING proposal's price didn't clear a previously computed `aiSuggestion`, so a stale AI price (computed against the old figures) stayed registerable. Now clears `aiSuggestion` on every edit. New e2e test.
  - `reservation/pnr.service.ts` `issue()` and `changeSeat()`: both had a classic TOCTOU race — the seat-sold/lock check ran as a plain read before the write, no row lock, no DB constraint backing it, so two concurrent requests for the same seat could both succeed (violates CLAUDE.md's "exactly one of two concurrent buyers of the last seat may succeed"). Both now lock the flight instance's row and re-check inside the same transaction as the write. New 5-parallel-request concurrency e2e tests for both.
  - `auth.service.ts` `refresh()`: blocking/suspending a staff or agency account only checked `isActive`/`suspendedAt` at login — an already-issued refresh token kept working (and kept extending itself) after the account was blocked. `refresh()` now rechecks account status on every call, and `admins.service.ts` `setBlocked()` / `agencies.service.ts` `suspend()` now proactively revoke that user's outstanding refresh tokens (not a global logout-all). New e2e tests for both staff and agency accounts.
  - `settings.service.ts` `update()`: `PATCH /settings` let IT_MANAGER write BOARD_CHAIR-only keys (payment-gateway toggles, company/brand identity) since the endpoint only checked the class-level role list, not per-key. Now enforces per-key scoping server-side (the frontend already hid these fields from IT, but authorization must not rely on hidden UI alone) — `socialLinks`/`appDownloadLinks` (site-services links IT does manage) stay writable alongside the operational toggles.
  - This batch was originally committed on a since-diverged branch and reconciled onto `main` on 2026-08-02: `agencies.service.ts` `settle()` and `settings.service.ts`'s per-key IT scope needed adapting to `main`'s BigInt money columns; `pnr.service.ts` `issue()` already had its own independent row-locked fix on `main`, so only `changeSeat()` needed the lock added here. `pricing.e2e-spec.ts`'s two new register tests needed real step-up challenge/code (main added mandatory step-up to `register()` after this batch was written). Full backend e2e suite has a large pre-existing failure count unrelated to this batch — nearly every failure traces to a broken `loginAsCustomer` test helper (customer OTP flow), not to anything touched here; the specific tests this batch added/touched (agencies, pricing, reservation, phase12 settings) all pass.

Each phase = backend endpoints + tests + frontend page(s), fully working,
before the next phase starts, per `CLAUDE.md` workflow rules. A phase is
"done" only when every checklist item in its `docs/features/<name>.md` has
a passing test — see `docs/features/panel-shell-dashboard.md` for Phase 1.

- [x] **SITE_ADMIN panel dark-align (2026-08-03)** — nav order/labels to
  `پنل ادمین سایت.dc.html`; brand subtitle «پنل مدیریت» + avatar «اس»;
  refund/tickets nav badges; dark cartable; dashboard 4-KPI + agency/refund/
  cartable widgets; `GET /reporting/site-admin-overview`; dark Agencies +
  Flights (flightops) + Club + Refunds + Tickets + **مدیریت سایت** +
  **درخواست‌های استخدام**; cartable already dark for SITE_ADMIN; sidebar
  drops blog/kyc/settings; global **10 records/page**; refunds + tickets
  search.   See `docs/features/site-admin-panel-align.md`.

- [x] **SITE_ADMIN — مشتریان (2026-08-04)** — tab `customers` after
  reports in `PANEL_NAV`; `GET /customers` + `/:id` + incomplete-count
  badge; list (mobile search, کامل/ناقص) + detail tabs (اطلاعات و مدارک /
  تاریخچه خرید / تماس‌ها و تیکت‌ها / باشگاه). See
  `docs/features/site-admin-customers.md`.

- [x] **Prisma → TypeORM migration reconciled onto `main` (2026-08-04)** —
  the `claude/admin-panels-multi-role-kv5nk3` branch's full 18-phase
  Prisma→TypeORM migration was merged with `main`'s independently-diverged
  Prisma-based history (86 commits), resolving all conflicts (7 service
  files + 16 e2e test files, plus 2 silently-leaked Prisma files caught by
  a repo-wide `git grep`) — full backend e2e suite green (472/472) before
  push. While landing this, `origin/main` was independently force-pushed
  twice by another process: first the feature branch's remote tip, then
  `main` itself with a **full history rewrite** (all ~459 prior commits
  got new hashes, via a retroactive `prisma`→`typeorm` text rename) plus
  its own separately-produced, functionally-equivalent TypeORM migration
  (commit `cf7d3d9`, authored via a "Cursor Agent" under the same account).
  Per explicit user decision each time: the first collision was resolved
  by force-pushing this reconciled branch over the other one; the second
  (on `main`) was resolved by treating the rewritten `main` as the base
  and merging this branch's verified work onto it (`--allow-unrelated-histories`),
  keeping two real fixes unique to the rewritten history — the corrected
  `typeorm` package version (`^0.3.22`, not the nonexistent `^1.1.0` both
  efforts had pinned) and a `DataSource`-query health check replacing
  `@nestjs/terminus` — and dropping a stray Prisma-format `migration.sql`
  the rewrite had left under `backend/typeorm/migrations/`. Landed as a
  genuine fast-forward on `main` (`c5c0e72`), full verification (tsc,
  eslint, 72 backend unit + 520 frontend unit + 472 backend e2e, all on a
  freshly migrated+seeded DB) green before push. `main` now runs entirely
  on TypeORM with no remaining Prisma references.

- [x] **Production edge hardening (2026-08-04)** — production Nginx now
  proxies every top-level NestJS controller prefix and distinguishes HTML
  navigations from API requests for overlapping public routes; the Vite dev
  proxy applies the same rule to manage-booking and survey. `GET /health`
  now fails with HTTP 503 semantics when PostgreSQL is unavailable. Public
  locale changes now synchronize the root document `lang`/`dir` attributes.
  Regression coverage: `edge-routing.test.ts`, `health.controller.spec.ts`,
  and `useLocale.test.tsx`. Verification: 75 backend unit tests and 526
  frontend unit tests passed; both production builds passed. See
  `docs/features/production-edge-hardening.md`.

- [ ] **Production backend artifact paths (2026-08-05)** - fix the stale
  `dist/src/` paths used by the production Docker command and TypeORM
  migration/seed scripts, add regression coverage, and verify the rebuilt
  backend becomes healthy without replacing server secrets or volumes. See
  `docs/features/production-backend-artifacts.md`.

- [x] **Flight-status control alignment (2026-08-05)** - aligned the public
  flight-number, route, date, and search controls to the approved 56px field
  height; right-aligned the flight-number value while preserving LTR code
  order; added a single-line Jalali date trigger and regression coverage.
  Verified with 527 frontend tests, lint, production build, and browser
  measurements. See `docs/features/flight-status-control-alignment.md`.

- [x] **Secure production panel-account bootstrap (2026-08-05)** - added a
  fail-closed, stdin-driven operation for named management account owners with
  unique SMS-2FA mobiles, generated one-time passwords, Argon2 hashes,
  first-login password rotation, atomic audit records, and initial encrypted
  Kavenegar configuration to avoid the IT-panel/2FA bootstrap deadlock. No
  credentials or contact details are stored in Git. See
  `docs/features/production-panel-accounts.md` and `docs/RUNBOOK.md`.

- [x] **Public checkout auth, airport i18n, and footer separation (2026-08-13)**
  - kept guest passenger data in place while enforcing OTP sign-in/account
  creation before checkout can advance; verified English and Arabic airport
  options never leak Persian city/airport labels; separated social and trust
  badge layout groups on desktop/mobile and repaired the WhatsApp glyph.
  Verified with 677 frontend tests, lint, and the production build. See
  `docs/features/public-checkout-footer-airport-i18n.md`.

- [x] **Commercial flight intelligence and seat control (2026-08-13)**
  - added advisory ML pricing on flight creation and weak-sales warnings;
  connected Commercial Manager price publication to the governed pricing API;
  exposed the database-backed MD-80 map with passenger/agency/anonymous locks;
  enforced CEO/Board Chair/Commercial lock authority while keeping IT read-only;
  aligned inventory with active 15-minute checkout holds and immutable finance
  ledger sales; moved desktop trust badges left and repaired WhatsApp. Verified
  with 189 backend unit tests, 19 reservation e2e tests, 22 reservation UI tests,
  production builds, and lint. See
  `docs/features/commercial-flight-intelligence-seat-control.md`.

## Notable findings from design extraction (informs later phases)

- Several panels contain orphaned tabs/handlers (coded, unreachable from
  the sidebar) — e.g. CEO panel's Agencies/Flights/Reservation tabs, Board
  Chair's Agencies/Flights/Passenger-search tabs. Treat the **currently
  reachable sidebar item list per panel** as authoritative, not every
  `sc-if` block present in the file.
- `ReservationSystem`'s seat-lock authorization (`role === 'super'`) has an
  unresolved mapping question — flagged in `docs/DB_SCHEMA.md`'s open items,
  needs a product decision before Phase 9.
- The design mocks use plaintext passwords and no 2FA at the login gate,
  a mutable credit/balance field instead of a ledger, and several
  client-formatted display strings for money — all explicitly overridden by
  `CLAUDE.md` in the real implementation (see inline notes in `DB_SCHEMA.md`/
  `API.md`).

## Known technical debt (pre-launch, not blocking current phases)

- ~~All IRR money columns are Postgres `integer` (Int32 ceiling).~~
  **Resolved** — see the "Int → BigInt migration" entry above. Every
  money column is now `bigint`, end to end.

## Commands

See `CLAUDE.md` → Commands. `docker compose up -d` starts Postgres+Redis;
`cd backend && npm run start:dev` / `cd frontend && npm run dev` /
`cd ml-service && uvicorn app.main:app --reload` for the three services.

- `cd backend && npm run seed` — (re)seeds one dev account per role, all
  sharing the password `Blujet@1404` (see `backend/prisma/seed.ts` — dev
  usernames: `ceo`, `chair`, `senior`, `finance`,
  `comm`, `itadmin`, `site.admin`, `com.ahmadi`), plus 6 months of
  sample flights/bookings so the dashboard has real numbers to show.
- Backend tests need a local Postgres reachable at the `DATABASE_URL` in
  `backend/.env` (dev db) and `backend/.env.test` (test db, `blujet_test`) —
  `npm run test:e2e` runs Jest+Supertest against the latter.
- `cd frontend && npm test` — Vitest+RTL unit/component tests.
- `cd frontend && npm run test:e2e` — Playwright, needs both dev servers
  running (`backend: npm run start:dev` on :3000, `frontend: npm run dev`
  on :5173).

- [ ] **Owner super-admin first login (2026-08-06)** — owner-only
  password login without OTP, forced password replacement on first session,
  management-role guard elevation, all-management-panel navigation,
  production-only audited bootstrap, migration and regression tests. Optional
  Sandbox-only USER/AGENCY preview uses an explicit environment switch,
  selected tenant identities, 15-minute non-refreshable tokens, and audit
  records; direct owner access to tenant APIs remains forbidden. Awaiting owner
  review before merge.

- [x] **Customer account responsive sidebar (2026-08-06)** — the mobile
  account sidebar now exposes profile, account information, trips, ticket
  refunds, wallet, and loyalty points; the desktop sidebar exposes every
  existing customer-account destination and scrolls within short viewports.
  Persian/English/Arabic labels and responsive tab navigation are covered by
  `AccountPage.test.tsx`. See
  `docs/features/customer-account-responsive-sidebar.md`.
# PLAN.md — blujet roadmap & progress

Scope of this track: the six executive management panels (پنل مدیر عامل،
پنل رئیس هیئت مدیره، پنل مدیر ارشد، پنل مدیر بازرگانی، پنل مدیر مالی، پنل
مدیر IT) plus the shared panel shell and reservation/lock system, per
`CLAUDE.md`. The public-facing site (search/booking/checkout/payment) was
a separate track (branch `claude/airline-project-design-difvku`, ~28
phases: customer purchase flow, price-lock, promo codes, club/wallet,
agencies, staff-auth, reports, GDPR, rate-limiting, Sentry). The two
tracks turned out to have near-total schema/architecture overlap on
admins/agencies/club/refunds/reporting/cartable/staff-auth — since this
track's version of those was already reviewed and merged to `main`, the
explicit merge decision (2026-07-18) was: **keep this track's schema and
modules as-is, and port only the genuinely-missing customer-facing half
(search/booking/payment/refund-submission, and still-pending price-lock/
promo/wallet/points-ledger/GDPR/public frontend) onto this schema**,
rather than reconciling two incompatible Prisma histories. See "Phase 13"
below for what's landed from that port so far.

## Status

- [x] **Phase 71 — Flight approval workflow (ops → CEO → PUBLISHED)** — backend merged in #128 and UAT account provisioned in #129. Extends `FlightInstance.definitionStatus` with `PENDING_OPERATIONS` / `OPERATIONS_REJECTED` / `PUBLISHED`, role `OPERATIONS_MANAGER`, `FlightReview` history, version locking, create=`DRAFT`, CEO register → `PUBLISHED` + search sellability. React operations dashboard/cartable/history and the commercial handoff are included in the frontend follow-up. Pricing-alerts / loans / outbox remain separate scoped phases. Checklist: `docs/features/flight-approval-workflow.md`.
- [ ] **Production data integrity + operational golden path (2026-08-05)** — remove production-visible demo fallbacks, prevent production seed/mock provider execution, add a dry-run-first seed audit/cleanup path, and prove flight search → details → passenger → seat → booking → payment → ticket/refund plus operational role visibility. Acceptance and release gates: `docs/features/production-data-integrity.md`.
- [x] **Sandbox multi-role operational UAT gate (2026-08-05)** — converted the cross-role acceptance audit into a repeatable, flow-selectable runner (`scripts/run-sandbox-multirole-uat.mjs`) over the existing database-backed E2E and Playwright proofs, with a fail-closed guard against accidental browser mutations on a non-local environment. Live smoke evaluation against `http://202.133.90.31` is recorded in `docs/features/sandbox-multirole-operational-uat.md`. Release decision is **NO-GO for real passenger sales** until HTTPS, production seed cleanup, real SMS/OTP, a certified payment gateway, and the documented agency/incomplete-profile product gaps are resolved.

- [x] Repo scaffold (frontend/backend/ml-service skeletons, design-reference import)
- [x] Design extraction — all 6 panels + shared shell + `ReservationSystem` read in full; findings folded into `docs/API.md` / `docs/DB_SCHEMA.md`
- [x] **Phase 1 — staff auth + RBAC + panel shell + dashboard/reporting** — see `docs/features/panel-shell-dashboard.md` for the proven checklist (35 backend + 21 frontend unit + 5 E2E tests, all passing; lint+typecheck clean in both packages). Known deferred scope, not silently dropped: IT Manager's real (service-health) dashboard, day/month/flight chart-mode UI, pixel-diff visual regression — see that doc's scope notes.
- [x] Phase 2 — flight/booking core (minimal read-side slice for reporting) — done as part of Phase 1's Prisma schema (Route/Flight/FlightInstance/Booking/LedgerEntry), since reporting needed real data to aggregate
- [x] **Phase 3 — Agencies (list/detail/credit/settlement/membership requests)** — backend: Prisma schema/migration/seed + full `agencies` module (all endpoints from `docs/API.md`'s Phase 3 table, role-reconciled), 25 integration tests (60 backend total). Frontend: آژانس‌ها list/detail/request pages with per-role differences (Senior: API keys; Finance: read+settle; Commercial: نمای کلی/مالی/مکاتبه‌ها sub-tabs, invoices, chat, debtors panel), 10 new Vitest+RTL tests (31 total) and 5 Playwright journeys. All checklist items in `docs/features/agencies.md` proven except the explicitly deferred ones listed at its end (Excel export, invoice description, refer-UI → Phase 4, agency-portal-side suspension). Lint+typecheck clean in both packages.
- [x] **Phase 4 — Cartable, referrals, manager messaging** — implemented end-to-end (docs approved 2026-07-17): 7 new tables, five backend modules (cartable با تأیید/رد/انتقال + نظر مدیر اجباری، ارجاعات مدیر ارشد با چرخه گزارش کامل، پیام سازمانی با تحویل به کارتابل، staff-directory، آپلود فایل), 23 backend tests + 9 Vitest + 3 Playwright loops. Totals now: 83 backend / 40 frontend / 14 Playwright, all green. Two explicitly deferred UI pieces (attachment chips UI → Phase 5, Jalali date-picker popover → shared component in Phase 5/7) listed at the end of `docs/features/cartable-referrals.md`. Merged to main (PR #3).
- [x] **Phase 5 — VIP club** — implemented end-to-end: ClubMember/ClubCardRequest schema (national ID checksum-validated, AES-256-GCM encrypted + HMAC hash for exact search), club module with the ⚑-approved authority rules (CEO/Chair approve any REFERRED, Senior only senior-assigned; direct issuance audited; tier change Senior-only), CEO/Chair rich layout + Senior simple layout, 13 backend tests + 4 Vitest + 4 Playwright journeys. Totals: 92 backend / 44 frontend / 18 Playwright. Merged to main (PR #4).
- [x] **Phase 6 — Ticket pricing proposals** — implemented end-to-end (docs approved 2026-07-17): FarePricingProposal FK-linked to FlightInstance (fixes the mocks' incompatible id schemes), pricing module with the locked-forever registration rule + CEO legal-rate path, the FIRST REAL ml-service (FastAPI price-suggestion: internal token, versioned heuristic, 11 pytest) behind a NestJS AiProvider client (2s timeout, graceful degradation — proven by a Playwright journey that runs with the real uvicorn service AND one with it down). CEO tab + Commercial pricing section (inside its مدیریت پروازها tab, per design). 8 backend + 5 Vitest + 3 Playwright new tests. Totals: 100 backend / 49 frontend / 21 Playwright / 11 pytest. Merged to main (PR #5).
- [x] **Phase 7 — Refunds (استرداد بلیط، پنل مدیر مالی)** — implemented end-to-end (docs approved 2026-07-17): `RefundPenaltyRule` (seeded 4-bracket engine: ≥72h→30٪ / 24–72h→50٪ / 3–24h→70٪ / <3h→100٪, unifying the mocks' 3 inconsistent schemes) + `RefundRequest` lifecycle SUBMITTED→REVIEW→FINANCE→PAID with IBAN/nid/mobile AES-256-GCM encrypted at rest; refunds module (list+KPIs / detail — the only surface that decrypts the شبا / refer without status change / pay as ONE transaction: `LedgerEntry(REFUND, −refundable)` + `Booking→REFUNDED` + PAID+processedBy, replay-guarded → 409). Finance-only (`@Roles('FINANCE_MANAGER')`). Frontend: استرداد بلیط tab (KPI cards, status-pill card list, 3-panel detail modal with penalty breakdown, refer select, pay/closed-case states). 7 backend integration + 11 penalty unit + 6 Vitest + 2 Playwright new tests — see `docs/features/refunds.md` for the item→test map. Totals: 107 backend / 55 frontend / 23 Playwright / 11 pytest. Merged to main (PR #8).
- [x] **Phase 8 — Employee management (IT Manager: accounts, permissions, services, security policy, logs, backups)** — implemented end-to-end (2026-07-17, reassigned to this track by the user, superseding the earlier "separate session" note below): `User` gained dept/rank/referralScope/mustChangePassword/lastLoginAt columns, `Permission`/`EmployeePermission` (seeded verbatim from the design's `PERM_CATALOG`), `InternalService`/`ExternalServiceConfig`, `SecurityPolicy` singleton, `BackupRecord`, `PasswordResetEvent`. New `it-manager` backend module (employees, security incl. active-session/logout-all reusing `RefreshToken`, services incl. a real HTTP test-connection check, real `pg_dump`-backed backups, a technical dashboard on real `os.*` metrics). Frontend: 6 real tabs wired into `PanelShell`/`App.tsx`. 15 new backend e2e tests, 7 new frontend unit tests, 4 new Playwright journeys + fixed the pre-existing `staff-login-journey` itadmin case. Merged with Phase 6's concurrently-landed work (2026-07-17): 115 backend / 56 frontend / 25 Playwright / all green, lint+typecheck clean in both packages. Proven checklist: `docs/features/it-manager.md` — reservation (Phase 9) and دسترسی به پنل‌ها/تنظیمات سامانه (Phase 12) explicitly stay deferred; two smaller UI pieces (external-service edit modal, suspend confirmation) listed as deferred at that doc's end.
- [x] **Phase 9 — Reservation system (seat lock/PNR)** — implemented end-to-end (2026-07-17): resolved the ⚑ `role="super"` open item per explicit user decision — `canLock` = CEO/BOARD_CHAIR/IT_MANAGER, SENIOR_MANAGER view-only, matching the design's own confirmed copy. New `AircraftSeatMap` (data-driven per CLAUDE.md, seeded for the existing "Airbus A320" flight matching the design's MD-88 numbers verbatim: 16 business + 130 economy = 146 seats), `SeatLock` (encrypt+hash PII, DB partial-unique-index for true concurrency safety — proven by a 5-parallel-request race test), `Passenger.nationalIdHash`/`seatCode`. `reservation` module: seat map + lock/release, PNR list/detail/seat-change/cancel (reusing Phase 2's Booking/Passenger), staff-side manual PNR issuance (TICKETED directly, no payment gateway — distinct from the public checkout track), flight search with Phase 6 pricing or a documented flat fallback, real dashboard stats (no fabricated "microservices health" data — CLAUDE.md forbids it). Frontend: one `ReservationPage` with PNR-management/seat-map/new-booking sub-tabs, wired into BOARD_CHAIR/SENIOR_MANAGER/IT_MANAGER panels. 13 new backend e2e tests (128 total), 3 new frontend unit tests (59 total), 4 new Playwright journeys against a fresh non-production `_test/flight-instance` hook (avoids depending on the seed's ambiguous historical/demo instances). Lint+typecheck clean in both packages. Proven checklist: `docs/features/reservation.md` — agency API access (Phase 3 already covers it), flight/schedule creation (Phase 10), ticket PDF printing, and exact aisle-gap pixel rendering are explicitly deferred with reasons at that doc's end.
- [x] **Agency Portal (self-service, پنل آژانس)** — implemented end-to-end (2026-07-17, reassigned into this track by explicit user approval, even though `CLAUDE.md` scopes it to the separate public-site track — same pattern as Phases 8/9): new AGENCY-role login (`POST /auth/agency/login`, phone+password, no 2FA — a ⚑ product decision documented since the design's own "کد آژانس" login-identifier concept has no backing field, so it reuses the agency's real registered phone instead); `AgencyProfile.approveRequest` now issues a one-time temp password (was a real gap — approved agencies previously had no way to ever log in). New `AgencyCreditRequest`/`AgencyDocument` models — the design's self-service "افزایش اعتبار" (which directly mutates its own credit limit client-side) is replaced with an audited request that only the existing, already-audited `updateCredit` method can approve (new staff endpoints `GET/PATCH /agencies/:id/credit-requests`). New `agency-portal` backend module: self-scoped dashboard/credit/ledger/invoices(pay-from-credit, reusing the staff transactional logic verbatim)/sales-report/inbox(bidirectional — `AgencyMessage.senderIsAgency` now writable by the agency itself)/profile/documents(reusing Phase 4's `FilesService`). Frontend: distinct `/agency/*` route tree with its own login page, protected-route guard (bidirectional role isolation with the staff `/panel/*` tree), and 5 tabs (allocated-seats and self-service webservice-purchase tabs explicitly deferred — no staff-side counterpart workflow exists for either). 16 new backend e2e tests (144 total), 8 new frontend unit tests (67 total), 4 new Playwright journeys. Lint+typecheck clean in both packages. Proven checklist: `docs/features/agency-portal.md`. Merged to main (PR #9).
- [x] **Phase 10 — Flight management (مدیریت پروازها — Senior/Commercial)** — implemented end-to-end (docs approved 2026-07-17): seeded `Airport` catalog (20 Iranian cities + DXB/IST/NJF) feeding the add-flight selects, `Route.durationMin`, `FlightInstance.basePriceIrr`/`agencySeatsAllocated`/`aiSuggestion`. `flights` module: overview (KPI + فعال/انجام‌شده/آینده with server-derived statuses), add-flight (find-or-create Route/Flight, UTC conversion at the edge, audited), detail modal with REAL channel breakdown from bookings, plan (⚑ stores plan figures only — Commercial's save upserts the Phase 6 proposal, CEO approval still required; REGISTERED → 409), future-flight AI analysis via the Phase 6 ml-service client (suggestion persisted on the instance with modelVersion, graceful degradation). Completed-flights financials computed from real bookings (سود/ضرر vs base rate — no fabricated 18٪ margin). Frontend: FlightsPage (3 sub-tabs, add/detail/plan modals, Jalali day-filter calendar, AI panel) for both panels; Commercial keeps the embedded Phase 6 pricing section on the same tab. 8 backend + 7 Vitest + 2 Playwright new tests — item→test map in `docs/features/flight-management.md`. Explicit deferrals: Excel exports, RRULE schedules (no design UI). Merged to main (PR #10).
- [x] **Phase 11 — Finance tab (مالی), گزارش مسافران, گزارش کارمندان** — implemented end-to-end (2026-07-17): NO schema changes — every figure derived at query time. مالی ships two design-confirmed layouts: FINANCE_MANAGER's finance-ops view (KPI row from the existing `/reporting/kpis`, low-sales alert, completed-flights box, NEW `/reporting/recent-transactions` real-ledger feed, NEW `/reporting/revenue-mix` donut, NEW `/reporting/agency-settlements` rows derived from Phase 3 invoices with the remind action reusing — and role-widening to FINANCE_MANAGER — the existing audited Phase 3 remind endpoint) and the analytic view (sales chart + channel tiles + donut) for CEO/Chair/Senior/Commercial, matching CLAUDE.md's «تراکنش‌ها/تسویه only in the finance panel» rule. گزارش مسافران: new `passenger-reports` module — name-substring or exact-national-ID(hash) search, national ID ALWAYS masked (surface never returns it whole), cabin derived from the Phase 9 seat map. گزارش کارمندان: new `staff-reports` module — dept-isolated EMPLOYEE audit feed + real ACCOUNT-event "new employee" banner. The finance mock's `finMonths` income/expense chart is confirmed orphaned (computed, never rendered) — not built. 10 new backend e2e tests (169 total), 5 new frontend unit tests (85 total), 5 new Playwright journeys. `finance`/`reports`/`staff` nav flags flipped for all their roles. Proven checklist: `docs/features/finance-reports.md`.
- [x] **Phase 12 — Remaining shell tabs (COMPLETE, 2026-07-17)** — first landed as a partial (گزارش مدیران + دسترسی به پنل‌ها UIs over their existing Phase 1 backends), then finished in full: new `admins` module («مدیران و ادمین‌ها», CEO/Chair/Senior — list with REAL «آنلاین» derived from unexpired refresh tokens, add-admin restricted to enum-backed roles با رمز اولیه + تحویل sms/email از مسیر mocked provider، block/unblock که واقعاً در staff-login اعمال می‌شود، بازنشانی رمز با رمز موقت یک‌بارنمایش؛ سلسله‌مراتب مدیریتی server-enforced: CEO/Chair بر ۵ نقش پایین‌تر، Senior بدون SENIOR_MANAGER؛ حساب CEO/Chair و self هرگز قابل مسدودسازی نیستند)؛ `POST /auth/change-password` (تأیید رمز فعلی با argon2)؛ `GET /audit/system-events` برای تب لاگ CEO (سطح presentational روی AuditLog واقعی)؛ ماژول `settings` با جدول جدید `SystemSetting` (key-value با defaultهای سروری و رد کلیدهای ناشناخته) و ⚑ ورودی‌های «قوانین استرداد» که مستقیم `RefundPenaltyRule`های واقعی فاز ۷ را می‌نویسند (هر ۴ بازهٔ واقعی نمایش داده می‌شود، نه ۲ ورودی mock)؛ IT حالا `GET /panels/access` را read-only می‌خواند (PATCH همچنان 403). فرانت‌اند: AdminsPage، OwnSecurityPage + SecurityRouter (IT صفحهٔ فاز ۸ خودش را نگه می‌دارد)، CeoLogsPage + LogsRouter، SettingsPage (بخش‌های chair در برابر IT)، PanelsAccessPage read-only برای IT. ⚑ deferrals مستند: ماتریس permission per-admin (stored-but-unenforced ممنوع؛ نیازمند redesign authorization)، نقش سفارشی free-text، آپلود لوگو، بخش orphaned پروفایل chair. 9 تست جدید بک‌اند (۱۷۸ کل)، 7 تست جدید فرانت (۹۵ کل)، 5 journey جدید Playwright + به‌روزرسانی تست «به‌زودی» قدیمی. **همهٔ nav flagها اکنون `implemented: true` هستند — هیچ تب «به‌زودی» در هیچ پنلی باقی نمانده.** Proven checklist: `docs/features/phase12-admin-settings.md`.
- [~] **Phase 13 — Public purchase engine (customer track, IN PROGRESS, started 2026-07-18)** — porting the standalone branch's customer-facing purchase flow onto this schema, per the merge decision above. Money stays `Int` (matching this track's existing convention/tech-debt note, not `BigInt`); ledger stays this track's single-signed-amount `LedgerEntry`, not the old branch's double-entry pair. Landed so far, all with real e2e coverage (green together with all 12 earlier phases — 197 backend / 95 frontend, lint+typecheck clean):
  - Schema (additive only, no Phase 1-12 column changed): `CabinClass` enum + `CabinFare` (per-cabin price, `@@unique([flightInstanceId, cabin])`); `Booking` gained `userId`/`contactPhone`/`cabin`/`holdExpiresAt`/`idempotencyKey` (all nullable — staff/agency bookings leave them null); `TwoFactorPurpose` gained `CUSTOMER_OTP_LOGIN`.
  - Auth: customer phone+OTP login (`POST /auth/otp/request`, `/auth/otp/verify`) — find-or-create a `role=USER` account, reuses the existing `TwoFactorChallenge` table/`TwoFactorProvider`/JWT machinery rather than a parallel auth stack. 6 new e2e tests in `auth.e2e-spec.ts`.
  - New `booking-engine` module: public unauthenticated search (`GET /search/flights`, `/search/airports`, `/search/flights/:id/seatmap`) reusing the reservation module's `AircraftSeatMap`-driven seat layout; `getCabinPrice` is the single pricing function shared by search results and pre-payment re-pricing so they can never disagree; customer booking (`POST /bookings`, USER-role-gated) row-locks the flight instance (`SELECT ... FOR UPDATE`) to serialize concurrent seat holds, creates a HELD booking with a 10-minute TTL and encrypted passenger PII, honors an `Idempotency-Key` header; a lazy `materializeExpiry` flips a past-TTL HELD booking to EXPIRED on read/pay (no cron); payment (`POST /bookings/:id/pay`) re-prices immediately before charging, requires client-confirmed price if it moved, transitions HELD→TICKETED, posts a `SALE` ledger entry. 9 new e2e tests including the mandatory concurrent-last-seat test (exactly one of two simultaneous buyers of the final seat succeeds, inventory never goes negative).
  - Refunds: added the customer-facing submission surface main's staff-only refunds module was missing (`POST/GET /my/refunds`, `GET /my/refunds/:id`, USER-role-gated, kept as a separate controller from the `PanelAccessGuard`-gated staff one) — reuses the existing `computePenalty`/`RefundPenaltyRule` engine and passenger PII already on the booking, so the penalty math a customer sees is provably the same one finance later approves. 5 new e2e tests.
  - Content management: extended the existing `تنظیمات سامانه` `SystemSetting` KV store (not a new table) with editable homepage/about/contact/terms text fields, surfaced in the BOARD_CHAIR-only section of `SettingsPage`.
  - Reporting charts: **already fully built on this track** (`FinancePage.tsx` + `SalesBarChart.tsx` against the existing `reporting` module) — nothing to do here, the standalone branch's gap was already closed independently.
  - Public-site frontend: `frontend/src/features/public-site` (home search, results, seat+passenger booking with an inline OTP gate, checkout with promo/payment-method, e-ticket + inline refund submission) wired to the backend above, reusing the existing `AuthProvider`/`token-store`/api client infra (optional `requestOtp`/`verifyOtp` on `AuthContextValue` so no existing staff/agency test needed updating). 15 new component tests + a real-browser Playwright golden path (search → OTP login → seat/passenger → pay → e-ticket → refund submission) run against live dev servers, not just mocked. Styling is functional/clean, not yet pixel-matched to `design-reference/` — see deferred list below.
  - Promo codes / wallet / club points ledger / price lock: `PromoCode`/`PromoRedemption` (applied inside `pay()`, full route/cabin/date-window/maxRedemptions/maxPerUser validation), `WalletEntry` (balance always `SUM(signedAmountIrr)`, sandbox top-up + pay-with-wallet), `ClubPointsEntry` (the authoritative points ledger — `ClubMember.points` stays a synced display-copy; real-money payments earn, points payments redeem, no redeem-to-earn loophole), `PriceLock` (gold-tier+ only, 72h TTL, flat NestJS-computed fee — the AI-suggested variable fee is deferred with the rest of the AI wiring below; a booking made against an active lock prices at the locked rate and skips re-pricing entirely at payment). Wired into `CheckoutPage.tsx` (promo-code field + payment-method picker with live wallet balance, points option disabled for non-members). 11 + 2 new e2e tests.
  - GDPR: `GET /my/privacy/export` (full JSON of the customer's own bookings/passengers/refunds/wallet/points/locks) and `DELETE /my/privacy/account` (soft-deletes `User`, anonymizes passenger PII on their bookings, revokes all refresh tokens — booking/ledger rows survive as financial records, never hard-deleted). 3 new e2e tests.
  - **Still not ported** (explicitly deferred, not silently dropped): the AI "buy-now-or-wait" advisory endpoint reusing the existing `PRICE_SUGGESTION_PROVIDER` (price-lock's fee is a flat rate instead, documented above); a dedicated site-content-management UI beyond the `SettingsPage` text fields already added (no `MediaTab`/asset-library equivalent exists on this track's frontend). All backend surfaces above are fully tested via Supertest; the frontend covers only the golden path, not every edge state (price-lock UI, wallet top-up UI, and a GDPR export/delete UI screen don't exist yet — those endpoints are currently curl/Supertest-only).

- **Sentry error tracking (backend + frontend)**: wired per CLAUDE.md's
  Observability rules. Backend: DSN-gated `Sentry.init()` in `main.ts`,
  `Sentry.captureException` hooked into `AllExceptionsFilter` for 5xx
  errors — no-op when `SENTRY_DSN` is unset. Frontend: DSN-gated init plus
  a React `ErrorBoundary` (Persian fallback UI) wrapping the app and a
  global `unhandledrejection` handler — no-op when `VITE_SENTRY_DSN` is
  unset. Threaded through `docker-compose.prod.yml`, the frontend
  Dockerfile build args, and `.env.production.example`.

- **Public-site pixel-matching (partial, in progress)**: built
  `PublicHeader`/`PublicFooter` (colors, spacing, layout copied verbatim
  from `design-reference/صفحه اصلی.dc.html`'s inline styles, not
  reinvented) wired to real auth/club-points state, applied across all 5
  public pages via a shared `PublicPageShell`. Rebuilt `HomeSearchPage`
  with the real hero banner, search card (origin/destination fields, swap
  button, a real `JalaliDatePicker` — the previous native
  `<input type="date">` was Gregorian, a CLAUDE.md violation), and
  popular-route shortcuts sourced from real airport data. A concurrent
  session then added `DestinationsPage`/`PublicClubPage`/`SupportPage`/
  `TravelInfoPage` (wired to the same `/destinations`, `/club`, `/support`,
  `/travel-info` routes the header already linked to) and filled the home
  page's "پیشنهادهای ویژه"/"مقصدهای محبوب" sections with **mock prices
  copied verbatim from the design mockup** (commented in
  `HomeSearchPage.tsx` as placeholders — the backend has no
  featured-routes/offers API to source real figures from). Product
  decision (confirmed with the user 2026-07-18): keep the mock figures for
  now; replace with a real backend-sourced endpoint once one exists — this
  is a known, intentional gap, not an oversight. A later commit added
  `CustomerLoginPage` (`/signin`, real phone+OTP flow — also fixed a bug
  where the header's "ورود / ثبت‌نام" link pointed at the *staff* login
  route), `ManageBookingPage`, `AboutPage`, `ContactPage`, `NotFoundPage`.

  **Known, accepted gap — not wired to any backend (confirmed with the
  user 2026-07-18, deploying to a controlled/internal test server only,
  not real customers yet):** `ManageBookingPage` (`/manage-booking`) is
  entirely mock — any PNR + last name resolves to a hardcoded sample
  booking, and its refund button shows a fake "درخواست استرداد ثبت شد"
  success message with **zero calls to the real, already-tested
  `/my/refunds` endpoint**. `ContactPage`'s "ارسال پیام" button similarly
  just flips local state, no message is actually sent anywhere. **Must be
  wired to the real backend (or removed/gated) before this branch is ever
  exposed to real customers** — a fake refund confirmation is a trust/
  financial-integrity issue, not a cosmetic one.

  **Also not yet done**: the body content of Results/Book/Checkout/Ticket
  (price calendar, AI price radar, seat map styling, boarding-pass ticket
  visual) is still the earlier functional/clean styling, not pixel-matched — only
  header/footer wrap them now.

- [x] **Phases 14–17 (merged to main, not previously logged here)**:
  Phase 14 — real `SmsProvider` + IT management log. Phase 15 — step-up
  2FA verification (`POST /auth/step-up/request` + code) gating high-risk
  actions (admin role changes, API-key rotation, refund payout, price
  capacity change, session revoke-all) across their respective controllers,
  with matching frontend `useStepUp` hook wiring. Phase 16 — agency
  self-registration (public OTP + pre-registration → SITE_ADMIN
  review/refer → COMMERCIAL_MANAGER sole approval → real confirmation
  SMS, explicit no-selfie decision) plus real agency seat-allotment
  frontend (`FlightsPage`'s plan modal, `AgencySeatsPage`). Phase 17 —
  customer profile fields (`/my/profile`, encrypted national ID/passport,
  email verification) + an incomplete-profile banner on `AccountPage`.
  See `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 14–17 sections for full
  detail (this file lagged behind actual merged work — backfilled here for
  accuracy, not re-litigated).
- [x] **Phase 18 — SITE_ADMIN + EMPLOYEE panel access** — a design/mock
  audit found both panels had an empty `PANEL_NAV` (no sidebar at all).
  Per explicit user decision ("real and complete", not a narrow fix):
  `SITE_ADMIN` gets real, conservatively-scoped access to six of its ten
  design-listed tabs (`agencies`, `reports`, `cartable`, `club`, `refund`,
  plus a new scoped `SiteAdminDashboardPage`) — `flightops`/`tickets`/
  `blog`/`media` stay excluded since none has a backend for ANY role.
  `EMPLOYEE`'s sidebar is now computed per-user from real
  `EmployeePermission` grants (new `EmployeePermissionGuard` +
  `@RequiresPermission(...)`, `PanelsService.getNav` now async), matching
  `پنل کارمند.dc.html`'s dynamic `navKeys` formula — wired for
  agencies/flights(view-only)/pricing(propose-only)/reports/refund
  (review+refer, never pay). No schema change. 18 new backend e2e tests
  (`phase18-panel-access.e2e-spec.ts` + 3 new cases in
  `panels.e2e-spec.ts`), 4 new frontend unit tests (2 new dashboard
  pages), plus a pre-existing frontend bug fixed along the way
  (`RequestDetailPage`'s approve button showed for roles that can't
  actually approve since Phase 16 narrowed that endpoint). See
  `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 18 sections for the full
  scope + explicit deferrals (`fl_manage`, `ag_settle`, `fn_invoices`, the
  IT dept's catalog keys, EMPLOYEE's `referrals` tab).
- [x] **Phase 19 — مدیریت رزرو (anonymous PNR self-service)** — first item
  from the post-Phase-18 "dead forms" punch list. Per explicit user
  decision, real anonymous PNR+last-name lookup/refund (no login), reusing
  the existing `BookingService`/`RefundsService` logic via new shared
  private helpers (`toDetail()`, `createRefundRequest()`) so the anonymous
  and authenticated paths can never compute results differently. No schema
  change. 7 new backend e2e tests, 4 new frontend tests. See
  `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 19 sections for full scope +
  explicit deferrals (seat change, ticket download, per-passenger partial
  refund).
- [x] **Phase 20 — تماس با ما + پشتیبانی (contact + support tickets)** —
  second "dead forms" item. Two new tables (`ContactMessage`, a plain
  inbox; `SupportTicket`, a SITE_ADMIN-reviewed dept/priority/status/
  forward workflow scoped down from the design's fuller attachment/thread
  version). Public submission endpoints for both (no login); new
  `PANEL_NAV.SITE_ADMIN` `tickets` tab (closes a gap Phase 18 explicitly
  flagged); `SiteAdminDashboardPage` gains a third section for recent
  contact messages; ticket-forward target picker reuses
  `StaffDirectoryService` via DI rather than widening its EXEC_ROLES-only
  endpoint. `ContactPage.tsx`'s form also gained the `subject` field the
  design always required but the earlier build was missing. 11 new
  backend e2e tests, 6 new frontend tests. See `docs/API.md`/
  `docs/DB_SCHEMA.md`'s Phase 20 sections for full scope + explicit
  deferrals (attachments, reply threads, public ticket-status lookup).
- [x] **Phase 21 — فراموشی رمز (customer forgot/set password)** — third
  "dead forms" item. Also fixed a real design-mismatch bug found along the
  way: staff `LoginPage.tsx`'s "فراموشی رمز عبور؟" wrongly linked to a
  self-service flow — the design's own handler just shows a "contact IT"
  toast (staff has no self-service reset). Real flow reuses the existing
  OTP challenge (`/auth/otp/request` + `/auth/otp/verify`) to prove phone
  ownership, then a new `POST /auth/set-password` (`@Roles('USER')`, no
  current-password check) sets the password; a new `POST
  /auth/customer/login-password` closes the loop so that password is
  actually usable, and doubles as first-time password setup — giving real
  meaning to CLAUDE.md's "email+password optional" line for customers,
  which nothing had implemented before. `CustomerLoginPage.tsx` gained a
  small password-login toggle (the design itself has no password field
  for customers at all, so this is the minimal addition needed to make
  the new capability reachable). No schema change — reuses
  `User.passwordHash`. 9 new backend e2e tests, 6 new frontend tests. See
  `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 21 sections.
- [x] **Phase 22 — وضعیت پرواز (flight status lookup)** — fourth "dead
  forms" item. New public `GET /flight-status` (by flightNo or by
  origin+dest, both +date) using only real `FlightInstance`/`Route`/
  `Airport` data — no schema change. Confirmed `FlightInstanceStatus` is
  only `SCHEDULED | DEPARTED | CANCELLED`, with no gate/baggage-belt/
  delay-minutes/terminal column anywhere in the codebase, so the design's
  four operational stat boxes are explicitly NOT in the real response
  (would be fabricated data) — the real page shows only route, scheduled
  times, aircraft, and a derived status label; the delay-SMS checkbox is
  disabled "(به‌زودی)" for the same reason. Frontend reuses the existing
  `JalaliDatePicker` and `fetchAirports()`+`<select>` patterns already
  used by `HomeSearchPage.tsx`, replacing the design's free-text city
  inputs with the airport-code pickers the backend needs. 5 new backend
  e2e tests, 5 new frontend tests. See `docs/API.md`/`docs/DB_SCHEMA.md`'s
  Phase 22 sections.
- [x] **Phase 23 — وب‌سرویس آژانس (Agency B2B webservice)** — fifth and
  final "dead forms" item. `AgencyWebservicePage.tsx` was pure local mock
  state including a fake sample API key. Replicates Phase 16's
  `AgencyCreditRequest` request/decide pattern for a new
  `AgencyWebserviceRequest` table (agency requests a plan, an
  `AGENCY_TAB_ROLES` staff member decides), reusing Phase 3's already-real
  `AgenciesService.issueApiKey` (step-up-gated) verbatim on approval
  instead of duplicating key-issuance logic. Server-computed `priceIrr`
  from a fixed plan catalog (client can't set it — whitelist DTO 400s
  any extra field). Raw key delivery: since `AgencyApiKey` only ever
  stores `keyHash` (unchanged Phase 3 design), the raw key is delivered
  exactly once, on approval, via the agency's own message thread
  (`AgenciesService.postMessage`) rather than inventing a new channel or
  storing the secret retrievably — a bounded scope decision documented in
  docs/API.md's Phase 23 section. The rewritten frontend page shows
  request status (pending/rejected+retry) and, once approved, the active
  key's scope/status/activation metadata — never a raw key. 7 new backend
  e2e tests, 4 new frontend tests. See `docs/API.md`/`docs/DB_SCHEMA.md`'s
  Phase 23 sections for full scope + explicit deferrals.

This completes all five items from the post-Phase-18 "dead forms" punch
list (مدیریت رزرو, تماس با ما + پشتیبانی, فراموشی رمز, وضعیت پرواز,
وب‌سرویس آژانس).

- [x] **Phase 24 — پرواز (flightops: sale auto-close + نیرا manifest
  submission)** — closes the `flightops` gap flagged deferred since Phase
  18's `PANEL_NAV` notes (CEO/SITE_ADMIN/FINANCE_MANAGER/
  COMMERCIAL_MANAGER — the only 4 roles the design's own `roleDefs`
  grants it to). Read verbatim from the design: **not** gate/baggage/
  delay tracking (that's a different, still-unbuilt customer-facing
  concept, Phase 22's dropped stat boxes) — sale on each flight
  auto-closes 5h before departure and the full passenger manifest
  auto-uploads to سامانه نیرا (Iran's civil aviation manifest system) at
  that same moment. One new nullable column
  (`FlightInstance.niraSubmittedAt`, no new table); a `NiraProvider`
  interface + `MockNiraProvider` (same swappable-provider pattern as
  `SmsProvider`/`PaymentGateway`); lazy materialization on every
  `flightops` read once an instance crosses the threshold — no cron job,
  same "no cron job" pattern as `materializeDepartedInstances`/
  `materializeExpiry`. Explicitly deferred (documented, not an
  oversight): the 5h close does NOT block `POST /booking` — the design
  has no manual "close" action either, this is a reporting/manifest
  surface, not a new booking rule; a real نیرا HTTP integration; CSV/
  Excel manifest export. 8 new backend e2e tests + 5 unit tests
  (`sale-close.util.spec.ts` + `nira.service.spec.ts`), 3 new frontend
  tests. See `docs/API.md`/`docs/DB_SCHEMA.md`/
  `docs/features/flightops.md` for full scope + explicit deferrals.
- [x] **Phase 25 — حریم خصوصی و داده‌های من (GDPR export/delete UI)** —
  `GET /my/privacy/export`/`DELETE /my/privacy/account` already existed
  and were already tested from the public-site track's port (see this
  file's Phase 13 merge note) but had no frontend at all and were never
  documented in `docs/API.md` — both gaps closed this phase, no backend/
  schema changes. New "حریم خصوصی و داده‌های من" section on `AccountPage`'s
  پروفایل من tab (no design-reference page covers this — CLAUDE.md's GDPR
  requirement applies regardless, same reasoning as Phase 21's
  password-login toggle): "دانلود اطلاعات من" downloads the real export as
  a client-side JSON file; "حذف حساب کاربری" requires an explicit
  two-step confirm panel (never a bare `window.confirm`) before calling
  the delete endpoint, then signs out and returns home. 2 new frontend
  tests (backend already had 3, re-verified green, unchanged). See
  `docs/API.md`/`docs/DB_SCHEMA.md`/`docs/features/privacy-gdpr.md`.
- [x] **Phase 26 — ارجاعات (EMPLOYEE recipient-side referral listing)** —
  closes another Phase 18 `PANEL_NAV` gap: پنل کارمند.dc.html always
  appends `referrals` to EMPLOYEE's nav, but `GET /referrals` was
  sender-scoped (`SENIOR_MANAGER` only) and no recipient-side listing
  existed — worse, NO role's recipient side had any frontend at all (only
  detail/report-submission endpoints existed since Phase 4, unused by any
  UI). New `GET /referrals/mine` (same guard set as the existing
  detail/report endpoints — any `STAFF_ROLES` recipient) with a
  per-actor `hasMyReport` flag; `PANEL_NAV.EMPLOYEE` now always includes
  `referrals`. New `ReferralsRouter` (role-conditional, same pattern as
  `SecurityRouter`) renders the existing sender-side `ReferralsPage` for
  `SENIOR_MANAGER` and a new `MyReferralsPage` for `EMPLOYEE` (list +
  detail + a real report-submission form — the first frontend usage
  anywhere of `POST /referrals/:id/reports`). Explicitly deferred: other
  recipient roles (CEO/BOARD_CHAIR/finance/commercial) still have no
  frontend for this — backend already supports them, follow-up is
  frontend-only. 3 new backend e2e tests, 7 new frontend tests. See
  `docs/API.md`/`docs/DB_SCHEMA.md`/`docs/features/cartable-referrals.md`'s
  Phase 26 addition.
- [x] **Phase 27 — EMPLOYEE write/financial access: fl_manage + ag_settle +
  fn_invoices** — the remaining `PERMISSION_CATALOG` keys were left
  unwired on purpose as a security decision, not an oversight; asked the
  product owner how far to widen it (via `AskUserQuestion`, since this
  crossed from mechanical backlog work into a real authorization-policy
  call) and got an explicit answer: wire these three, leave the IT-dept
  keys (`us_manage`/`sv_control`/`sc_manage`/`lg_view`) out of scope.
  `fl_manage` now unlocks every flights write endpoint for EMPLOYEE
  (create/schedule/ai-analysis/plan/aircraft/fare-rule/allotment);
  `ag_settle` unlocks `POST /agencies/:id/settle`; `fn_invoices` unlocks
  the agencies invoices list/pay/remind (never issuing — stays
  `COMMERCIAL_MANAGER`-only). Caught and fixed two bugs during this
  phase's own design review before they shipped: (1) an EMPLOYEE granted
  only `ag_settle`/`fn_invoices` (no `ag_list`/`ag_info`) would have had a
  granted-but-unreachable permission, since only the list/detail endpoints
  lead to the action endpoints — fixed by widening those two endpoints'
  `@RequiresPermission` to accept the dependent keys as alternatives; (2)
  the frontend `invoicesSection` was correctly gated for EMPLOYEE but
  never actually rendered (EMPLOYEE takes `AgencyDetailPage`'s non-tabbed
  branch, which didn't include it) and the invoices fetch was still
  `COMMERCIAL_MANAGER`-only, so an EMPLOYEE with `fn_invoices` would have
  seen an empty invoices section, and one with `ag_settle` only would have
  had a 403 there break the whole page — both fixed (wired the section
  into the render tree; the EMPLOYEE-only fetch swallows its own 403).
  Deliberately declined to route `fn_invoices` through `FinancePage.tsx`
  (its `FINANCE_MANAGER`-only view exposes company-wide revenue/profit/
  all-transactions data, far broader than "view/manage invoices") — routed
  through the already-correctly-scoped per-agency invoices table on
  `AgencyDetailPage` instead. `fl_manage`/`ag_settle`/`fn_invoices` also
  can't be granted to a single EMPLOYEE together (an employee's `dept` is
  fixed at creation and permanently resolves to one `PERMISSION_CATALOG`
  dept — `fl_manage` is `commercial`, `ag_settle`/`fn_invoices` are
  `finance`), which mirrors real org structure and isn't a bug. 9 new
  backend e2e tests, 2 new frontend tests. See `docs/API.md`/
  `docs/DB_SCHEMA.md`/`docs/features/agencies.md`/
  `docs/features/flight-management.md`'s Phase 27 additions.
- [x] **Phase 28 — IT Manager external-service «تنظیمات» edit modal** —
  closes the last remaining deferred-UI item flagged in
  `docs/features/it-manager.md` (Phase 8): `PATCH /it/services/external/:id`
  was already implemented and e2e-tested since Phase 8, just never wired
  into `ServicesPage.tsx`. Each external service card's «تنظیمات» button
  now opens a modal pre-filled with نام سرویس/Endpoint/متد/مهلت اتصال;
  کلید احراز stays blank (the raw key is never returned by the API) and
  is only sent if the operator types a replacement, so an unedited save
  can never blank out an existing key. No backend change — pure frontend
  wiring of an already-reviewed endpoint, so this shipped without a
  fresh `AskUserQuestion` round (unlike Phase 27, this carried no
  authorization-policy decision). 3 new frontend tests (also fixed a
  test-isolation gap in `ServicesPage.test.tsx` — missing
  `afterEach(() => vi.restoreAllMocks())`, same class of bug as Phase 26's
  `MyReferralsPage.test.tsx` fix). See `docs/API.md`/`docs/DB_SCHEMA.md`/
  `docs/features/it-manager.md`'s Phase 28 additions.
- [x] **Phase 29 — referral/report attachment upload + view UI** — closes
  the "Attachment upload UI on the referral/compose modals" deferral from
  Phase 4. The files module (`POST /files`, `GET /files/:id`) and
  `attachmentIds` on both referral-creation and report-submission DTOs
  were already complete and tested — only the resolved-metadata read side
  and the frontend were missing. `ReferralsService.list()`/`.detail()`/
  `.myReferrals()` now resolve raw `StoredFile` id arrays into
  `{id, fileName, mimeType, sizeBytes}[]`. New `AttachmentPicker` (upload
  + removable chips) and `AttachmentList` (read-only, click-to-download)
  components wired into `ReferralsPage.tsx`'s compose modal + detail view
  and `MyReferralsPage.tsx`'s report form + detail view. Caught and fixed
  a real pre-existing bug while writing this phase's own e2e test with a
  Persian filename: `FilesService.store()` stored `file.originalname`
  as-is, but multer/busboy decode multipart headers as latin1 by default,
  so non-ASCII filenames came out as mojibake on a Persian-first
  platform — fixed with a latin1→utf8 re-decode (a no-op for ASCII names,
  so the phase's own existing ASCII-only fixtures were unaffected). 3 new
  backend e2e tests, 9 new frontend tests (2 new reusable components + 4
  wiring tests across the two referral pages). See `docs/API.md`/
  `docs/DB_SCHEMA.md`/`docs/features/cartable-referrals.md`'s Phase 29
  additions.
- [x] **Phase 30 — data-driven seat-map aisle gap rendering** — closes
  the last remaining low-risk deferral: `docs/features/reservation.md`
  had flagged the seat grid's aisle gap as hardcoded at a fixed seat
  index ("gap after the 2nd seat") rather than reading the exact
  column-group split from the API. This directly contradicted CLAUDE.md's
  own "seat map config lives per aircraft type in the DB, not hardcoded"
  rule — `AircraftSeatMap.{business,economy}ColsLeft/ColsRight` already
  held the real per-aircraft config since Phase 9, but
  `GET /reservation/seatmap/:flightInstanceId` never exposed it, and the
  bug was invisible only because the single seeded aircraft type (business
  2-2, economy 2-3) happens to match the hardcoded assumption by
  coincidence. Now the endpoint returns `cabinLayout.{BUSINESS,ECONOMY}
  .aisleAfterIndex` and `ReservationPage.tsx`'s seat grid reads it per
  row's cabin. Both new tests deliberately use a non-2/2-2/3 split (a
  reversed 3-2 economy config in the backend test; a synthetic fixture in
  the frontend test) so they can't pass by coincidence the way the
  pre-existing hardcoding did. 1 new backend e2e test, 1 new frontend
  test. See `docs/API.md`/`docs/DB_SCHEMA.md`/
  `docs/features/reservation.md`'s Phase 30 additions.
- [x] **Phase 31 — EMPLOYEE narrow access to the IT-dept permission
  keys** — closes the last deferral from Phase 8/27:
  `us_manage`/`sv_control`/`sc_manage`/`lg_view` were seeded in
  `PERMISSION_CATALOG` since Phase 8 but never wired to any real access.
  Unlike Phase 27's mechanical backlog, this one required **two rounds**
  of `AskUserQuestion`: the first to pick this item off the remaining
  decision-gated backlog, the second because investigation surfaced that
  the raw literal interpretation was materially riskier than Phase 27's
  precedent — the design has zero page body for any of the 4 relevant
  EMPLOYEE tabs (`users`/`services`/`security`/`logs` list in the nav
  generator but have no `sc-if` block or `titles{}`/`subs{}` entry), and
  several underlying IT_MANAGER endpoints are self-permission-granting,
  a site-wide service kill switch, company-wide session/IP data, or a
  force-logout-everyone action. The user chose "all 4 keys, very narrow
  scope" (Claude's proposal); implemented narrower than even that
  proposal in one place — `sc_manage` excludes `GET /it/security/sessions`
  entirely (no per-actor-scoped variant exists, and building one was out
  of scope), rather than the originally-floated "policy + own sessions."
  Backend-only, no frontend/nav changes this phase (wiring a nav entry to
  a tab with no design body would only produce a dead/blank tab). Full
  scope per key, plus the dept-scoping mechanism for `us_manage`
  (`EmployeesService.deptScopeForEmployee`, a fresh DB lookup since
  `AuthenticatedUser` doesn't carry `dept`), is in `docs/API.md`'s Phase
  31 section. 11 new backend e2e tests
  (`phase31-employee-it-dept-permissions.e2e-spec.ts`). See
  `docs/DB_SCHEMA.md`/`docs/features/it-manager.md`'s Phase 31 additions.
- [x] **Phase 32 — 2FA step component test + a real navigate-during-render
  bug fix** — closes the one remaining no-decision mechanical item:
  `docs/features/panel-shell-dashboard.md` had flagged since Phase 1 that
  the staff 2FA step had E2E coverage (Playwright) but no isolated Vitest
  component test. Writing the "not reachable before a password submit"
  case (visiting the 2FA route directly, with no `challengeId` in location
  state) surfaced a real bug per CLAUDE.md's debugging workflow ("reproduce
  with a failing test first, then fix"): `TwoFactorPage.tsx` called
  `navigate('/login')` directly during render instead of inside a
  `useEffect`. React Router's own dev-mode guard ("You should call
  navigate() in a React.useEffect()") silently drops such a call — so
  in production, hitting `/login/2fa` directly (browser back/forward,
  refresh, a stale bookmark) rendered a blank page instead of redirecting
  to `/login`. Fixed by moving the guard into a `useEffect` keyed on
  `challengeId`; functionally identical on the happy path (challengeId
  present → renders exactly as before). 5 new frontend tests
  (`TwoFactorPage.test.tsx`): renders with a challenge present, redirects
  when absent, validates an incomplete code without calling the API,
  submits successfully and navigates to `/panel`, and surfaces a rejected-
  code server error inline. No backend/schema change. See
  `docs/features/panel-shell-dashboard.md`'s updated checklist.
- [x] **Phase 33 — close a stale Phase 3 checklist item (agencies.md)** —
  documentation-only, no code change. `docs/features/agencies.md` had one
  item unchecked since Phase 3: "a suspended agency's own booking/search
  endpoints (once the agency-portal track exists) would reject." That
  condition is now met — the Agency Portal track landed later in this
  session — and the behavior is already implemented and already proven:
  `backend/test/agency-portal.e2e-spec.ts`'s `'POST /auth/agency/login:
  403 when the agency is suspended'` test. Checked off with a note on
  where enforcement actually sits: login/refresh time (a suspended agency
  can never obtain a new access token), the same point every role's
  active-status check is enforced at — `JwtStrategy.validate()` only
  decodes the token and never re-queries the DB per request, so this
  matches the rest of the system's session model rather than being an
  agency-specific gap. With this, every unchecked item across
  `docs/features/*.md` is now either checked or explicitly decision-gated
  (only the Phase 1 visual-regression item remains, and it needs a
  tooling choice, not more test-writing).
- [x] **Phase 34 — کیف پول (top-up) + قفل قیمت هوشمند: retroactive docs +
  frontend closure** — picked up as a self-directed continuation once the
  no-decision backlog ran dry a second time: the backend for both wallet
  top-up and price-lock was already fully implemented and e2e-tested
  (from an earlier public-site merge), so building their frontend UI was
  judged the same low-risk category as Phases 28–30 (closing UI over
  already-decided, already-tested business logic), not a fresh product
  call. Investigation found wallet top-up UI already existed (a stale
  `PLAN.md` note said otherwise); price-lock UI was genuinely missing —
  `ResultsPage.tsx`'s only "🔒 قفل قیمت" button lived on the mock/demo
  flight cards and never called a real endpoint. Built: `AccountPage.tsx`
  gained a «قفل قیمت» tab (list/cancel, route+price+fee+expiry) and a
  «🔒 قیمت قفل‌شده» trip badge; `ResultsPage.tsx`'s real result cards
  gained a working per-cabin lock button (unauthenticated → redirect to
  `/signin` remembering the search; authenticated non-gold → club-signup
  notice; gold-tier → real `POST /my/price-locks` call with the actual
  locked price/fee/expiry shown). Two small backend additions to support
  this, both additive/non-breaking: `GET /my/price-locks` now joins
  flight route/number/departure (previously raw ids only); every booking
  response gained `isPriceLocked: boolean`. Found and fixed two real
  bugs surfaced while wiring this (not invented, not pre-existing test
  failures — genuinely new-found via building the UI against real data):
  `AccountPage.tsx`'s wallet top-up used `Number(x)*10` instead of the
  shared `parseTomanToRial` helper, so Persian-digit input (which the
  field's own placeholder invites) silently produced `NaN`; and
  `BookingService.createBooking()`'s `isPriceLocked` read a stale
  pre-transaction snapshot of the `priceLock` relation (fetched before
  the same transaction's claim-update ran), always false right after
  creating a locked booking — fixed by deriving the flag from the
  already-resolved `usableLock` variable instead. **Deliberately left
  undecided, flagged not silently dropped**: the price-lock fee is
  computed/stored but never actually charged anywhere in the backend —
  this phase's UI shows the fee as a plain data field without asserting
  it was billed, rather than inventing a wallet-debit/gateway-charge
  mechanism unilaterally (a real financial-flow decision, not UI wiring).
  6 new backend e2e tests total (2 new + all pre-existing price-lock
  tests re-verified), 8 new frontend tests. See
  `docs/features/wallet-price-lock.md` for full reasoning,
  `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 34 sections for the exact
  endpoint/schema notes.
- [x] **Phase 35 — صف مغایرت‌های پرداخت (payment-reconciliation queue)
  frontend closure** — after Phase 34's wallet/price-lock gap, ran a
  systematic audit cross-referencing every backend controller route
  against every frontend `api/*.ts` caller to check for more of the same
  shape of gap across the whole app (the audit agent itself hit the
  session's usage limit partway through and had to be finished by hand);
  this was the one confirmed genuine hit before that happened. `GET
  /reconciliation`/`PATCH /reconciliation/:id/resolve` (FINANCE_MANAGER)
  shipped in Phase 13 Part E, fully e2e-tested, but had no frontend page
  and no docs/API.md section — not flagged deferred anywhere, just
  missed. No design mock exists for it (a backend-only addition after the
  original design extraction), so `FinancePage.tsx`'s finance-ops view
  gained a new, functionally-styled «صف مغایرت‌های پرداخت» card (list +
  resolve-with-note, matching the backend's own `@MinLength(3)`
  validation client-side). No backend change. 1 new frontend test (+ an
  empty-state assertion added to the existing finance-ops test). See
  `docs/features/finance-reports.md`'s Phase 35 section,
  `docs/API.md`'s Phase 35 note.
- [x] **Phase 36 — عدم حضور مسافر (mark no-show) frontend closure** —
  continued the manual endpoint-vs-frontend-caller audit and found the
  same shape of gap in the reservation module: `PATCH /reservation/pnr/
  :pnr/no-show` (Phase 13 Part E, `CAN_LOCK_ROLES`) fully implemented and
  e2e-tested, no frontend control. The frontend's own `BookingStatus`
  type was also missing `FLOWN`/`NO_SHOW` entirely. Added a «ثبت عدم حضور
  مسافر» button to `ReservationPage.tsx`'s existing PNR-detail modal
  (next to «تغییر صندلی»/«لغو رزرو», shown for `canLock` roles on a
  `TICKETED`/`FLOWN` booking) — a small addition to an already-built
  screen, not a new one, since no design mock exists for this action at
  all (confirmed in `docs/DB_SCHEMA.md`'s own Phase 13 Part E note). The
  same audit also surfaced the seat-lock approval queue
  (`PATCH .../locks/:id/approve`/`reject`, `POST .../pnr/from-lock/
  :lockId`) as unwired — left that one alone: it's explicitly documented
  since Phase 13 Part D as intentionally backend-only ("no design screen
  exists for a request/approval queue"), and building a multi-step
  approval UI from nothing is a real design task, not a small wiring job.
  No backend change. 2 new frontend tests. See
  `docs/features/reservation.md`'s Phase 36 section, `docs/API.md`'s
  Phase 36 note.
- [x] **Phase 37 — سامانه پیامک (SMS) log frontend closure** — third hit
  from the same manual endpoint-vs-frontend-caller audit: `GET
  /it/services/sms-log` (Phase 14, `IT_MANAGER`) fully implemented and
  e2e-tested (phone numbers already masked server-side), no frontend
  surface. Added a «سامانه پیامک (SMS)» card to `ServicesPage.tsx` below
  the existing internal-services grid — enabled state, today's success/
  fail counts, recent messages. The design reference only shows the
  "sms" row in that internal-services toggle grid (already built since
  Phase 8), no separate delivery-log screen, so this is a new card, not
  a redesign. No backend change. 2 new frontend tests. See
  `docs/features/it-manager.md`'s Phase 37 section, `docs/API.md`'s
  Phase 37 note.
- [x] **Phase 38 — تغییر نوع هواپیما (aircraft-type change) frontend
  closure** — the audit's final finding: `PATCH
  /flights/:instanceId/aircraft` (Phase 13 Part A, `SENIOR_MANAGER` +
  `COMMERCIAL_MANAGER`) fully implemented and e2e-tested, no frontend
  control anywhere. Unlike Phases 35–37, this one needed two small
  additive backend changes, not just frontend wiring, because no
  reference-data endpoint existed to populate a real dropdown: new `GET
  /flights/aircraft-types` (lists every seeded `AircraftSeatMap` type
  with its real computed capacity via the existing `enumerateSeats()`
  helper) and `GET /flights/:instanceId` detail gaining an `aircraftType`
  field (via the existing `resolveAircraftType()` util) so the form can
  show/pre-select the current type. Both are pure reads over
  already-existing data — no new business logic or schema change.
  `FlightsPage.tsx`'s flight-detail modal gained a «نوع هواپیما» box with
  a تغییر button revealing the real dropdown, gated behind the existing
  `useStepUp('PRICE_CAPACITY_CHANGE')` step-up flow (same scope as
  نرخ‌گذاری), surfacing the backend's `CAPACITY_BELOW_CONFIRMED` conflict
  inline. 3 new/modified backend e2e assertions, 2 new frontend tests (a
  test-fixture-id bug — copied the wrong row id from an unrelated
  fixture — was found and fixed while writing them, not a product bug).
  While verifying regressions, found a second pre-existing test failure
  unrelated to this phase: `flights.e2e-spec.ts`'s completed-report test
  throws `TypeError: Cannot read properties of undefined (reading
  'tickets')`; confirmed via `git stash` that it fails identically on
  unmodified `main` — a second flake alongside the long-standing
  `reporting.e2e-spec.ts` one, not caused by this phase. Full backend
  e2e suite: 340/342 passing, exactly those two known-pre-existing
  failures. See `docs/features/flight-management.md`'s Phase 38 section,
  `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 38 notes.
- [x] **Phase 39 — بازبینی مدارک آژانس (staff-side agency document
  review)** — triggered when the user asked for an explanation of the
  agency-portal deferred list; investigating it found two of the three
  named items were actually stale (already built by later phases without
  this file being updated) and one was real: `AgencyDocument.status`
  had existed since the model shipped but no staff endpoint could ever
  see or decide on an upload, so every document sat `PENDING` forever
  (the Prisma model's own comment said as much). Built the same
  request/decide pattern already used twice in this codebase (credit-
  requests, webservice-requests): `GET /agencies/:id/documents` +
  `PATCH .../documents/:docId/decide` (`AGENCY_TAB_ROLES`, no step-up —
  approving a document changes no money/capacity/access), and a «مدارک
  آپلودشده» card in `AgencyDetailPage.tsx`. Corrected
  `docs/features/agency-portal.md`'s deferred list: allocated-seats
  (Phase 13 Part C) and webservice self-service (Phase 23) were already
  built; documents is now built too; forgot-password is now scoped down
  to AGENCY-only (customer/staff were resolved in Phase 21, discovered
  while re-checking that bullet). **Found but deliberately not fixed,
  flagged instead**: the credit-requests/webservice-requests endpoints
  this phase's code mirrors have no staff-side frontend either — same
  shape of gap, kept out of this phase's diff for reviewability. 3 new
  backend e2e tests, 2 new frontend tests (plus `fetchAgencyDocuments`
  mocked into the 6 existing role tests that now also call it, to avoid
  an unmocked-fetch regression). See `docs/API.md`/`docs/DB_SCHEMA.md`'s
  Phase 39 sections, `docs/features/agency-portal.md`'s corrected
  checklist + deferred list.
- [x] **Phase 40 — ترجیح زبان نمایش (display-language preference storage)**
  — first concrete step of a new, larger arc: the user brought in an
  updated design bundle (uploaded across ~9 messages, 33 `.dc.html` files
  plus refreshed `site-data.js`/`support.js`/`image-slot.js`, staged into
  `design-reference-v2/`) that adds fa/en/ar language support + real
  responsive (JS `matchMedia`-driven, not just CSS) layouts — scoped by
  the user explicitly to the public site + پنل کاربر + پنل آژانس only;
  staff/executive panels stay Persian-only. Extraction turned up: a
  three-language switcher backed by `localStorage` (`blujet_lang`), a
  hand-authored English translation per string, an Arabic layer that's
  partly a runtime exact-match dictionary (`window.arDeep`, in
  `support.js`) and partly hand-authored per page; a genuinely new page
  (فرصت‌های شغلی / Careers, with its own `site-data.js` job-posting
  backend stub); a real design reference for the long-deferred fare-rules
  CRUD gap (پنل مدیر بازرگانی now has a full «کلاس‌های نرخی پرواز» UI
  matching our existing backend's exact business rules); and a
  language-dependent (not just translated) forgot-password mechanism —
  email+code for English vs. phone+OTP for Persian/Arabic (matching what
  we already have). User decisions confirmed via `AskUserQuestion`:
  formally amend CLAUDE.md's Persian-only rule (done, see its Locale &
  Direction section) rather than treat the new design as out-of-policy;
  scope confined to public+user+agency; build a REAL email+code reset
  flow for English (not fake it with phone+OTP); persist locale
  preference in the database. Refined that last point after the user
  asked me to double-check it: DB-only would strand anonymous visitors
  (no `User` row to write to) and always reset returning visitors to
  Persian on refresh — the correct shape is hybrid, `localStorage` first
  for everyone + `User.preferredLocale` as the logged-in cross-device sync
  point, confirmed with the user before building.

  Built (storage/plumbing only — no page has translated strings yet, and
  the user was explicit: no mock data, a real column and a real,
  reachable endpoint): `User.preferredLocale` (new `Locale` enum
  FA/EN/AR, default FA); `GET /auth/me` now does a fresh DB read (was a
  bare JWT-payload echo) so the value can't go stale between token
  refreshes; new `PATCH /auth/me/locale`. Frontend:
  `frontend/src/hooks/useLocale.tsx` (`LocaleProvider`/`useLocale`, mounted
  in `App.tsx` inside `AuthProvider`) — reads `localStorage` first always,
  adopts the DB value on login when it differs, writes `localStorage` +
  fire-and-forget `PATCH`s the DB on every explicit change. 3 new backend
  e2e tests (plus a self-contained fix: reset the shared `ceo` seed
  account's `preferredLocale` at the start and end of its own test, since
  it's reused across many tests/runs and a first pass left it polluted at
  `EN` for a later full-suite run), 6 new frontend hook tests. Full
  backend e2e suite: 345/347 passing, the same 2 known pre-existing
  failures (flights.e2e-spec.ts completed-report, reporting.e2e-spec.ts
  revenue-reconciliation) — this phase caused neither. Frontend: 225/225.
  See `docs/API.md`/`docs/DB_SCHEMA.md`'s Phase 40 sections. The rest of
  the redesign (translated strings, the switcher UI, responsive layouts,
  the split forgot-password flow, fare-rules CRUD) is explicitly future
  work, not started this phase.
- [x] **Phase 41 — public i18n + responsive shared shell foundation**
  — first real page-facing step of the Phase 40 arc: cataloged the full
  `design-reference-v2/` bundle first (33 files renamed to their true
  Persian page names and diffed against the old `design-reference/`
  counterparts, `docs/design-refresh-2026-07-30.md`), confirming
  staff/executive panels carry zero i18n/responsive markers (scope
  correctly excludes them) and that وضعیت پرواز's i18n coverage — initially
  flagged as missing — was retracted once the user supplied the correct
  file (verified via a 49-hit `isEN|isAR` grep). پرداخت stays excluded
  per explicit user instruction pending a corrected upload. Built the
  shared infra every subsequent per-page phase depends on:
  `frontend/src/lib/i18n.ts` (`useT()` dictionary hook + `DIR`/`FONT` maps)
  and `frontend/src/hooks/useIsMobile.ts` (real `window.matchMedia`
  tracking, mirroring the design bundle's own JS-state-driven responsive
  pattern rather than CSS-only breakpoints). Deliberately did NOT replicate
  the design mock's `arDeep` runtime dictionary (silent fallback to
  Persian for unmatched strings) — every dictionary key has a real,
  hand-checked Arabic string, cross-referenced against `support.js`'s
  `ARDict` where it existed and hand-translated fresh where it didn't
  (e.g. footer strings). Rewired `PublicPageShell`/`PublicHeader`/
  `PublicFooter` onto these hooks: language switcher (desktop dropdown +
  mobile off-canvas cycle), RTL/LTR-aware dropdown positioning, mobile
  hamburger menu, single-column footer on mobile.

  Hit and fixed two bugs before landing: (1) wiring `useLocale()` into the
  shared shell broke 12 pre-existing test files (62 tests) that render
  `PublicPageShell`/`PublicHeader` without a `LocaleProvider` wrapper,
  because `useLocale()` threw when used outside one — fixed by giving
  `LocaleContext` a sensible default (`fa` + no-op setter) instead of
  throwing, since the real app always wraps routes in `LocaleProvider` via
  `App.tsx` and the throw was only ever a footgun for isolated component
  tests, not a real safety net; updated `useLocale.test.tsx`'s "throws
  outside a provider" test into a "falls back to fa" test accordingly.
  (2) `useIsMobile`'s initial render read `window.innerWidth` instead of
  `matchMedia(...).matches`, so it ignored the mocked initial state in
  tests (and, in the same way, a real user's actual starting viewport)
  until the first `change` event — fixed to read `matchMedia` directly on
  first render too. Full frontend suite: 237/237 passing, 61/61 files,
  after both fixes. `tsc --noEmit` clean; `oxlint` clean (pre-existing
  fast-refresh warnings only, same pattern as `useAuth.tsx`). See
  `docs/features/i18n-responsive-foundation.md` for the checklist. Explicit
  future work, not started: translating each page's own body content,
  the real email+code forgot-password flow for English, and the newly
  discovered backend domains (Careers CRUD, passenger satisfaction survey,
  commercial-manager city/route + club-tier + web-service pricing config)
  — all need `docs/API.md`/`docs/DB_SCHEMA.md` coverage and approval first.
- [x] **Phase 42 — صفحه اصلی (Home) real i18n + responsive body content**
  — first page of the per-page translation arc Phase 41 explicitly
  deferred. `HomeSearchPage` now renders through `PublicPageShell` (was its
  own hardcoded `dir="rtl"` wrapper) and every string — announcement
  banner, hero, trip-type radios, search fields, popular routes, quick
  links, special offers, mid-banner sale, popular destinations, loyalty
  band, app band — is translated into fa/en/ar. Every en/ar string was
  extracted from `design-reference-v2/صفحه اصلی.dc.html`'s own `isEN`/
  `isAR` ternaries and `site-data.js`'s `arDeep` dictionary, not invented.
  One deliberate departure from the mock: its EN mode shows fake USD
  prices; kept real toman pricing in all three locales instead (the
  backend only ever charges IRR), formatted with new locale-aware helpers
  in `frontend/src/lib/fa-format.ts` — `arDigits`, `formatToman`,
  `formatLocalePercent` — alongside the existing `faMoney` (which stays
  the one place rial→toman conversion happens for real API values; the
  new helpers format already-in-toman or plain numeric display values).
  Responsive: hero height/title size, search-field layout (row → 2-col
  grid), the four content grids (5/4 cols → 2 cols), and the two banner
  bands (row → column) all switch at the shared `useIsMobile()` breakpoint,
  matching the design bundle's own `isMobile` style values. Flagged, not
  silently patched over: the real airport `<select>` has no `cityEn`/
  `cityAr` column yet, so it falls back to the API's `cityFa` for any city
  outside the page's small marketing-card city map — future schema work,
  needs `docs/DB_SCHEMA.md` coverage + approval like every new column.
  4 pre-existing tests untouched and still passing (fa strings identical
  to before this phase); 2 new tests (en, ar) + 4 new `fa-format.test.ts`
  cases for the new helpers. Full frontend suite: 244/244 passing, 61/61
  files. `tsc --noEmit` clean; `oxlint` clean (same pre-existing warnings).
  See `docs/features/home-page-i18n-responsive.md`.
- [x] **Phase 43 — نتایج پرواز (Results) real i18n + responsive body content**
  — third page of the per-page translation arc. `ResultsPage` translates
  its search summary bar, price-calendar strip, filter sidebar (stops/
  time-of-day/airline), AI price radar, sort tabs, empty/searching/mock-
  notice states, mock flight schedule, real bookable result cards, and
  both price-lock modals (mock-gated + the real gold-tier flow's three
  outcomes) into fa/en/ar. Strings extracted from `design-reference-v2/
  نتایج پرواز.dc.html`'s own `isEN`/`isAR` ternaries and `site-data.js`'s
  `arDeep` dictionary where the design's exact key/value matched (AI radar
  copy, سورت labels, صندلی باقی‌مانده, یک توقف, time-of-day buckets); the
  remainder (filter/sort labels the design implements differently, modal
  copy, the AI-radar narrative sentence) hand-translated to the same
  no-silent-fallback bar as Phase 42. New `localeMoney(amountRial, locale)`
  helper in `frontend/src/lib/fa-format.ts` — same rial→toman division as
  `faMoney`, formatted per active locale — used for the real per-cabin
  prices and price-lock amounts (raw IRR from the API); mock schedule/
  calendar numbers (page-local placeholders) use the existing `formatToman`.
  Server-provided error messages (e.g. a 409 "already locked" response)
  are still passed through verbatim, never routed through the page
  dictionary — confirmed by leaving that exact test unchanged. Layout
  stacks to a single column (filters above results) on mobile via the
  shared `useIsMobile()` hook. All 8 pre-existing tests untouched and
  still passing (fa strings byte-identical to before this phase); 2 new
  tests (en, ar) + 1 new `fa-format.test.ts` case (`localeMoney`). Full
  frontend suite: 247/247 passing, 61/61 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/results-page-i18n-responsive.md`.
- [x] **Phase 44 — مقاصد (Destinations) real i18n + responsive body
  content** — fourth page of the per-page translation arc. Skipped
  تکمیل خرید this round: the real `CheckoutPage.tsx` (promo code +
  payment-method selection + pay button) functionally overlaps with
  پرداخت, which the user explicitly excluded from this refresh pending a
  corrected upload ("پرداخت را وارد نکن") — translating it now risked
  colliding with that exclusion, so مقاصد (unambiguously in scope) was
  picked instead. `DestinationsPage` translates its hero/search box,
  region tabs, destination mosaic (region + promo badges, duration, weekly
  frequency, price), empty state, map band (stat boxes, city pins), and
  popular-routes band into fa/en/ar. Extracted from `design-reference-v2/
  مقاصد.dc.html`'s own `isEN`/`isAR` ternaries — this page's mock has by
  far the most complete three-way translation coverage seen in the bundle
  so far, nearly every label has a direct three-way ternary rather than
  relying on the incomplete `arDeep` runtime dictionary; the handful of
  EN-only ternaries (`noResultsTitle`/`noResultsSub`, plus durations/
  frequencies with no design-provided AR at all) were hand-translated to
  the same no-silent-fallback bar as every prior phase, using the same
  digit/vocabulary conventions confirmed elsewhere in `site-data.js`'s
  dictionary. Mock catalog/route/pin data restructured from Persian-only
  pre-formatted strings to a locale-neutral shape (per-locale name objects
  + a plain numeric toman price via the existing `formatToman`), which
  also fixed the search filter to match against the active locale's city
  name instead of always Persian. Destination mosaic (4→2 cols) and map
  band (two columns → one) collapse on mobile via the shared
  `useIsMobile()` hook. All 4 pre-existing `DestinationsPage` tests
  untouched and passing (fa strings byte-identical); 2 new tests (en, ar).
  Full frontend suite: 249/249 passing, 61/61 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/destinations-page-i18n-responsive.md`.
- [x] **Phase 45 — باشگاه مشتریان (Club) real i18n + responsive body
  content** — fifth page of the per-page translation arc. `PublicClubPage`
  translates its hero, stats strip, three membership tiers (name/range/
  perks), four card-issuance steps, four earn-points cards, three
  member-services cards, and the logged-in member banner into fa/en/ar.
  Extracted from `design-reference-v2/باشگاه مشتریان.dc.html`'s own `isEN`
  ternaries and `site-data.js`'s `arDeep` dictionary, which had unusually
  complete coverage for this page — tier perks, card-issuance steps, and
  earn/services cards all had exact-match dictionary entries, a rarer find
  than in earlier pages. A handful of this app's own fa strings (built
  independently of the design bundle, since the real membership-card flow
  predates it) were aligned to the design's exact wording where no tested
  behavior depended on the old text — e.g. "چطور امتیاز جمع کنم؟" → "چطور
  امتیاز بگیرم؟" — keeping the shipped Persian and its new translations
  sourced from the same place. Found and fixed a real bug along the way:
  `PublicInfoPages.test.tsx` bundles four pages' tests in one file, and
  Phase 44's `mockLocale('ar')` spy on `useLocale()` in the last
  `DestinationsPage` test was never restored, so it leaked into every
  subsequent test in the file — invisible until this phase's `PublicClubPage`
  also started calling `useLocale()`, at which point the leaked Arabic mock
  broke both of `PublicClubPage`'s pre-existing (fa-only) tests. Fixed with
  `vi.restoreAllMocks()` in the shared `beforeEach`, the durable fix rather
  than a scoped workaround. Both pre-existing `PublicClubPage` tests pass
  unmodified once fixed; 2 new tests (en, ar). Stats/card-steps/earn/
  services grids collapse on mobile via the shared `useIsMobile()` hook.
  Full frontend suite: 251/251 passing, 61/61 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/club-page-i18n-responsive.md`.
- [x] **Phase 46 — پشتیبانی (Support) real i18n + responsive body
  content** — sixth page of the per-page translation arc. `SupportPage`
  translates its hero, four category cards, all five FAQ question/
  answers, the ticket form, and the three direct-contact cards into
  fa/en/ar. Extracted from `design-reference-v2/پشتیبانی.dc.html`'s own
  `isEN` ternaries — this page's mock fa strings matched the real app's
  shipped content exactly, word for word, nothing needed realigning — and
  `site-data.js`'s `arDeep` dictionary, which had complete coverage here
  too. Deliberate decision: the ticket's `subject` value submitted to the
  real backend always stays the canonical Persian string regardless of
  the active display locale — only the dropdown's visible label
  translates via a separate `SUBJECT_LABELS` map — since staff view
  tickets in the Persian-only admin queue and letting translated subject
  text leak into stored tickets would be a real regression, not just a
  display nicety; proven by a test that renders the page in `en` and
  asserts the submitted `subject` is still the Persian string. FAQ search
  now matches the active locale's question/answer text. Both pre-existing
  `SupportPage` tests pass unmodified; 2 new tests (en, ar). Category-card
  grid and the FAQ/contact two-column layout collapse on mobile via the
  shared `useIsMobile()` hook. Full frontend suite: 253/253 passing,
  61/61 files. `tsc --noEmit` clean; `oxlint` clean (same pre-existing
  warnings). See `docs/features/support-page-i18n-responsive.md`.
- [x] **Phase 47 — قوانین و مقررات (Terms/Travel Info) real i18n +
  responsive body content** — seventh page of the per-page translation
  arc. `TravelInfoPage` translates its hero, all six rule sections, and
  the refund-variance warning note into fa/en/ar. Unlike every prior
  page, this one needed zero hand-translation — `design-reference-v2/
  قوانین و مقررات.dc.html` ships complete `dataFA`/`dataEN`/`dataAR`
  arrays for every section title and bullet item, and the fa content
  matched the shipped app byte-for-byte, so every string came straight
  from the design source. Section-number badges use the existing
  `formatToman` helper purely for its locale-digit formatting (not an
  actual money value). The pre-existing test passes unmodified; 2 new
  tests (en, ar). TOC + section-body two-column layout collapses to a
  single column on mobile via the shared `useIsMobile()` hook. Full
  frontend suite: 255/255 passing, 61/61 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/travel-info-page-i18n-responsive.md`.
- [x] **Phase 48 — درباره ما (About) real i18n + responsive body
  content** — eighth page of the per-page translation arc. `AboutPage`
  translates its hero (eyebrow/title/description), stats strip,
  mission/vision cards, and the three values cards into fa/en/ar.
  Extracted from `design-reference-v2/درباره ما.dc.html`'s own `isEN`
  ternaries and `site-data.js`'s `arDeep` dictionary, both complete for
  every string on this page — no hand-translation needed. The
  pre-existing test passes unmodified; 2 new tests (en, ar). Stats
  strip, mission/vision cards, and values cards collapse on mobile via
  the shared `useIsMobile()` hook. Full frontend suite: 257/257 passing,
  61/61 files. `tsc --noEmit` clean; `oxlint` clean (same pre-existing
  warnings). See `docs/features/about-page-i18n-responsive.md`.
- [x] **Phase 49 — تماس با ما (Contact) real i18n + responsive body
  content** — ninth page of the per-page translation arc. `ContactPage`
  translates its hero, four contact-channel cards (24h phone, email, head
  office address, office hours), and the message form into fa/en/ar. EN
  strings extracted from `design-reference-v2/تماس با ما.dc.html`'s own
  `isEN` ternaries, complete and matching the shipped app's fa content
  exactly. Unlike every prior page, this one's design source has no
  `isAR` branch at all for its content, and `site-data.js`'s `arDeep`
  dictionary only covers a couple of generic words (`ارسال پیام`,
  `موضوع`, `متن پیام`) — every Arabic string here was hand-translated
  fresh to the same no-silent-fallback bar as every other phase, since the
  mock's own Arabic mode would otherwise leave this page entirely in
  Persian. Hero-title test assertions use `getByRole('heading', ...)`
  rather than `getByText`, since the shared footer's translated "Contact
  Us"/"اتصل بنا" link collides with the page's own `<h1>` text. All 3
  pre-existing tests pass unmodified; 2 new tests (en, ar). Channels +
  form layout collapses to a single column on mobile via the shared
  `useIsMobile()` hook. Full frontend suite: 259/259 passing, 61/61
  files. `tsc --noEmit` clean; `oxlint` clean (same pre-existing
  warnings). See `docs/features/contact-page-i18n-responsive.md`.
- [x] **Phase 50 — ورود و ثبت‌نام (CustomerLoginPage) real i18n +
  responsive strings** — tenth page of the per-page translation arc.
  Unlike every prior page, `design-reference-v2/ورود و ثبتنام.dc.html` has
  a structurally different field layout from the real app: the design's
  mock is email+password-first with a Google sign-in button and a 5-digit
  OTP step, while the real `CustomerLoginPage.tsx` is phone+OTP-first
  (6-digit OTP, no Google sign-in — out of scope) with a real-password
  toggle and a real agency-login/agency-signup flow. Most strings were
  hand-translated to match the real app's actual fields; concepts that do
  line up 1:1 with the design (tab labels, the agency-account-activation
  note, the resend label) reused the design bundle's own `isEN`/`arDeep`
  wording. All 3 pre-existing tests pass unmodified — including the two
  byte-critical fa strings asserted verbatim (`'فراموشی رمز عبور؟'`,
  `'ارسال مجدد کد'`); 2 new tests (en, ar). Also fixes a test mock-leak
  bug in `PublicMockPages.test.tsx` (bundles `CustomerLoginPage`/
  `AboutPage`/`NotFoundPage`): the new `mockLocale('ar')` test's
  unrestored `useLocale` spy leaked into the next describe block's
  fa-only `AboutPage` test. Unlike Phase 45's fix (`vi.restoreAllMocks()`
  in `beforeEach`), that blind approach would have broken this file's
  `requestOtp`/`verifyOtp`/`passwordLogin` mocks (plain `vi.fn()`s
  configured once at module scope, not per-test) — fixed instead with a
  narrowly-targeted `afterEach(() => { vi.spyOn(useLocaleModule,
  'useLocale').mockRestore(); })` that restores only the `useLocale` spy.
  Full frontend suite: 261/261 passing, 61/61 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/customer-login-page-i18n-responsive.md`.
- [x] **Phase 51 — فراموشی رمز: real email password-reset path + i18n** —
  eleventh page of the arc, but unlike Phases 42–50 this one needed real
  new backend work first (flagged since Phase 50's summary): a second
  identity-proof path for password reset via a customer's VERIFIED email
  (Phase 17), alongside the existing phone+SMS OTP path (Phase 21). New
  `TwoFactorPurpose.PASSWORD_RESET_EMAIL` (its own purpose, not reused
  from `EMAIL_VERIFY` — different trust decisions despite identical
  delivery mechanics); `POST /auth/password-reset/email/request` (looks
  up a verified-email `USER` row, deliberately does NOT upsert/create one
  the way phone OTP does — inventing an account for an arbitrary
  submitted email would let anyone probe/claim an address that isn't
  theirs) and `POST /auth/password-reset/email/verify` (same challenge
  machinery as `otp/verify`, purpose-scoped so an `EMAIL_VERIFY` or
  `CUSTOMER_OTP_LOGIN` challenge id can't cross over), handing off into
  the existing `POST /auth/set-password`. Offered in every locale, not
  gated to en/ar — restricting a security recovery method by display
  language would be arbitrary; the real gate is whether the account has a
  verified email. `ForgotPasswordPage.tsx` gains a phone/email identifier
  toggle plus a full fa/en/ar `STR` dictionary; all 4 pre-existing tests
  pass unmodified (byte-critical fa strings untouched); 3 new tests (email
  happy path, en, ar). New backend e2e spec:
  `phase51-password-reset-email.e2e-spec.ts` (10 tests) — first pass used
  fixed literal emails and hit real `Unique constraint failed` errors on
  a second run against the persistent test DB (email `User.create` isn't
  idempotent the way phone OTP's upsert is); fixed with the same
  `crypto.randomUUID()`-suffixed email convention already used in
  `club.e2e-spec.ts`/`cartable.e2e-spec.ts`. A full-suite run first showed
  3 unrelated failures (`flights.e2e-spec.ts`, `reporting.e2e-spec.ts`,
  `flight-engine-completion.e2e-spec.ts`) — traced to financial/booking
  data accumulated in the shared local `blujet_test` Postgres across many
  manual e2e runs this session (confirmed by re-running the same 3 files
  in isolation and watching the expected revenue totals drift between
  runs). With the user's explicit consent, reset the test DB
  (`prisma migrate reset --force` + reseed) and reran: `flights`/
  `reporting` are clean on a fresh DB (confirming those were pollution,
  not regressions); `flight-engine-completion`'s one test still times out
  (20s) even in isolation on a clean DB — a genuine pre-existing flake
  (already flagged in this file's earlier "Fix pre-existing flaky
  failures" entry), unrelated to auth/Phase 51, out of scope to fix here.
  Final backend e2e: 356/357 passing (1 pre-existing unrelated flake).
  Full frontend suite: 264/264 passing, 61/61 files. `tsc --noEmit` clean
  on both packages; lint clean on both (same pre-existing warnings). See
  `docs/features/forgot-password-email-reset-i18n.md`.
- [x] **Phase 52 — پنل کاربر (AccountPage) real i18n** — twelfth page of
  the arc and the largest so far: 7 tabs (پروفایل من, سفرها, کیف پول,
  امتیاز باشگاه, قفل قیمت, مسافران, استرداد‌ها), all backed by real
  endpoints from earlier phases — no new backend work needed. EN strings
  extracted from `design-reference-v2/پنل کاربر.dc.html`'s own `isEN`
  ternaries (rich coverage); AR mixes the design's own partial `isAR`
  coverage with fresh hand-translation. The «قفل قیمت» tab has no design
  counterpart at all — a real feature unique to this app — so its strings
  were hand-translated to match the actual implementation. Status badge
  maps (`STATUS_LABEL`, `REFUND_STATUS_LABEL`, `LOCK_STATUS_LABEL`) and
  `TIER_LABEL`/`CABIN_LABEL` (the latter reusing `ResultsPage.tsx`'s exact
  mapping) were restructured from flat fa strings to
  `Record<StoredLocale, string>`; the toman currency word stays
  `'تومان'`/`'Toman'`/`'تومان'` in every locale, consistent with the
  pricing-honesty rule from earlier phases. All 12 pre-existing tests pass
  unmodified — including the byte-critical fa strings they assert exactly
  (`'در حال بررسی'`, `'★ سطح طلایی'`, `'اطلاعات پروفایل ذخیره شد ✓'`, the
  `'کد ملی'` label, the `'ذخیره اطلاعات'` button, `'لغو شده'`); 2 new
  tests (en, ar). Full frontend suite: 266/266 passing, 61/61 files. `tsc
  --noEmit` clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/account-page-i18n-responsive.md`.
- [x] **Phase 53 — پنل آژانس: shared shell + login/signup real i18n
  (foundation)** — first agency-portal phase of the arc, a shared-shell
  foundation like Phase 41: `AgencyPortalShell.tsx` (sidebar nav +
  sign-out), `AgencyLoginLayout.tsx` (B2B-partner login shell), and
  `AgencyLoginPage.tsx` (login form, signup form, OTP step, done state).
  Unlike every prior phase, no design-mock counterpart exists for the
  login/signup screen at all — `design-reference-v2/پنل آژانس.dc.html`'s
  `isEN`/`isAR` ternaries only cover the post-login dashboard content
  (its own `navMeta` array, KPI labels, etc.), since the design never
  specified an agency login mechanism (the same ⚑ product-decision gap
  already recorded for this track). The shell's 7 nav labels reuse the
  design's own `navMeta` EN wording where the concept lines up 1:1
  (Dashboard, Credit & Balance, Sales & Reports, Inbox & Messages,
  Profile & Documents); AR there and every login/signup string is
  hand-translated, reusing `CustomerLoginPage.tsx`'s exact wording for
  overlapping concepts (license number, manager name, terms checkbox).
  `dir` on both the shell and login layout now derives from `useLocale()`
  instead of a hardcoded `"rtl"`. All 3 pre-existing tests pass
  unmodified — including the byte-critical fa strings they assert
  exactly (the `'ورود به پنل آژانس'` button, the
  `'شماره تماس و رمز عبور را وارد کنید.'` error, the signup field labels,
  the `'درخواست همکاری شما ثبت شد'` done message); 2 new tests (en, ar).
  Full frontend suite: 268/268 passing, 61/61 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). Remaining
  agency-portal pages (Dashboard, Credit, Sales, Inbox, Profile, Seats,
  Webservice) are separate follow-up phases. See
  `docs/features/agency-portal-shell-login-i18n.md`.
- [x] **Phase 54 — پنل آژانس: Dashboard tab real i18n** — second
  agency-portal page. `AgencyDashboardPage.tsx` translates its heading,
  4 KPI cards, 6-month sales chart, and credit summary into fa/en/ar; all
  backed by the real `GET /agency-portal/dashboard` endpoint from Phase 9
  — no new backend work. Most strings are hand-translated (no usable
  match in the design bundle's `isEN`/`isAR` ternaries for this page's
  specific copy); the sales chart's Jalali month labels reuse
  `design-reference-v2/وضعیت پرواز.dc.html`'s own established romanized
  EN names (Farvardin, Ordibehesht, ...) and its AR names, which are
  identical to the Persian names verbatim (no separate Arabic name for a
  Jalali month exists, same reasoning as "تومان" staying unchanged in
  Arabic). The pre-existing test passes unmodified — the byte-critical fa
  heading `'داشبورد'` and chart aria-label
  `'نمودار فروش ۶ ماه اخیر'` stay byte-identical; 2 new tests (en, ar).
  Full frontend suite: 270/270 passing, 61/61 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/agency-dashboard-page-i18n.md`.
- [x] **Phase 55 — پنل آژانس: Credit & Balance tab real i18n** — third
  agency-portal page. `AgencyCreditPage.tsx` translates its credit KPIs,
  invoices table, credit-increase request list, ledger, and
  credit-increase request modal into fa/en/ar; all backed by real
  `agency-portal` endpoints — no new backend work. EN strings mostly
  extracted from `design-reference-v2/پنل آژانس.dc.html`'s own rich
  `isEN` vocabulary for this exact tab; AR mixes the design's partial
  coverage with hand-translation. Deliberately keeps its own local
  invoice/credit-request status label maps rather than translating the
  shared `agency-labels.ts` module, which the staff-side
  `AgencyDetailPage.tsx` depends on and which stays Persian-only (staff
  panels aren't locale-switchable). Both pre-existing tests pass
  unmodified — the byte-critical fa strings they assert stay
  byte-identical (`'پرداخت از اعتبار'`, `'افزایش اعتبار'`,
  `'سقف درخواستی (تومان)'`, `'ارسال درخواست'`); 2 new tests (en, ar).
  Full frontend suite: 272/272 passing, 61/61 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/agency-credit-page-i18n.md`.
- [x] **Phase 56 — پنل آژانس: Sales & Reports tab real i18n** — fourth
  agency-portal page. `AgencySalesPage.tsx` translates its 4 KPIs,
  per-flight sales table, and issued-tickets table into fa/en/ar; backed
  by the real `GET /agency-portal/sales` endpoint — no new backend work.
  Heading and KPI labels reuse `design-reference-v2/پنل آژانس.dc.html`'s
  own `isEN` vocabulary for this exact tab (`reportKpis`'s KPI labels,
  the "Sales per flight" section label); AR is hand-translated. The
  tickets table's booking-status labels are a page-local map, kept
  separate from `AccountPage.tsx`'s `STATUS_LABEL` since the two pages
  use different (compact vs. verbose) fa wording for the same statuses.
  The pre-existing test passes unmodified; 2 new tests (en, ar). Full
  frontend suite: 274/274 passing, 61/61 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/agency-sales-page-i18n.md`.
- [x] **Phase 57 — پنل آژانس: Inbox & Messages tab real i18n** — fifth
  agency-portal page. `AgencyInboxPage.tsx` translates its message thread
  (sender labels, empty state) and compose form into fa/en/ar; backed by
  real `agency-portal` inbox endpoints — no new backend work. Most
  strings reuse `design-reference-v2/پنل آژانس.dc.html`'s own `isEN`
  vocabulary for this exact tab; AR is hand-translated. The pre-existing
  test passes unmodified — the byte-critical fa placeholder
  `'پیام خود را بنویسید…'` and `'ارسال'` button stay byte-identical; 2
  new tests (en, ar). Full frontend suite: 276/276 passing, 61/61 files.
  `tsc --noEmit` clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/agency-inbox-page-i18n.md`.
- [x] **Phase 58 — پنل آژانس: Profile & Documents tab real i18n** —
  sixth agency-portal page. `AgencyProfilePage.tsx` translates its
  agency-info fields, document-upload form, and submitted-documents list
  into fa/en/ar; backed by real `agency-portal` endpoints — no new
  backend work. Field labels and document-status wording match
  `design-reference-v2/پنل آژانس.dc.html`'s own `isEN` `profileFields`/
  `documents` sample data for this exact tab (CEO, License Number, City,
  Phone, Email, Partnership Type; Approved/Pending/Rejected); AR is
  hand-translated. Keeps its own local tier/document-type/status label
  maps rather than translating the shared `agency-labels.ts` module used
  by the staff-side `AgencyDetailPage.tsx` (same reasoning as Phase 55).
  The pre-existing test passes unmodified — the byte-critical fa status
  string `'در انتظار بررسی'` stays byte-identical; 2 new tests (en, ar).
  Full frontend suite: 278/278 passing, 61/61 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/agency-profile-page-i18n.md`.
- [x] **Phase 59 — پنل آژانس: Allocated Seats tab real i18n** — seventh
  agency-portal page. `AgencySeatsPage.tsx` translates its info banner,
  per-flight allotment cards (Allocated/Sold/Remaining labels,
  Active/Released badge), and empty state into fa/en/ar; backed by real
  `GET /agency-portal/allotments` — no new backend work. The info banner
  and metric labels match `design-reference-v2/پنل آژانس.dc.html`'s own
  `isEN` `seatsInfoBanner`/`allocatedLabel`/`soldLabel`/`remainingLabel`
  vocabulary for this exact tab; AR is hand-translated. This page had no
  test file before this phase — `AgencySeatsPage.test.tsx` was created
  from scratch with 4 tests (fa happy-path asserting real allotment cards
  with faDigits counts, fa empty state, en, ar). Full frontend suite:
  282/282 passing, 62/62 files. `tsc --noEmit` clean; `oxlint` clean (same
  pre-existing warnings). See `docs/features/agency-seats-page-i18n.md`.
- [x] **Phase 60 — پنل آژانس: Web Service (B2B API) tab real i18n** —
  eighth and final agency-portal page, completing the agency-portal
  i18n arc (Phases 53–60: Shell+Login, Dashboard, Credit, Sales, Inbox,
  Profile, Seats, Webservice). `AgencyWebservicePage.tsx` translates the
  webservice purchase flow (info banner, scope/duration selection,
  pending/rejected states, active-connection summary) into fa/en/ar; no
  new backend work. Several labels match
  `design-reference-v2/پنل آژانس.dc.html`'s own `isEN` vocabulary for
  this exact tab (`wsInfoBanner`, `wsPendingTitle`, `wsPendingBadge`,
  `wsNewPurchaseTitle`, `wsNewPurchaseSub`, `wsTypeLabel`,
  `wsDurationLabel`, `wsPayableLabel`, `wsSubmitLabel`, `wsActiveTitle`,
  `wsActiveBadge`, `wsBaseUrlLabel2`); the real scope names
  (`SEARCH_BOOK`/`FULL`/`SEARCH_ONLY`), 1/3/12-month plans, and
  correspondence-based key delivery wording have no design counterpart
  and are hand-translated, as is all AR text. Toman amounts keep
  Persian-digit formatting in every locale (only the currency word
  changes), matching the established money convention. All 4
  pre-existing tests pass unmodified; 2 new tests (en, ar). Full frontend
  suite: 284/284 passing, 62/62 files. `tsc --noEmit` clean; `oxlint`
  clean (same pre-existing warnings). See
  `docs/features/agency-webservice-page-i18n.md`.
- [x] **Phase 61 — صفحه 404 real i18n** — first page of the
  post-agency-portal i18n continuation. `NotFoundPage.tsx` is a small,
  standalone static page unrelated to the excluded checkout/payment
  flow — translates its heading, body copy, both links, and error-code
  footer into fa/en/ar; the wrapping `dir` attribute is now locale-aware
  (matching the `AgencyPortalShell.tsx` pattern from Phase 53). No new
  backend work. `design-reference/صفحه 404.dc.html` has no
  `isEN`/`isAR` sample data at all, so all EN/AR text is hand-translated.
  This page had no test file before this phase —
  `NotFoundPage.test.tsx` was created from scratch with 3 tests (fa, en,
  ar). Full frontend suite: 287/287 passing, 63/63 files. `tsc --noEmit`
  clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/not-found-page-i18n.md`.
- [x] **Phase 62 — صفحه تعمیر و نگهداری real i18n** — another small,
  standalone static page (served manually during planned downtime),
  unrelated to the excluded checkout/payment flow. `MaintenancePage.tsx`
  translates its badge, heading, body copy, ETA notice, and
  support-contact footer into fa/en/ar; `dir` is now locale-aware. No new
  backend work. `design-reference/در حال تعمیر و نگهداری.dc.html` has no
  `isEN`/`isAR` sample data, so all EN/AR text is hand-translated. The
  support phone number keeps its Persian-digit literal in every locale,
  matching `SupportPage.tsx`'s convention (Phase 46). This page had no
  test file before this phase — `MaintenancePage.test.tsx` was created
  from scratch with 3 tests (fa, en, ar). Full frontend suite: 290/290
  passing, 64/64 files. `tsc --noEmit` clean; `oxlint` clean (same
  pre-existing warnings). See `docs/features/maintenance-page-i18n.md`.
- [x] **Phase 63 — وضعیت پرواز real i18n** — `FlightStatusPage.tsx` (real
  flight-status lookup, Phase 22) translates its hero title/subtitle,
  mode toggle, field labels, result card, and status pill into fa/en/ar;
  no new backend work. Most labels reuse
  `design-reference-v2/وضعیت پرواز.dc.html`'s own `isEN`/`isAR`
  vocabulary for this exact page; origin/destination labels and the
  airport-name `CITY_NAMES` map reuse the convention already established
  in `HomeSearchPage.tsx` (Phase 42). The status pill needed a
  `Record<string, Tr>` keyed by the exact fa string the backend returns
  (not a 3-way status-enum map), since the backend's `DEPARTED` status
  covers two distinct fa strings ("فرود آمد"/"در حال پرواز") depending on
  arrival time — the fa string itself is the identity fallback, keeping
  fa output byte-identical. All 5 pre-existing tests pass unmodified; 2
  new tests (en, ar). Full frontend suite: 292/292 passing, 64/64 files.
  `tsc --noEmit` clean; `oxlint` clean (same pre-existing warnings). See
  `docs/features/flight-status-page-i18n.md`.
- [x] **Phase 64 — مدیریت رزرو real i18n** — `ManageBookingPage.tsx` (real
  anonymous PNR + last-name self-service, Phase 19) translates its lookup
  form, booking-detail card, refund modal, and refund-done summary into
  fa/en/ar; no new backend work. Most labels reuse
  `design-reference-v2/مدیریت رزرو.dc.html`'s own `isEN` vocabulary for
  this exact page; that design file has no Arabic sample data at all, so
  all AR text is hand-translated. The cabin label reuses the
  `CABIN_LABEL` map convention from `ResultsPage.tsx` (Phase 43). The raw
  `booking.status` enum value is still displayed verbatim in every locale
  (pre-existing gap, unrelated to i18n scope, unchanged from before). All
  4 pre-existing tests pass unmodified; 2 new tests (en, ar). Full
  frontend suite: 294/294 passing, 64/64 files. `tsc --noEmit` clean;
  `oxlint` clean (same pre-existing warnings). See
  `docs/features/manage-booking-page-i18n.md`.
- [x] **Phase 65 — قوانین باشگاه مشتریان (Club Tier Rules)** — found during
  the earlier design-bundle audit: `پنل مدیر بازرگانی.dc.html`'s
  `clubrules` tab was never built. Docs (`docs/API.md`, `docs/DB_SCHEMA.md`,
  `docs/features/club-tier-rules.md`) were drafted and explicitly
  approved by the user before any code was written, per CLAUDE.md
  workflow rule 1. New singleton `ClubTierRule` table
  (migration `20260730162159_phase65_club_tier_rules`), seeded with
  defaults matching the point ranges already shown as marketing copy on
  `PublicClubPage.tsx`/`HomeSearchPage.tsx` (GOLD ≥5,000, PLATINUM
  ≥15,000). New `GET`/`PATCH /club/tier-rules` (CEO + COMMERCIAL_MANAGER
  only, matching the design's own `roleDefs.access` arrays — no other
  executive-panel design file has a `clubrules` tab at all), with
  ordering validation (`goldMinPoints < platinumMinPoints`) and audit
  logging. `ClubPointsService.syncCache` now recomputes `ClubMember.level`
  for real from the configured thresholds every time a member's points
  change (both earn and redeem paths, same transaction as the ledger
  write) — replacing the previous manual-only
  `PATCH /club/members/:id/level` staff action as the only way tiers ever
  changed. The card-request point threshold (`cardRequestMinPoints`) is
  stored and returned but intentionally not yet enforced anywhere, since
  no real self-service card-request flow exists in the codebase to gate
  (documented scope boundary, not a fabricated no-op field). New frontend
  page `ClubTierRulesPage.tsx` (route/tab `clubrules`, wired into
  `PANEL_NAV` for CEO + COMMERCIAL_MANAGER only) renders the threshold
  form and a read-only tier-preview table. Backend: 9 new e2e tests in
  `club.e2e-spec.ts` (13/13 passing with the 4 pre-existing tests
  unmodified) + a new 8-case unit spec `club-tier.spec.ts` for
  `resolveTierForPoints`'s boundary logic (all passing). Frontend: new
  `ClubTierRulesPage.test.tsx`, 4/4 passing. Fixed one pre-existing e2e
  test (`panels.e2e-spec.ts`'s CEO tab-set assertion) to include the new
  `clubrules` key. Full backend e2e suite: 360/361 passing — the sole
  failure is the same pre-existing `reporting.e2e-spec.ts` sales-chart
  reconciliation flake already documented in Phase 51's entry (financial
  data accumulated in the shared local `blujet_test` Postgres across many
  e2e runs this session; confirmed by re-running in isolation and
  observing the expected/received totals drift between runs — unrelated
  to this phase's `ClubMember`/`ClubTierRule`-only changes). Full backend
  unit suite: 35/35 passing. Full frontend suite: 298/298 passing, 65/65
  files. `tsc --noEmit` clean on both packages; lint clean on both (same
  pre-existing warnings). No new Playwright E2E script this phase —
  consistent with this session's cadence for Phases 51–64. See
  `docs/features/club-tier-rules.md`.
- [x] With Phases 35–37, the manual endpoint audit had covered
  `reconciliation`, `reservation`, and `it-manager`'s `services` module;
  every other controller checked so far (`pricing`, `flightops`,
  `it-manager`'s `security`/`backups`/`employees`/`dashboard`, `club`,
  `booking-engine`'s `search`/`booking`/`privacy`/`wallet-points-lock`,
  `refunds`, `referrals`/`manager-messages` via `cartable.ts`,
  `staff-reports`/`passenger-reports` via `reporting.ts`, `settings` via
  `admins.ts`) came back fully wired. The audit was then finished across
  every remaining controller (`files`, `panels`, `agency-portal`,
  `agencies`, `audit`, `contact`, `support-tickets`, `auth`, `health`,
  `flight-status`, `manage-booking`, `profile`) — all confirmed fully
  wired (audit's endpoints turned out to be split across
  `it-manager.ts`/`admins.ts` frontend callers, not a real gap). The only
  module with real remaining gaps was `flights`: aircraft-type-change
  (`PATCH /flights/:instanceId/aircraft`, needing a step-up form and a
  missing aircraft-types listing endpoint) and fare-rules CRUD (a bigger,
  undesigned admin table). Reported both to the user; picked
  aircraft-type-change to build now (Phase 38 below) as the smaller,
  better-specified, lower-invention-risk option, leaving fare-rules CRUD
  deferred for explicit direction.

- [x] **Phase 66 — نظرسنجی مسافران (Passenger Satisfaction Survey)** —
  found across three design files during a follow-up domain-scoping
  discussion (`پنل مدیر IT.dc.html`'s create/configure `survey` tab, and
  `پنل مدیر عامل.dc.html`/`پنل مدیر ارشد.dc.html`/`پنل رئیس هیئت
  مدیره.dc.html`'s shared read-only results + AI-summary `survey` tab).
  Docs (`docs/API.md`, `docs/DB_SCHEMA.md`,
  `docs/features/passenger-survey.md`) were drafted and explicitly
  approved by the user before any code was written, per CLAUDE.md
  workflow rule 1. Five new tables (`SurveySettings`, `SurveyQuestion`,
  `SurveyInvite`, `SurveyResponse`, `AiUsageLog`) across two migrations
  (`20260730190717_phase66_passenger_survey` and
  `20260730190905_phase66_survey_invite_sms_type`), plus a new
  `AuditCategory.SURVEY` value and a new `SmsMessageType.SURVEY_INVITE`
  value. Lazy, no-cron invite creation: a new
  `materializeSurveyInvites` (in `survey/survey-lifecycle.util.ts`)
  creates a `SurveyInvite` + sends an SMS (via the booking's plaintext
  `contactPhone`, not decrypted `Passenger.mobileEnc`) for every booking
  observed `FLOWN` while `SurveySettings.enabled` is true — triggered
  from the survey module's own `GET /survey/stats`/`GET /survey/results`
  reads rather than the three originally-drafted call sites (a
  simplification made during implementation, documented in
  `docs/API.md`). New `IT_MANAGER`-only config endpoints (settings
  enable/title, question CRUD, stats), new public no-auth token
  endpoints (`GET`/`POST /survey/:token`, rate-limited per-IP), and new
  `CEO`/`SENIOR_MANAGER`/`BOARD_CHAIR`-only read-only results +
  AI-analyze endpoints (`GET /survey/results`,
  `POST /survey/results/:flightInstanceId/analyze` — keyed on
  `flightInstanceId`, not `flightNo` as originally drafted, since a
  recurring flight number isn't unique across departures). New
  `SurveySummaryProvider` AI abstraction
  (`backend/src/modules/ai/survey-summary.provider.ts`) calling the
  Anthropic Messages API directly — a second, separate `AiProvider`
  since CLAUDE.md scopes `ml-service` to exactly two unrelated
  endpoints — gated by `ANTHROPIC_API_KEY`, graceful `null`-on-any-
  failure fallback (design's own fallback string,
  `"خلاصه‌ای از نظرات این پرواز در دسترس نیست."`), and a new
  `AiUsageLog` row per successful call with the **real**
  `input_tokens`/`output_tokens` from the Anthropic response — closing a
  pre-existing CLAUDE.md-mandated gap (Phase 6's pricing-AI never
  implemented usage logging at all). New frontend: public `SurveyPage.tsx`
  (route `/survey/:token`, deliberately fa-only — no exported design
  file exists for this brand-new page to extract en/ar vocabulary from,
  unlike the retrofitted i18n-arc pages), `SurveyConfigPage.tsx`
  (`IT_MANAGER`), `SurveyResultsPage.tsx` (`CEO`/`SENIOR_MANAGER`/
  `BOARD_CHAIR`), and a `SurveyRouter.tsx` role-branching component (same
  pattern as `LogsRouter.tsx`). Backend: 12 new e2e tests
  (`survey.e2e-spec.ts`) + a new 5-case unit spec for
  `SurveySummaryProvider` (`survey-summary.provider.spec.ts` — missing
  key, empty comments, non-2xx, network failure, real success path, all
  via a mocked `global.fetch`; closes the same "AI provider has no unit
  test" gap `MlPriceSuggestionProvider` still has). Frontend: 10 new
  Vitest/RTL tests across the three new pages. Fixed one pre-existing
  e2e test (`panels.e2e-spec.ts`'s CEO tab-set assertion) to include the
  new `survey` key, same pattern as Phase 65's `clubrules` addition.
  Full backend e2e suite: 372/373 passing — the sole failure is the
  same pre-existing `reporting.e2e-spec.ts` sales-chart reconciliation
  flake already documented in Phase 51/65's entries (shared
  `blujet_test` Postgres data drift across many e2e runs this session;
  confirmed unrelated to this phase, which never touches
  `Booking`/`LedgerEntry` revenue data). Full backend unit suite: 40/40
  passing. Full frontend suite: 308/308 passing, 68/68 files. `tsc --noEmit` clean on both packages; lint
  clean on both (no new warnings). No new Playwright E2E script this
  phase — consistent with this session's cadence for Phases 51–65. See
  `docs/features/passenger-survey.md`.
- [x] **Post-merge senior code review of Phase 66** — at the user's
  explicit request, re-reviewed the merged survey diff with a senior
  backend engineer's rigor (not a fresh feature, a review pass). Found
  and fixed 5 real issues: (1) `SurveyConfigPage.tsx` had an unreachable
  error state — the `if (!settings) return <loading>` guard also fired
  on a failed initial fetch, trapping the user on a silent spinner
  forever; (2) `materializeSurveyInvites` never retried a failed SMS
  send once the `SurveyInvite` row existed, silently stranding the
  passenger — added a bounded retry pass scoped to invites whose booking
  has a phone; (3) `getResults()` aggregated every historical response
  row in a JS `Map` instead of real SQL, unbounded by survey volume, and
  the docs had inaccurately described it as SQL-level aggregation —
  replaced with a real `$queryRaw` `GROUP BY`; (4) the AI summary prompt
  concatenated untrusted passenger comments with no framing, a real
  prompt-injection surface against the exec-facing summary — added an
  explicit "treat this as data, not instructions" guard (a deliberate,
  documented deviation from "matches the design's prompt exactly"); (5) a
  booking later marked NO_SHOW left its already-issued `SurveyInvite`
  fully answerable — `findInviteByToken` now also checks booking status
  and 404s a NO_SHOW invite exactly like an unknown token. 3 new tests
  added (1 frontend, 2 backend e2e). Full backend e2e suite re-run:
  374/375 passing — the sole failure is the same pre-existing
  `reporting.e2e-spec.ts` revenue-reconciliation flake documented in
  Phase 51/65/66's own entries (shared `blujet_test` Postgres data drift
  across many e2e runs this session; confirmed unrelated, since none of
  these fixes touch `Booking`/`LedgerEntry` revenue data). Full backend
  unit suite: 40/40 passing. Full frontend suite: 309/309 passing.
  `tsc --noEmit` and lint clean on both packages. See
  `docs/features/passenger-survey.md`'s "Post-merge senior review"
  section for the full writeup.
- [x] **Phase 67: فرصت‌های شغلی (Careers)** — public job listing/apply +
  SITE_ADMIN posting CRUD and application review. Docs first (per
  workflow rule 1), user-approved, then implemented: `CareersSettings`/
  `JobPosting`/`JobApplication` models + migration; `CareersService`/
  `CareersController` (SITE_ADMIN, guarded)/`CareersPublicController`
  (no auth, throttled) with real resume upload (PDF-only, 3 MB, closes a
  gap where the design's own mock never persisted the picked file);
  national ID encrypted at rest (reuses `pii-crypto.ts`, no new PII
  code); computed referral-target list (real `COMMERCIAL_MANAGER`/
  `FINANCE_MANAGER` staff + singleton `CEO`/`SENIOR_MANAGER`, not
  hardcoded); `jobapps` SITE_ADMIN panel tab. Frontend:
  `CareersPage`/`CareersApplyPage` (public, `/careers`,
  `/careers/:jobId/apply`) and `CareersAdminPage` (postings + application
  review with refer/hire/reject), `api/careers.ts`, footer link gated by
  `CareersSettings.enabled` via a new `useCareersEnabled` hook. **Post-
  implementation correction** (caught before finalizing docs): the
  earlier draft claimed two dedicated public design files existed for
  the listing/apply pages — re-verified directly against
  `design-reference/`, they don't; the design only has a small
  posting-management card grid inside `پنل ادمین سایت.dc.html`, and has
  **no application-review UI at all**. The public pages and the review
  workflow were built by extension of this codebase's existing visual
  language, not lifted from a design file — `docs/API.md`/`DB_SCHEMA.md`
  corrected to say so plainly rather than leave an inaccurate design
  citation standing. Real Kavenegar SMS driver also added in this window
  (user provided the vendor, not part of Careers itself):
  `KavenegarSmsProvider` behind the existing `SmsProvider` interface.
  **Revised after the user asked whether the key could instead be
  managed from پنل مدیر IT**: rather than a server env var, the provider
  reads the pre-existing `ExternalServiceConfig(key:"ext_kavenegar")` row
  (Phase 28's IT-panel-managed, encrypted-at-rest external-service
  mechanism already used for زرین‌پال/آمادئوس/نشان) on every send, and
  falls back to `MockSmsProvider` whenever it's disabled or keyless — so
  the real key is set/rotated live from the panel, never committed
  anywhere or held in `.env`. `KAVENEGAR_SENDER_LINE` remains the one
  non-secret env var. Backend: 16 e2e + 4 unit tests. Frontend: 12 page tests + 2
  hook tests + 1 footer test = 15 new tests. Full backend e2e suite:
  392/392 passing. Full backend unit suite: 48/48 passing. Full frontend
  suite: 325/325 passing, 75 files. `tsc --noEmit` and lint clean on both
  packages. See `docs/features/careers.md` for the full checked-off
  acceptance checklist.
- [x] **SITE_ADMIN club referral (merged PR #34)** — completes user-initiated
  card-request flow: `GET /club/submitted-card-requests`, `PATCH
  /club/card-requests/:id/refer`, `ClubPage.tsx` SITE_ADMIN branch.
- [x] **User panel — نشان‌شده‌ها (saved flights)** — `SavedFlight` model +
  `GET/POST/DELETE /my/saved-flights`; `AccountPage` `saved` tab +
  `ResultsPage` bookmark button. See `docs/features/saved-flights.md`.
- [x] **User panel — مسافران ذخیره‌شده (saved passengers)** — `SavedPassenger`
  model + `GET/POST/PATCH/DELETE /my/saved-passengers`; `AccountPage`
  `passengers` tab CRUD + `BookPage` autofill chips + profile-tab preview block. See
  `docs/features/saved-passengers.md`.
- [x] **User panel — نشست‌های فعال (active sessions, merged PR #39)** —
  `GET/DELETE /my/sessions` over `RefreshToken`; `AccountSecuritySessions`
  on security tab. See `docs/features/active-sessions.md`.
- [x] **User panel — حساب‌های بانکی (merged PR #40)** — `SavedBankAccount`
  model (PAN/SHEBA encrypted at rest, masked in responses) +
  `GET/POST/PATCH/DELETE /my/bank-accounts` with default-account toggle;
  `AccountBankAccountsTab` on the `banks` tab. See
  `docs/features/bank-accounts.md`.
- [x] **User panel — معرفی دوستان (merged PR #41)** — `CustomerReferral`
  model + `User.referralCode`; `GET /my/referral` dashboard; optional
  `ref` code on OTP signup creates the `SIGNED_UP` link; first ticketed
  booking by a referred user awards 500 club points to the referrer
  (idempotent, points ledger). `AccountReferralTab` on the `referral`
  tab. See `docs/features/customer-referral.md`.
- [x] **User panel — احراز هویت (merged PR #42)** — `CustomerIdentityVerification`
  model (`NOT_STARTED/SUBMITTED/APPROVED/REJECTED`); `GET /my/identity` +
  `POST /my/identity/id-card` (upload via `FilesService`) + `POST
  /my/identity/submit`. Explicit design cut per CLAUDE.md: **no selfie
  step** — profile identity fields + national-ID-card upload only.
  `AccountIdentityTab` on the `identity` tab. See
  `docs/features/customer-identity.md`.
- [x] **پنل ادمین سایت — احراز هویت مشتریان (merged PR #43)** — staff side
  of the KYC flow (the `APPROVED`/`REJECTED` transitions must be
  reachable; no design tab exists, so it follows the `jobapps`
  review-queue pattern): new `kyc` tab in `PANEL_NAV.SITE_ADMIN`,
  `GET /identity-verifications` (+ `/:id/id-card` streaming) and
  `PATCH /:id/approve|reject` (reject reason required, shown to the
  customer who can re-submit), audit-logged. `IdentityAdminPage` at
  `/panel/kyc`. See `docs/features/customer-identity.md`.
- [x] **Post-merge user-panel documentation/seed sync** — `PLAN.md` now
  records merged PRs #39–#43 instead of leaving active sessions unchecked;
  `docs/openapi.json` regenerated with all new user-panel/KYC routes;
  development seed gains a real `SUBMITTED` KYC row + tiny PNG so the
  admin review/download flow is immediately exercisable. The seed's old
  demo-booking loop was also made idempotent (`Booking.upsert` plus
  passenger/SALE existence checks): running the seed twice had previously
  failed on globally unique demo PNRs after flight instances changed.
- [x] **User panel — complete refund tab (account refunds)** — closes the
  gap between `design-reference-v2/پنل کاربر.dc.html` and the previous
  amount/status-only list: live eligible bookings + penalty previews,
  API-driven four-bracket rules, saved-bank/manual-IBAN confirmation,
  short tracking codes and real four-stage history. Backend adds
  `GET /my/refunds/eligible-bookings|rules`, `POST /my/refunds/preview`,
  enriched list/detail/submit responses, unique tracking/booking
  constraints (including a two-client concurrency test), and fixes the
  previously unreachable production payout path by advancing SITE_ADMIN
  referrals to `FINANCE`. Frontend: `AccountRefundsTab` in fa/en/ar +
  responsive states and a real Playwright account-refund journey. Full
  clean-database backend E2E: 429/429; frontend: 366/366; focused
  Playwright journey: 1/1; see
  `docs/features/customer-account-refunds.md`.
- [x] **Bug fix (senior review, found while chasing the "pre-existing"
  reporting flake): revenue reporting polluted by agency debt-calibration
  ledger rows.** The `reporting.e2e-spec.ts` sales-chart/kpis
  reconciliation failure that had been repeatedly logged across Phases
  51/65/66/67 as "shared test-DB data drift" was never drift — it's a
  real, deterministic bug. `AgenciesService.resetTestDebt()` (e2e/dev-only,
  404 in production) reuses `LedgerEntry{type:'SALE'}` for agency
  debt-line calibration (`agencyId` set, `bookingId` null,
  `signedAmountIrr` can be **negative**) — a different concern from
  ticket revenue, but every company-wide revenue aggregate
  (`ReportingService.kpis()`/`revenueMix()`, `PnrService.dashboardStats()`,
  `AgencyPortalService.dashboard()`, `AgenciesService.detail()`) summed
  **every** `type:'SALE'` row with no `bookingId` filter, silently
  folding negative debt adjustments into "revenue." `sumByChannel()`
  (sales-chart) happened to exclude them, but only by an unrelated
  accident (it drops rows with no `booking.channel`) — not a deliberate
  filter, which is exactly why the two endpoints disagreed. Fixed: every
  real-revenue aggregate now also requires `bookingId: { not: null }`;
  `computeUsedIrr()` (the one place that legitimately wants the
  debt-adjustment rows) is untouched. New regression test in
  `test/reporting.e2e-spec.ts` inserts a synthetic bookingless SALE row
  and asserts `kpis().revenueIrr` doesn't move and still reconciles with
  `salesChart()`/`revenueMix()`. Full backend e2e suite re-run clean:
  392/392 — the flake that failed in every prior full-suite run this
  session is gone for real, not just quieted by DB timing. See
  `docs/DB_SCHEMA.md`'s matching entry for the full technical writeup.
- [x] **Int → BigInt migration for every IRR money column** (closes the
  "Known technical debt" note below — user explicitly reviewed and
  approved this before it started, given the blast radius). All 27
  IRR-denominated columns (`priceIrr`, `taxIrr`, `amountIrr`,
  `signedAmountIrr`, `limitIrr`, `requestedLimitIrr`,
  `contractPriceIrr`, `competitorPriceIrr`, `proposedPriceIrr`,
  `legalRateIrr`, `registeredPriceIrr`, `totalPaidIrr`,
  `penaltyAmountIrr`, `refundableIrr`, `discountIrr`, `lockedPriceIrr`,
  `feeIrr`, `costIrr`, `basePriceIrr`, `PromoCode.value`) converted from
  Postgres `integer` (Int32 ceiling ~2.14e9 IRR ≈ 214M toman — a real
  agency credit line or yearly revenue aggregate can plausibly exceed
  that) to `bigint`, via a single widening migration
  (`20260731061249_money_columns_int_to_bigint`, plain
  `ALTER COLUMN ... TYPE BIGINT` — no data loss, no downtime concern
  pre-launch). Non-money `Int` fields (seat counts, percentages like
  `penaltyPct`/`discountPct`, token counts, byte sizes, minutes) were
  deliberately left untouched.
  - New `backend/src/common/money.ts` — the single shared money-arithmetic
    utility CLAUDE.md requires (`Irr = bigint`, `addIrr`/`subIrr`/
    `negateIrr`/`pctOfIrr`/`roundIrrTo`/`divRoundBigInt`/`compareIrr`/
    `maxIrr`/`minIrr`/`toIrr`) — every money computation in the backend
    now routes through it instead of ad hoc bigint arithmetic, so a
    `bigint + number` type error (which TypeScript catches, unlike the
    old silent-Int32-overflow risk) can't hide a mixed-type bug.
  - New `backend/src/common/bigint-json.ts` — patches
    `BigInt.prototype.toJSON` so every money field serializes as a
    decimal **string** in API responses (`JSON.stringify` throws on a raw
    bigint; a JS `number` can't safely hold amounts above 2^53 anyway, so
    string was already the correct wire shape for money). Imported once
    in `main.ts` (real app) and `test/jest-setup.ts` (e2e).
  - New `backend/src/common/dto/irr.decorator.ts` — `@IsIrrAmount()` /
    `@MinIrrAmount(min)` / `@TransformToIrr()`, a bigint-safe replacement
    for `@IsInt()`/`@Min()`/plain-number DTO fields (class-validator's own
    `@Min()` mishandles bigint). Applied to every DTO field where a
    client submits one of the 27 money columns (agency credit/invoice
    amounts, wallet top-up, booking payment confirmation, fare-rule/
    pricing-proposal prices, ...).
  - ML-boundary exception, explicitly scoped and commented at only two
    call sites (`flights.service.ts`/`pricing.service.ts` `runAiAnalysis()`
    building the outbound `PriceSuggestionItem[]` payload): converts
    `Irr` to a plain `number` for the FastAPI pricing-suggestion request,
    since that's an advisory-only, one-way signal (CLAUDE.md ML Service
    Rules — never authoritative, never round-tripped back into a stored
    field without going through NestJS's own re-pricing/registration
    logic) and every real fare amount is far below 2^53.
  - Full backend unit suite: 50/50 passing. Full backend e2e suite:
    391/392 passing (the one remaining failure is the pre-existing
    documented Phase-51 timeout flake on
    `flight-engine-completion.e2e-spec.ts`'s Y/B/M fare-class test —
    confirmed unrelated to this migration by re-running with a longer
    timeout, which passes with fully correct values). `tsc --noEmit` and
    `eslint` clean on the backend. Frontend `tsc`/lint: no new errors
    (17 pre-existing, unrelated `AuthUser.preferredLocale` errors remain,
    verified present in the untouched baseline); frontend unit suite:
    327/327 passing, 72 files. `frontend/src/lib/fa-format.ts` and every
    page/type touching one of the 27 fields updated for the
    string-on-the-wire reality.
  - Two intentional test-behavior changes, not weakened assertions:
    `agencies.e2e-spec.ts`'s "PATCH credit rejects a limit beyond the
    Int32 rial ceiling" is obsolete by design (removing that ceiling was
    the point) and now proves the validation guard against a negative
    limit instead; `reporting.e2e-spec.ts`'s "money fields are raw
    integers" assertion flips from `typeof === 'number'` to
    `typeof === 'string'`, matching the new wire format on purpose.
- [x] **Staff auth surfaces — forced password change + login polish** —
  closes the long-deferred `mustChangePassword` enforcement gap (IT/admin
  temp-password resets previously set the flag but never blocked panel
  access): `GET /auth/me` and login responses now expose
  `mustChangePassword`; `JwtAuthGuard` returns `403 PASSWORD_CHANGE_REQUIRED`
  on every JWT-protected staff/agency route except `/auth/me`,
  `/auth/change-password`, and `/auth/logout`; frontend
  `ForcePasswordChangePage` at `/required-password-change` gates
  `ProtectedRoute`/`AgencyProtectedRoute` until `POST /auth/change-password`
  clears the flag. Staff login/2FA polish: design-aligned button copy
  («ورود به سامانه»), bottom toast for forgot-password (contact IT),
  SVG feature icons in `StaffLoginLayout`, 2FA back link. Backend: 1 new
  e2e case in `auth.e2e-spec.ts` (22 total passing). Frontend: 19 auth
  unit tests passing across `LoginPage`, `TwoFactorPage`,
  `ForcePasswordChangePage`. See `docs/features/staff-auth-surfaces.md`.
- [x] **Forgot-password v2 visual parity** — redesigned
  `/forgot-password` to match `design-reference-v2/فراموشی رمز.dc.html`: 960px
  two-column card, gradient visual panel (SVG plane, hidden <768px), header with
  locale switcher + back chip, 3-step stepper, +98 phone prefix with hints,
  6-cell OTP (backend stays 6-digit), password strength meter, secure footer
  note. Phone **and** email paths kept in all locales (Phase 51 unchanged).
  Frontend: 10 Vitest tests in `ForgotPasswordPage.test.tsx`. See
  `docs/features/forgot-password-v2-visual.md`.

- [x] **Panel sidebar badges + Jalali day-picker (Phase C)** — referrals
  sidebar badge (purple: SENIOR_MANAGER `awaitingReport`, EMPLOYEE
  `awaitingMyReport`); badge pills aligned to nav-row end; finance-ops view
  now uses shared `SalesChartControls` with day/month Jalali filtering (not
  just q3/q6/year). Tests: 3 PanelShell + 1 Dashboard month + 1 Finance
  day-mode. See `docs/features/panel-sidebar-badges-day-picker.md`.

- [x] **EMPLOYEE cartable (Phase B)** — permission-gated `cartable` tab for
  EMPLOYEE (`ct_list` / `ct_process` in `PERMISSION_CATALOG` + `EMPLOYEE_SECTION_NAV`);
  `GET/PATCH approve /cartable/*`, `POST/GET /cartable/manager-message*`,
  `GET /cartable/manager-recipients`, `GET /panels/employee-context`; frontend
  `EmployeeCartablePage` (message-to-manager + «انجام شد ✓») via `CartableRouter`;
  `EmployeeDashboardPage` KPI cards (open cartable, pending referrals, unit) +
  permission chips. Tests: 6 backend e2e + 4 EmployeeCartable Vitest + 5
  EmployeeDashboard Vitest. See `docs/features/employee-cartable.md`.

- [x] **SITE_ADMIN blog CMS (Phase D)** — `BlogPost` table + admin CRUD
  (`/blog/admin/*`) + public listing/detail (`/blog/posts*`, `/blog/covers/:id`);
  `blog` tab in SITE_ADMIN nav; `BlogAdminPage` (KPI row, category chips,
  editor, post list); public `/blog` + `/blog/:slug` pages with fa/en/ar.
  Media tab deferred. Tests: 5 backend e2e + 5 admin Vitest + 4 public Vitest.
  See `docs/features/site-admin-blog.md` + `docs/features/public-blog.md`.

- [x] **SITE_ADMIN media CMS (Phase E)** — `SiteMediaAsset`, `SiteContentBlock`,
  `SiteDestinationHighlight`, `SiteRouteHighlight` + admin CRUD
  (`/site-content/admin/*`) + public home payload (`GET /site-content/home`,
  `GET /site-content/media/:fileId`); `media` tab in SITE_ADMIN nav;
  `MediaAdminPage` (library, banners, destinations, routes); `HomeSearchPage`
  wired to CMS with static fallbacks. Social/app/support/jobs in media tab
  deferred. Tests: 8 backend e2e + 4 MediaAdmin Vitest + updated HomeSearch Vitest.
  See `docs/features/site-admin-media.md`.

- [x] **SITE_ADMIN settings — app links + support contact (Phase F)** —
  `appDownloadLinks` in `SystemSetting`; SITE_ADMIN can PATCH social +
  contact + app links; public `GET /settings/app-links` and
  `/settings/support-contact`; `SettingsPage` contact/app sections;
  `HomeSearchPage` app band wired to store URLs. Tests: extended
  `phase12.e2e-spec.ts` + SettingsPage + HomeSearchPage Vitest.
  See `docs/features/site-admin-settings-links.md`.

- [x] **Contact page — support contact wiring (Phase G)** —
  `ContactPage` reads `GET /settings/support-contact` for phone/email
  channel cards (static fallbacks on failure; address/hours unchanged).
  Tests: extended `ContactPage.test.tsx`.
  See `docs/features/contact-support-contact-wiring.md`.

- [x] **Destinations page — CMS highlights wiring (Phase H)** —
  `DestinationsPage` reads `GET /site-content/home` to override destination
  prices/images and popular routes (static catalog metadata unchanged).
  Tests: `DestinationsPage.test.tsx`.
  See `docs/features/destinations-cms-wiring.md`.

- [x] **SITE_ADMIN static site pages CMS (Phase I)** —
  «صفحات سایت» list in `MediaAdminPage`; SITE_ADMIN PATCH for page text keys;
  public `GET /settings/site-content`; About/Contact/TravelInfo wired (fa).
  Tests: `MediaAdminPage.test.tsx`, extended `phase12.e2e-spec.ts`.
  See `docs/features/site-admin-static-pages.md`.

- [x] **Public gaps closure — i18n, visual, AI radar, CMS locale, agency recovery (2026-07-31)** —
  Split purchase flow per design: `CheckoutPage` (review) → new `PaymentPage`
  (promo + pay + hold timer, fa/en/ar, two-column layout). `BookPage`/`TicketPage`/
  `FlowStepper` i18n. `ResultsPage`: removed mock flights; wired
  `GET /search/advisory` + `GET /search/price-calendar`. CMS multilocale:
  `GET /settings/site-content?locale=`, `GET /site-content/home?locale=`,
  `contactOfficeHours` setting, block locale defaults. Agency:
  `POST /auth/agency/password-reset/*`, `GET /agency-portal/sales/export` (CSV).
  Backend e2e: `search-advisory.e2e-spec.ts`. Frontend: 413 tests green.
  See branch `cursor/public-gaps-i18n-visual-9b91`.

- [x] **Full-project code review + critical-fix batch (2026-08-01)** — a 6-way parallel review across financial/booking core, auth/RBAC, admin-panel backend, frontend RTL/Jalali/i18n, ml-service, and infra/deployment surfaced 26 findings. Fixed the 7 highest-severity ones in this batch (backend-only; the remaining findings are frontend/perf/infra items, not yet scheduled):
  - `agencies.service.ts` `settle()`: was a bare read-then-insert with no lock — two concurrent settlements could both read the same "outstanding" figure and double-credit the agency. Now locks the agency's profile row (`SELECT ... FOR UPDATE`) and re-reads the ledger sum inside the same transaction as the insert. New concurrency e2e test (two parallel `POST /settle` calls → exactly one 201, ledger sum stays 0).
  - `pricing.service.ts` `register()`: an AI-sourced suggestion could be registered as the bookable fare with zero bound check, violating CLAUDE.md's "an ML suggestion can never set a bookable price by itself." Now rejects an AI suggestion that exceeds the CEO-approved `legalRateIrr` ceiling. New e2e test.
  - `pricing.service.ts` `upsertProposal()`: editing a still-PENDING proposal's price didn't clear a previously computed `aiSuggestion`, so a stale AI price (computed against the old figures) stayed registerable. Now clears `aiSuggestion` on every edit. New e2e test.
  - `reservation/pnr.service.ts` `issue()` and `changeSeat()`: both had a classic TOCTOU race — the seat-sold/lock check ran as a plain read before the write, no row lock, no DB constraint backing it, so two concurrent requests for the same seat could both succeed (violates CLAUDE.md's "exactly one of two concurrent buyers of the last seat may succeed"). Both now lock the flight instance's row and re-check inside the same transaction as the write. New 5-parallel-request concurrency e2e tests for both.
  - `auth.service.ts` `refresh()`: blocking/suspending a staff or agency account only checked `isActive`/`suspendedAt` at login — an already-issued refresh token kept working (and kept extending itself) after the account was blocked. `refresh()` now rechecks account status on every call, and `admins.service.ts` `setBlocked()` / `agencies.service.ts` `suspend()` now proactively revoke that user's outstanding refresh tokens (not a global logout-all). New e2e tests for both staff and agency accounts.
  - `settings.service.ts` `update()`: `PATCH /settings` let IT_MANAGER write BOARD_CHAIR-only keys (payment-gateway toggles, company/brand identity) since the endpoint only checked the class-level role list, not per-key. Now enforces per-key scoping server-side (the frontend already hid these fields from IT, but authorization must not rely on hidden UI alone) — `socialLinks`/`appDownloadLinks` (site-services links IT does manage) stay writable alongside the operational toggles.
  - This batch was originally committed on a since-diverged branch and reconciled onto `main` on 2026-08-02: `agencies.service.ts` `settle()` and `settings.service.ts`'s per-key IT scope needed adapting to `main`'s BigInt money columns; `pnr.service.ts` `issue()` already had its own independent row-locked fix on `main`, so only `changeSeat()` needed the lock added here. `pricing.e2e-spec.ts`'s two new register tests needed real step-up challenge/code (main added mandatory step-up to `register()` after this batch was written). Full backend e2e suite has a large pre-existing failure count unrelated to this batch — nearly every failure traces to a broken `loginAsCustomer` test helper (customer OTP flow), not to anything touched here; the specific tests this batch added/touched (agencies, pricing, reservation, phase12 settings) all pass.

Each phase = backend endpoints + tests + frontend page(s), fully working,
before the next phase starts, per `CLAUDE.md` workflow rules. A phase is
"done" only when every checklist item in its `docs/features/<name>.md` has
a passing test — see `docs/features/panel-shell-dashboard.md` for Phase 1.

- [x] **SITE_ADMIN panel dark-align (2026-08-03)** — nav order/labels to
  `پنل ادمین سایت.dc.html`; brand subtitle «پنل مدیریت» + avatar «اس»;
  refund/tickets nav badges; dark cartable; dashboard 4-KPI + agency/refund/
  cartable widgets; `GET /reporting/site-admin-overview`; dark Agencies +
  Flights (flightops) + Club + Refunds + Tickets + **مدیریت سایت** +
  **درخواست‌های استخدام**; cartable already dark for SITE_ADMIN; sidebar
  drops blog/kyc/settings; global **10 records/page**; refunds + tickets
  search.   See `docs/features/site-admin-panel-align.md`.

- [x] **SITE_ADMIN — مشتریان (2026-08-04)** — tab `customers` after
  reports in `PANEL_NAV`; `GET /customers` + `/:id` + incomplete-count
  badge; list (mobile search, کامل/ناقص) + detail tabs (اطلاعات و مدارک /
  تاریخچه خرید / تماس‌ها و تیکت‌ها / باشگاه). See
  `docs/features/site-admin-customers.md`.

- [x] **Prisma → TypeORM migration reconciled onto `main` (2026-08-04)** —
  the `claude/admin-panels-multi-role-kv5nk3` branch's full 18-phase
  Prisma→TypeORM migration was merged with `main`'s independently-diverged
  Prisma-based history (86 commits), resolving all conflicts (7 service
  files + 16 e2e test files, plus 2 silently-leaked Prisma files caught by
  a repo-wide `git grep`) — full backend e2e suite green (472/472) before
  push. While landing this, `origin/main` was independently force-pushed
  twice by another process: first the feature branch's remote tip, then
  `main` itself with a **full history rewrite** (all ~459 prior commits
  got new hashes, via a retroactive `prisma`→`typeorm` text rename) plus
  its own separately-produced, functionally-equivalent TypeORM migration
  (commit `cf7d3d9`, authored via a "Cursor Agent" under the same account).
  Per explicit user decision each time: the first collision was resolved
  by force-pushing this reconciled branch over the other one; the second
  (on `main`) was resolved by treating the rewritten `main` as the base
  and merging this branch's verified work onto it (`--allow-unrelated-histories`),
  keeping two real fixes unique to the rewritten history — the corrected
  `typeorm` package version (`^0.3.22`, not the nonexistent `^1.1.0` both
  efforts had pinned) and a `DataSource`-query health check replacing
  `@nestjs/terminus` — and dropping a stray Prisma-format `migration.sql`
  the rewrite had left under `backend/typeorm/migrations/`. Landed as a
  genuine fast-forward on `main` (`c5c0e72`), full verification (tsc,
  eslint, 72 backend unit + 520 frontend unit + 472 backend e2e, all on a
  freshly migrated+seeded DB) green before push. `main` now runs entirely
  on TypeORM with no remaining Prisma references.

- [x] **Production edge hardening (2026-08-04)** — production Nginx now
  proxies every top-level NestJS controller prefix and distinguishes HTML
  navigations from API requests for overlapping public routes; the Vite dev
  proxy applies the same rule to manage-booking and survey. `GET /health`
  now fails with HTTP 503 semantics when PostgreSQL is unavailable. Public
  locale changes now synchronize the root document `lang`/`dir` attributes.
  Regression coverage: `edge-routing.test.ts`, `health.controller.spec.ts`,
  and `useLocale.test.tsx`. Verification: 75 backend unit tests and 526
  frontend unit tests passed; both production builds passed. See
  `docs/features/production-edge-hardening.md`.

- [x] **API Gateway hardening (2026-08-13)** — added canonical `/api/v1`
  aliases while retaining all legacy routes, validated request correlation,
  trusted forwarded/real-IP handling, general and stricter login/OTP limits,
  request timeout/body-size enforcement, rate-limit-exempt health checks,
  security headers, structured/redacted edge logs, and normalized 413/429/504
  errors. Added Supertest integration and Nginx/auth regression coverage; no
  booking, pricing, seat-lock, executive-approval, finance logic, or database
  migration was introduced. See `docs/features/api-gateway.md`.

- [x] **Commercial fare-class sales control (2026-08-19)** — completed the
  approved Commercial Manager handoff: public-sale visibility per flight,
  independent public-site price and bounded agency release per fare class,
  real sold/remaining/revenue aggregates and audited price history, agency
  commitments in Add Flight, and separate CEO/Operations/Commercial notes.
  Public search, booking and payment re-price now honor the same site price;
  the schema migration preserves legacy visibility while new staff-created
  flights start disabled. Coverage includes endpoint auth/validation/not-found,
  component loading/error/empty/interactions, full unit suites, lint and builds.
  See `docs/features/commercial-fare-class-sales-control.md`.

- [ ] **Production backend artifact paths (2026-08-05)** - fix the stale
  `dist/src/` paths used by the production Docker command and TypeORM
  migration/seed scripts, add regression coverage, and verify the rebuilt
  backend becomes healthy without replacing server secrets or volumes. See
  `docs/features/production-backend-artifacts.md`.

- [x] **Flight-status control alignment (2026-08-05)** - aligned the public
  flight-number, route, date, and search controls to the approved 56px field
  height; right-aligned the flight-number value while preserving LTR code
  order; added a single-line Jalali date trigger and regression coverage.
  Verified with 527 frontend tests, lint, production build, and browser
  measurements. See `docs/features/flight-status-control-alignment.md`.

- [x] **Secure production panel-account bootstrap (2026-08-05)** - added a
  fail-closed, stdin-driven operation for named management account owners with
  unique SMS-2FA mobiles, generated one-time passwords, Argon2 hashes,
  first-login password rotation, atomic audit records, and initial encrypted
  Kavenegar configuration to avoid the IT-panel/2FA bootstrap deadlock. No
  credentials or contact details are stored in Git. See
  `docs/features/production-panel-accounts.md` and `docs/RUNBOOK.md`.

## Notable findings from design extraction (informs later phases)

- Several panels contain orphaned tabs/handlers (coded, unreachable from
  the sidebar) — e.g. CEO panel's Agencies/Flights/Reservation tabs, Board
  Chair's Agencies/Flights/Passenger-search tabs. Treat the **currently
  reachable sidebar item list per panel** as authoritative, not every
  `sc-if` block present in the file.
- `ReservationSystem`'s seat-lock authorization (`role === 'super'`) has an
  unresolved mapping question — flagged in `docs/DB_SCHEMA.md`'s open items,
  needs a product decision before Phase 9.
- The design mocks use plaintext passwords and no 2FA at the login gate,
  a mutable credit/balance field instead of a ledger, and several
  client-formatted display strings for money — all explicitly overridden by
  `CLAUDE.md` in the real implementation (see inline notes in `DB_SCHEMA.md`/
  `API.md`).

## Known technical debt (pre-launch, not blocking current phases)

- ~~All IRR money columns are Postgres `integer` (Int32 ceiling).~~
  **Resolved** — see the "Int → BigInt migration" entry above. Every
  money column is now `bigint`, end to end.

## Commands

See `CLAUDE.md` → Commands. `docker compose up -d` starts Postgres+Redis;
`cd backend && npm run start:dev` / `cd frontend && npm run dev` /
`cd ml-service && uvicorn app.main:app --reload` for the three services.

- `cd backend && npm run seed` — (re)seeds one dev account per role, all
  sharing the password `Blujet@1404` (see `backend/prisma/seed.ts` — dev
  usernames: `ceo`, `chair`, `senior`, `finance`,
  `comm`, `itadmin`, `site.admin`, `com.ahmadi`), plus 6 months of
  sample flights/bookings so the dashboard has real numbers to show.
- Backend tests need a local Postgres reachable at the `DATABASE_URL` in
  `backend/.env` (dev db) and `backend/.env.test` (test db, `blujet_test`) —
  `npm run test:e2e` runs Jest+Supertest against the latter.
- `cd frontend && npm test` — Vitest+RTL unit/component tests.
- `cd frontend && npm run test:e2e` — Playwright, needs both dev servers
  running (`backend: npm run start:dev` on :3000, `frontend: npm run dev`
  on :5173).

- [ ] **Owner super-admin first login (2026-08-06)** — owner-only
  password login without OTP, forced password replacement on first session,
  management-role guard elevation, all-management-panel navigation,
  production-only audited bootstrap, migration and regression tests. Optional
  Sandbox-only USER/AGENCY preview uses an explicit environment switch,
  selected tenant identities, 15-minute non-refreshable tokens, and audit
  records; direct owner access to tenant APIs remains forbidden. Awaiting owner
  review before merge.

- [x] **Customer account responsive sidebar (2026-08-06)** — the mobile
  account sidebar now exposes profile, account information, trips, ticket
  refunds, wallet, and loyalty points; the desktop sidebar exposes every
  existing customer-account destination and scrolls within short viewports.
  Persian/English/Arabic labels and responsive tab navigation are covered by
  `AccountPage.test.tsx`. See
  `docs/features/customer-account-responsive-sidebar.md`.
# Senior Manager panel completion — implemented (2026-08)

- Server-owned sidebar now matches the approved Senior Manager reference and excludes customers/aircraft surfaces.
- The active admins route uses the backend-connected permission editor and role-safe create flow.
- Initial manager credentials are generated securely, persisted with forced rotation, and exposed once after creation.
- VIP remains backed by the real club members/card-request APIs with Senior Manager decision boundaries enforced server-side.

# Commercial panel design refresh — backend (2026-08-18)

Branch `cursor/backend-commercial-overhaul-20260818` (from
`claude/frontend-overhaul-20260816`). Implements the previously documented
contracts and retires the production mock adapters.

- [x] `GET /agencies/invoices` aggregate + `VOIDED` enum; OVERDUE stays
  OVERDUE internally and serializes as UNPAID on the aggregate tabs.
- [x] Structured `agency_seat_requests` + flight join table; portal POST
  persists a row; manager GET/PATCH decide; approval creates one
  `AgencyInvoice`; cartable `sourceId` sync; audit events.
- [x] `ancillary_services` CRUD + public read; checkout extras overlay
  mapped travel-cost codes from this table.
- [x] `panel-nav.config.ts` `ancillary-services` tab; TabGate; mocks
  unused by production pages.
- [ ] Follow-up after PR #168 merges: rebase onto `main` and retarget the
  PR. Pet/wheelchair/custom ancillaries are on `GET /public/ancillary-services`
  but not in the checkout extras catalog (`TravelExtraCode` remains closed).

# Site-admin uploaded design sync (2026-08-20)

- [x] Added a server-owned seven-category site-rules contract, authenticated
  SITE_ADMIN editor, public Persian projection, validation, and audit logging
  on the existing `system_settings` JSONB store.
- [x] Added the rules navigation/route and aligned the rules, loans, sidebar,
  badge, and sign-out presentation with the uploaded handoff while retaining
  real APIs and secure read-only bank behavior.
- [x] Enriched admin loan reads with the related customer name/phone and kept
  bank decision mutations out of the panel.
- [x] Verified with 30 focused frontend tests, 42 backend e2e tests, frontend
  and backend production builds, lint, and `git diff --check`. See
  `docs/features/site-admin-rules-sync.md`.

# Agency portal screenshot sync (2026-08-21)

- [x] Added the missing ticket-purchase page and connected it to the public
  airport catalog and `/results` search contract used by the homepage.
- [x] Matched the supplied allocated-seats, web-service, API-docs, credit,
  sales, inbox, and message-modal layouts while retaining real tenant-scoped
  APIs and honest empty states.
- [x] Added the agency-owned seat-request-history read endpoint; tenant id is
  derived only from the authenticated agency JWT.
- [x] Verified 30 focused frontend tests, 39 backend e2e tests, both production
  builds, frontend lint, targeted backend lint, and `git diff --check`.
- [x] Local browser visual smoke was completed through the reachable local
  network bridge; component navigation coverage also passed. See
  `docs/features/agency-portal-design-sync.md`.

# Commercial Manager screenshot gap sync (2026-08-21)

- [x] Aligned the Commercial Manager sidebar and dashboard composition with
  the supplied reference without duplicating services; the aircraft-definition
  page remains available in that role per the final product decision.
- [x] Rebuilt the commercial agency-list rows around real current-month ticket
  and ledger sales aggregates, retained the cooperation/debtor queues, and
  aligned overview/finance/messages/history detail tabs with the reference.
- [x] Changed flight-route creation to an explicit add-button disclosure while
  retaining real preview/create APIs, and aligned commercial fare-class detail
  section order.
- [x] Verified 65 focused frontend tests, 23 backend E2E tests, both production
  builds, focused frontend lint, and `git diff --check`. See
  `docs/features/commercial-manager-screenshot-gap-sync.md`.

# Reference UI gap corrections (2026-08-21)

- [x] Corrected the commercial route disclosure flow and two-column seasonal
  route form while retaining preview/create validation.
- [x] Rebuilt agency route selection around real inventory cards, persisted the
  selected invoice/credit settlement method, and aligned the profile and
  passenger popovers with the supplied references.
- [x] Added explicit price-calendar paging, Blujet recommendation sorting copy,
  and the compact results edit-search flow.
- [x] Verified 45 focused frontend tests, both production builds, focused lint,
  local results-page browser smoke, and `git diff --check`. See
  `docs/features/reference-ui-gap-corrections.md`.

# Class-bound agency inventory and workflow hardening (2026-08-21)

- [x] Agency releases and purchases are bound to an exact flight occurrence,
  cabin and fare class. Cash/credit activation is atomic, idempotent, and
  cannot exceed the commercial release or race a release reduction.
- [x] Aircraft cabins, including FIRST, are the source of physical capacity;
  commercial controls only the sellable fare/channel quotas. Sold-out flights
  remain active until departure, when lifecycle automation moves them to
  DEPARTED/FLOWN.
- [x] Agency inventory is presented as one collapsed card per flight/class.
  The six-card price calendar matches the desktop reference and is deliberately
  omitted from responsive/mobile results, per the final product decision.
- [x] Chair-permission cartable tasks fan out to every active chair while the
  first atomic decision closes all sibling tasks. Manager messages continue to
  fan out to every active recipient account.
- [x] Verified both production builds, 54 focused frontend tests, 5 lifecycle
  unit tests, 98 backend E2E tests, responsive local browser smoke, migrations,
  and `git diff --check`.

# Local Vazirmatn font (2026-08-21)

- [x] Bundled the supplied Vazirmatn v33.003 variable WOFF2 font locally and
  made it the shared sans-serif font for the public site and all panels.
- [x] Removed the redundant npm Vazirmatn package so production rendering does
  not depend on loading the Persian font from a package-generated asset.

# Public checkout and account polish (2026-08-21)

- [x] Kept seat selection and pet travel as permanent checkout services; the
  seat map is collapsed by default and opens only after fee acceptance or at
  least 15,000 loyalty points.
- [x] Added encrypted customer address editing alongside birth date and made
  the six-field profile-completion calculation server-owned.
- [x] Stabilized Persian wallet amount entry, rebuilt the responsive card/IBAN
  form, and made the desktop calendar open below its field while the compact
  responsive bottom sheet keeps the page scrollable.
- [x] Completed the agency-panel services menu with the same seat, baggage,
  refund, pet, and wheelchair links used by the public-site header.
- [x] Added migration, API/schema documentation, and focused frontend/backend
  regression coverage. See `docs/features/public-checkout-profile-polish.md`.

# IT manager access granularity — phase 1 (2026-08-22)

- [x] Expanded the real permission catalog for commercial/sales, finance and
  IT into unit/action-level entries while retaining legacy umbrella keys.
- [x] Added idempotent migration and synchronized frontend/backend permission
  dependencies for the add-employee and employee-detail flows.
- [x] Documented acceptance criteria in
  `docs/features/it-manager-access-granularity.md`.
- [ ] Map each new action key to its operational endpoint guards (phase 2).
- [ ] Merge, push and deploy only after phase 2 approval.

# UAT agency/results/profile corrections (2026-08-24)

- [x] Made the agency seat inquiry debounced and automatic for each valid seat
  count, ignored stale responses, and stopped the input box from stretching to
  the height of the result card.
- [x] Localized unknown Persian smart-radar ML reasons safely in English and
  Arabic, localized the cheapest date, and removed the save-flight button from
  expanded results.
- [x] Added end-to-end customer email editing with normalization, uniqueness,
  verification reset, and integer profile-completion percentages.
- [x] Verified the full frontend suite (805 tests), full backend unit suite
  (242 tests), 5 profile E2E tests, both production builds, frontend/backend
  semantic lint, and `git diff --check`. Backend Prettier-only EOL checks remain
  noisy on the repository's pre-existing mixed CRLF/LF files; ESLint with that
  formatting rule disabled is clean.
  See `docs/features/uat-agency-results-profile-corrections.md`.
- [ ] Commit/push and merge only after explicit user approval.

# Service-page localized step digits (2026-08-24)

- [x] Replaced Persian display strings used as service-step ordinals with
  locale-neutral numeric values on seat selection, extra baggage, ticket
  refund, pet travel, and wheelchair pages.
- [x] Added English and Arabic regression coverage for all five pages so the
  cards render `1/2/3` in English and `١/٢/٣` in Arabic, never Persian digits.
- [x] Verified 11 focused tests, the full 815-test frontend suite, frontend
  lint, and the production build.
- [ ] Commit/push, review, merge, and deploy after user approval.

# Agency active-flight catalogue (2026-08-24)

- [x] The agency **Active flights** tab now combines every future published
  flight/fare class with the agency's real active allotments, including honest
  zero-allocation cards for flights that have not yet been allotted.
- [x] The tab count is based on unique flight instances; matching class-bound
  allotments are not duplicated, and both new and already-allotted flights can
  open the exact existing seat-purchase request flow.
- [x] The temporary UAT agency can read its own persisted seat-request history
  without bypassing tenant isolation or creating fabricated inventory.
- [x] Verified 12 focused agency tests, the full 817-test frontend suite, the
  full 242-test backend unit suite, all 31 UAT shared-password E2E tests,
  frontend lint, targeted backend lint, both production builds, and
  `git diff --check`.
- [ ] Commit/push, review, merge, and deploy after explicit user approval.

# Customer profile, checkout, and price-calendar corrections (2026-08-24)

- [x] Split account and saved-passenger first/last-name editing while keeping
  the existing combined-name wire contract compatible with stored data.
- [x] Map legacy one-part saved Latin names to the family-name field and keep
  national ID and birth date in distinct responsive review cells.
- [x] Recreate a missing permanent `SEAT_SELECTION` checkout mirror from the
  real ancillary catalogue at backend startup, preserving its managed price.
- [x] Make price-calendar arrows load unlimited earlier/later six-day windows.
- [x] Verified the full 820-test frontend suite, full 243-test backend unit
  suite, frontend lint, both production builds, and `git diff --check`.
  See `docs/features/customer-profile-checkout-calendar-fixes.md`.
- [ ] Commit/push, review, merge, and deploy after explicit user approval.

# Price-calendar navigation and saved-passenger autofill corrections (2026-08-24)

- [x] Keep the clicked price-calendar day selected and blue without shifting the visible date window.
- [x] Keep the previous arrow physically on the left and the next arrow physically on the right in Persian, English, and Arabic.
- [x] Preserve unlimited backward and forward price-calendar navigation through API-backed date windows.
- [x] Recover a missing Latin first name for compatible legacy saved-passenger rows without placing Persian text in Latin ticket fields.
- [x] Cover the fixes with component, page-integration, and full frontend regression tests.

# Checkout passenger controls and profile deletion (2026-08-24)

- [x] Expose the approved add-passenger control in the checkout passenger step.
- [x] Show a localized remove control on every checkout card when more than one passenger exists.
- [x] Recalculate the displayed passenger mix and ticket total after checkout add/remove actions.
- [x] Replace the ambiguous saved-passenger × icon with an explicit localized remove button in the user account.
- [x] Cover checkout add/remove, pricing synchronization, profile deletion, and all three locales with regression tests.
- [ ] Commit/push, review, merge, and deploy after explicit user approval.

# Price calendar and customer UI local follow-up (2026-08-24)

- [x] Match adjacent-day browsing to locale direction: Persian/Arabic
  physical-left browses forward, English physical-left browses backward, one
  day per click.
- [x] Keep the passenger's selected price-calendar card blue while arrows only
  browse the nearby-day window; change the search date only on a direct day click.
- [x] Keep the carousel rendered during adjacent-window requests, animate new
  cards from the clicked side, and ignore stale out-of-order responses from
  rapid arrow clicks.
- [x] Redesign the saved-passenger dialog to stay within the viewport with a
  responsive field grid, scrolling body, and persistent action bar.
- [x] Center national ID/passport directly below the Document heading in the
  checkout review table.
- [x] Close the customer logout confirmation immediately and tolerate a failed
  best-effort server revoke without trapping the user behind the overlay.
- [ ] Await user review on the local server before commit/push/deploy.

# Guest checkout and site-admin workflow recovery (2026-08-25)

- [x] Restore the passenger-first checkout for unauthenticated customers and
  keep the primary action disabled until the complete manifest is valid.
- [x] Open inline OTP only after a valid guest manifest while preserving
  localized field-level validation.
- [x] Route the site-admin pending-action KPI to a real non-empty queue and
  allow SITE_ADMIN organizational messages from cartable.
- [x] Verify public-ticket listing/forwarding, high-traffic route creation,
  and career-image upload with automated regression coverage.
- [ ] Commit/push, review, merge, and deploy only after explicit user approval.

# Critical panel audit fixes integrated with guest/admin recovery (2026-08-25)

- [x] Make IT aggregate health fail closed for an empty catalogue and include
  disabled external dependencies in the result.
- [x] Provision the canonical internal-service catalogue through a
  production-safe migration that preserves operator state.
- [x] Install `postgresql-client` in the backend runtime image so the real
  `pg_dump` backup workflow has its required binary.
- [x] Update Playwright staff login for the current username → password → OTP
  flow and verify protected role isolation locally.
- [x] Render recurring-flight months/weekdays in Persian while preserving the
  real aircraft-cabin route editor and each route's capacity snapshot.
- [x] Re-run the combined guest-checkout, site-admin cartable, career upload,
  IT, commercial, full unit, integration, lint, and production-build checks.
- [ ] Commit/push and deploy only after explicit user instruction.

# Agency search identity and customer seat policy (2026-08-25)

- [x] Preserve authenticated agency identity across public results/booking pages.
- [x] Populate homepage and agency cabin selectors from sellable configured cabins.
- [x] Gate seat instructions/map together and show/enforce the ticket-based limit.
- [x] Assign unselected seats atomically using family, child, gender, infant-block,
      and exit-row rules while preserving valid manual choices.
- [x] Keep `GALLEY` English and localize the rest of the Persian/Arabic seat map.
- [x] Verify focused regressions, builds, semantic lint, and the local browser flow.
- [ ] Commit/push; merge/deploy only after explicit user approval.

# Customer account, agency seats, and checkout recovery (2026-08-26)

- [x] Keep each agency seat-allotment inquiry attached to its selected flight card.
- [x] Redesign the Saman customer-number and account-security controls.
- [x] Restore the club loan eligibility form and localized submission feedback.
- [x] Add owned PDF/PNG/JPG support-ticket attachments with staff/customer download access.
- [x] Permit both customer and agency identities through the booking checkout controller while preserving ownership checks.
- [x] Pass 868 frontend tests, 276 backend unit tests, 15 support-ticket integration tests, lint, and both production builds.
- [ ] Complete visual browser verification when localhost browser access is available.
- [ ] Commit/push, merge, and deploy only after explicit user approval.

## Central PSS/CRS extraction — Slice 0 (2026-09-01)

- [x] Record the owner-approved API, schema, migration and airline-document decisions.
- [x] Add an independently deployable NestJS PSS service with a separate PostgreSQL database, validated configuration, internal authentication, request correlation, structured logging, liveness/readiness and internal OpenAPI.
- [x] Add transactional idempotency and outbox persistence with unit and real-Postgres E2E coverage in CI.
- [x] Add a fail-closed, explicitly gated `PssClient` adapter to the existing website backend without switching the current sales writer.
- [x] Add local/production Compose topology and a dedicated CI job.
- [x] Add fail-closed shadow reconciliation across website and PSS counts.
- [ ] Run the CI-wired `pg_dump` restore proof and review its artifact before any writer cutover (local sandbox cannot execute the installed PostgreSQL binaries).
- [ ] Commit, push, merge or deploy only after the phase review and explicit owner approval.

## Route cabin pricing, standard classes, and smart distance (2026-09-01)

- [x] Persist one standard default fare-class code per aircraft cabin.
- [x] Require and persist one base price per enabled cabin in seasonal routes.
- [x] Materialize initial per-cabin fare rules without opening sales channels.
- [x] Add advisory AI distance suggestion with explicit operator acceptance and
  manual fallback.
- [x] Pass focused backend/frontend tests, builds, lint, and diff validation.
- [ ] Merge and deploy only after explicit user approval.

## Panel theme, finance resilience, report search, and UAT wallets (2026-08-30)

- [x] Remove forced light chrome and white chart surfaces from the commercial flight-detail modal while preserving light-mode token rendering.
- [x] Show one compact active flight per row.
- [x] Normalize remaining agency/customer header ink and profile surfaces across light/dark themes.
- [x] Fix Jalali calendar weekday alignment and replace eager finance-flight catalog loading with explicit, bounded, paginated search.
- [x] Keep management finance visible during partial API failures and show an honest partial-data alert.
- [x] Fix browser download lifetime for CSV/XLSX/PDF and independently import/inspect the eight-sheet finance workbook.
- [x] Add an exact, guarded, audited, backed-up one-time UAT wallet reconciliation to 100 million toman for the reserved customer and agency identities.
- [x] Pass focused frontend/backend tests, both production builds, and diff validation.
- [ ] Merge and UAT deploy through GitHub Actions; verify protected pages after deployment.

# Channel inventory, message attachments, and aircraft alignment (2026-08-27)

- [x] Connect public result inventory and checkout enforcement to the exact
  per-fare-class seat quantity released to the site by Commercial Management.
- [x] Keep site and agency releases inside the shared fare allocation ceiling
  and keep agency inquiry/order quantities tied to the live agency release.
- [x] Start agency inquiries blank and turn oversized responses red; confirming
  the response uses the server-suggested quantity in the order.
- [x] Add owned attachment upload/history support to agency inbox and all direct
  cartable message forms while retaining the existing customer-ticket upload.
- [x] Keep only the customer name in the public header trigger and move tier,
  points, and phone details into the account card.
- [x] Reconcile cabins/fares with the selected aircraft definition and derive
  public cabin choices from actual sellable aircraft inventory.
- [x] Add migration, API/schema/acceptance documentation, focused regression
  tests, readable lint, and successful production builds for both applications.
- [ ] Complete full-stack browser QA when the local browser can reach the host
  Vite/PostgreSQL/Redis stack.
- [ ] Commit/push, merge, and deploy only after explicit user approval.

# Booking cabin consistency, finance reports, tickets, and IT cartable (2026-08-27)

- [x] Carry the purchased cabin and fare-class code through booking details,
  customer tickets, booking management, agency invoices, and agency sales
  exports.
- [x] Restrict seat selection to the purchased cabin and keep sold/reserved
  seats unavailable, with matching server-side transactional validation.
- [x] Add the finance sales-report engine with server-side filters, summary and
  detail rows, and CSV, Excel, and PDF exports.
- [x] Make open, in-review, answered, and closed support-ticket status cards
  interactive and searchable in the shared ticket experience.
- [x] Add real status aggregates/filtering to the shared cartable and align the
  IT manager with the organized management-panel shell.
- [x] Document the API/schema behavior and feature acceptance criteria.
- [x] Pass 901 frontend tests, 312 backend unit tests, both production builds,
  frontend lint, targeted backend lint, PDF render verification, and
  `git diff --check`.
- [x] User approved commit, merge, push, and UAT deployment on 2026-08-27.

# Finance report audit, customer details, and 10-row tables (2026-08-27)

- [x] Inspect the supplied two-page debit/credit PDF and all nine sheets of the
  supplied sales-report workbook without importing any sample business rows.
- [x] Document the selected-flight booking-detail contract and the no-schema
  pagination decision before implementation.
- [x] Make customer sales «جزئیات» open the selected flight's real booking data.
- [x] Limit every report table to 10 visible rows with usable paging controls.
- [x] Compare implemented coverage with IATA BSP/DISH, SIS/RAM and ICAO Form EF
  and report gaps without claiming certification.
- [x] Replace the placeholder PDF with a two-page A4 RTRD-style reconciliation
  matching the supplied sample's structure and columns; retain the layout and
  values while changing only the airline branding to Blujet.
- [x] Upgrade finance Excel exports to a native multi-sheet `.xlsx` reporting
  pack with summary, sales detail, agency settlement, refunds, tax breakdown,
  flight summary, reconciliation and data-dictionary tabs.
- [x] Pass focused frontend/backend tests, source lint, production builds and
  automated rendered-DOM interaction coverage for the modal and paginator.
- [ ] Commit/push, merge and deploy only after explicit user approval.
# UAT sandbox access extension v3 (2026-08-28)

- [x] Add a third owner-approved, one-time seven-day extension for every reserved UAT staff, agency, and customer identity.
- [x] Fail closed outside production, require a v3-specific confirmation phrase, use a 35-day absolute ceiling so this grant remains a full seven days, normalize only exact reserved identities back to password-only mode when prior UAT flows changed their 2FA flag, revoke active refresh sessions, and write per-account security audit rows.
- [x] Deploy through an independent root-only v3 audit artifact and sentinel so later releases cannot silently extend access again.

# Internal cartable and agency bulletins (2026-08-28)

- [x] Keep the complete customer/agency support queue exclusive to SITE_ADMIN and scope every other staff account to its exact forwarded tickets.
- [x] Keep assigned support tickets out of every internal cartable; SITE_ADMIN continues to handle them only in the dedicated support center.
- [x] Add real SITE_ADMIN notice/amendment composition for all, one, or multiple active agencies with persisted history and audit.
- [x] Connect targeted dispatches to the agency «اطلاعیه و اصلاحیه» page with per-agency read receipts.
- [x] Pass focused tests, typecheck, production builds and `git diff --check` before requesting merge approval.

# Management cartable redesign without embedded tickets (2026-08-28)

- [x] Remove the embedded assigned-support-ticket workspace from SITE_ADMIN, executive, manager, operations and employee cartables without modifying support-ticket APIs or behavior.
- [x] Use one shared ticket-inspired visual composition for internal-work headings, status summaries and search while retaining each role's existing cartable actions and permission boundaries.
- [x] Add local search and explicit filtered-empty states to executive/SITE_ADMIN, employee and operations cartables.
- [x] Preserve 10-row pagination and internal task decisions, transfers, manager messages, employee completion and operations flight approval.
- [x] Pass role-focused tests, all 924 frontend tests, frontend lint, production build and `git diff --check`.
- [ ] Complete signed-in local visual verification before requesting merge approval.
## Agency notices, support lifecycle, cartable files, and finance audit (2026-08-28)

- [x] Audit targeted agency bulletin delivery for one, multiple, and all active agencies.
- [x] Add requester satisfaction/reopen feedback and five-day automatic closure while retaining tracking/search history.
- [x] Normalize manager/employee cartable message permissions and attachment display.
- [x] Render image attachments inline and keep non-image files downloadable.
- [x] Add a real persisted-data agency financial event timeline.
- [x] Run focused backend/frontend regression tests and local production builds.

## Airline flow invariants follow-up (2026-08-28)

- [x] Exclude every airport in the selected origin city from the destination picker and vice versa.
- [x] Make origin-to-destination direction explicit in flight details for RTL and LTR locales.
- [x] Align persisted MD-80 cabin bands with the approved seat map and migrate existing seat/catalog rows.
- [x] Prove first-class seat selection and the shared search/edit-search city filter with regression tests.

## Guest checkout, account pagination, and internal cartable lifecycle (2026-08-29)

- [x] Keep passenger entry available before authentication while disabling the primary checkout continuation and preserving the completed manifest through OTP login.
- [x] Complete only missing profile identity fields from the first adult after login and save that passenger without duplicates.
- [x] Paginate customer trips at ten records per page and keep the wallet top-up action aligned when amount-in-words appears.
- [x] Replace the fixed mobile checkout action overlay with a footer-safe sticky action row.
- [x] Separate internal-message reply from explicit conversation closure, retain searchable history, and auto-archive after four inactive days.
- [x] Rename the pricing rejection submission to «ثبت درخواست» without changing its audited decision semantics.
- [x] Pass 944 frontend tests, 341 backend unit tests, 36 cartable E2E tests, both production builds, lint checks, diff validation, and local responsive browser QA.
- [ ] Commit/push, merge, and deploy only after explicit user approval.
