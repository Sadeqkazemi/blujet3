# Feature: Phase 11 — مالی tab, گزارش مسافران, گزارش کارمندان

Covers `docs/API.md` → "Phase 11" and `docs/DB_SCHEMA.md` → "Phase 11"
(no schema changes — all derived data). Tabs unlocked this phase:
- مالی: CEO, BOARD_CHAIR, SENIOR_MANAGER (analytic view) +
  FINANCE_MANAGER (finance-ops view) + COMMERCIAL_MANAGER (analytic view)
- گزارش مسافران (`reports`): SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER
- گزارش کارمندان (`staff`): FINANCE_MANAGER, COMMERCIAL_MANAGER

## Acceptance checklist

Backend items proven by `backend/test/finance-reports.e2e-spec.ts` (10
tests, 169 total); frontend by the three new `*.test.tsx` files (5 tests,
85 total); E2E by `frontend/e2e/finance-reports-journey.spec.ts` (5
journeys).

### Backend — reporting additions
- [x] `GET /reporting/recent-transactions` (FINANCE_MANAGER only, 403 others): latest ledger rows with real party labels, newest first — `'GET /reporting/recent-transactions: finance manager gets real ledger rows with party labels; other roles 403'`
- [x] `GET /reporting/revenue-mix`: per-channel SALE sums + pct; respects the same period params as `/reporting/kpis` — `'GET /reporting/revenue-mix: per-channel sums add up to the total, pcts computed'`
- [x] `GET /reporting/agency-settlements` (FINANCE_MANAGER only): per-agency paid ratio + status derived from Phase 3 invoices — `'GET /reporting/agency-settlements: per-agency paid ratio + status from real invoices; finance only'`
- [x] FINANCE_MANAGER may now trigger the Phase 3 invoice remind (design shows the action in its settlements rows) — `'FINANCE_MANAGER can now trigger the Phase 3 invoice remind (design: settlements row action)'`
- [x] `GET /passenger-reports/search`: name-substring and exact-national-ID (hash) search; national ID masked in every response; 403 for roles without the tab — `'…name search returns ticket details; national ID always masked'` + `'…a 10-digit query matches by national-ID hash exactly'` + `'passenger reports: roles without the tab (CEO, IT) get 403'`
- [x] `GET /staff-reports`: only EMPLOYEE users of the caller's dept; audit-feed rows real; `staffId` filter; dept isolation — `'GET /staff-reports: finance manager sees only finance-dept employees and their real audit feed'` + `'GET /staff-reports?staffId= filters to one employee; a foreign-dept staffId yields an empty feed'` + `'staff reports: roles without the tab (SENIOR_MANAGER) get 403'`
- [x] New-employee banner rows come from real `AuditLog(category=ACCOUNT)` events — verified by inspection of `StaffReportsService.reports` (query filters `category: 'ACCOUNT', entityType: 'User'`) + the frontend banner test below

### Frontend — مالی tab
- [x] Analytic view (CEO/Chair/Senior/Commercial): dark design (subtitle «فروش هر پرواز…», chips روزانه→شماره پرواز, channel tiles + inline flights, KPI trend cards, flights strip, «ترکیب درآمد» donut) — `FinancePage.test.tsx`: `'CEO gets the analytic view: sales chart + revenue mix, no transactions/settlements'`
- [x] «شماره پرواز» mode: `GET /reporting/flight-sales` picker (search + cards), selected-flight channel tiles, year-scoped KPIs/donut — `FinancePage.test.tsx`: `'CEO شماره پرواز mode shows searchable flight cards and selected-flight summary'` + `reporting.e2e-spec.ts`: `'flight-sales lists departed instances…'`
- [x] Picker collapses many departed instances of the same `flightNo` into **one** card (aggregated sales/seats); search still shows that single box — same FinancePage test (multi-instance EP-805 fixture)
- [x] Flight cards appear **only after search** (no default catalog dump); empty query shows prompt — same FinancePage test
- [x] Finance-ops view (FINANCE_MANAGER): KPI row, low-sales alert, completed-flights box, transactions list, donut, settlements rows with paid-ratio bars and «ارسال یادآوری» wired to the real Phase 3 remind endpoint — `'FINANCE_MANAGER gets the finance-ops view: transactions, settlements, remind action'`
- [x] nav flags flipped to `implemented: true` for `finance` in all 5 roles — E2E journeys click the real nav link

### Frontend — گزارش مسافران
- [x] Search box + result card with the design's no-result state — `PassengerReportsPage.test.tsx`: `'searches and shows the ticket detail card with a masked national ID'` + `'shows the design no-result state'`
- [x] nav flag flipped for `reports` (Senior/Finance/Commercial) — E2E journey

### Frontend — گزارش کارمندان
- [x] Per-employee tabs, report cards, empty state, new-employee banner — `StaffReportsPage.test.tsx`: `'renders the staff tabs, real audit feed, and the new-employee banner; filters by employee'`
- [x] nav flag flipped for `staff` (Finance/Commercial) — E2E journey

### Tests
- [x] Backend: role isolation (403s), masked PII, dept isolation, settlement-status derivation, revenue-mix sums vs seeded ledger — the 10 tests above
- [x] Frontend: unit tests per new page — 5 tests above
- [x] Playwright: `'Finance Manager opens مالی and sees real transactions, revenue mix, and agency settlements'`, `'CEO opens مالی and gets the analytic view (no finance-ops sections)'`, `'Senior searches گزارش مسافران and sees the ticket card with a masked national ID'`, `'Finance Manager sees گزارش کارمندان with only its own dept employees'`, `'Role isolation: CEO has no گزارش مسافران/گزارش کارمندان nav entries'`

### Phase 35 — صف مغایرت‌های پرداخت (payment-reconciliation queue)

`GET /reconciliation` / `PATCH /reconciliation/:id/resolve` (`FINANCE_MANAGER`
only) were built and e2e-tested in Phase 13 Part E but never got a
frontend surface or a docs/API.md section of their own — found via an
endpoint-vs-frontend-caller audit, not flagged in any prior phase's
deferred list. No design mock exists for this screen either (it's a
backend-only addition from a later phase, after the original design
extraction) — a new, functionally-styled card, not a redesign of an
existing one, same approach as other un-mocked backend-only controls
added earlier in this project (e.g. Phase 13 Part A's aircraft-type
change field).

- [x] FINANCE_MANAGER's مالی tab shows a «صف مغایرت‌های پرداخت» card
      listing every `PENDING` row (PNR, gateway ref, amount, date), with
      an empty state when there are none — `FinancePage.test.tsx:
      'FINANCE_MANAGER gets the finance-ops view...'` (empty-state
      assertion) + `'shows the payment-reconciliation queue and resolves
      an item with a required note'`
- [x] Resolving requires a note (client-side validated to match the
      backend's own `@MinLength(3)`, without a wasted API call for an
      empty/too-short one) and removes the row from the list on success —
      same test, both assertions

## Finance panel alignment (2026-07-31)

Design reference: `design-reference-v2/پنل مدیر مالی.dc.html`. Nav for
`FINANCE_MANAGER` matches design exactly (7 tabs — `flightops` removed).

### Backend
- [x] `GET /reporting/finance-dashboard-stats` (CEO, BOARD_CHAIR, SENIOR_MANAGER, FINANCE_MANAGER): active agencies, passengers/tickets/revenue this month with month-over-month trend pct — `'GET /reporting/finance-dashboard-stats: executive + finance roles get real dashboard cards; others 403'`
- [x] `GET /reporting/kpis` now includes `trends` (revenue/profit/cost/debt pct vs previous period) — `'GET /reporting/kpis: returns trend percentages alongside KPI values'`
- [x] `GET /reporting/recent-transactions` rows include `statusFa` + `statusTone` — extended assertion in existing recent-transactions test

### Frontend
- [x] FINANCE_MANAGER gets a dedicated `FinanceDashboardPage` (4 stat cards, sales chart, cartable widget) via `DashboardRouter` — `FinanceDashboardPage.test.tsx`
- [x] `FinancePage` finance-ops view: period picker, KPI trend badges, transaction status pills, multiple low-sales alerts — existing `FinancePage.test.tsx` (mocks updated)
- [x] `AgencyDetailPage`: FINANCE_MANAGER sees issued invoices with pay/remind (no issue button) — `AgencyDetailPage.test.tsx`

### Tests
- Backend e2e: 12 tests in `finance-reports.e2e-spec.ts` (+2 new)
- Frontend: `FinanceDashboardPage.test.tsx` (+1 test)

## Deferred (scoped out with reasons, not silently dropped)
- Excel/PDF export buttons — mock-only toasts in the design, consistent with every prior phase's deferral.
- The finance mock's `finMonths` income/expense chart — computed in the mock script but never rendered in any panel's markup (orphaned).
- «علامت‌گذاری به‌عنوان خوانده‌شده» persistence for the new-employee banner — client-side state in the mock, kept client-side.
