# Feature: staff auth + panel shell + dashboard/reporting (Phase 1)

Covers the endpoints in `docs/API.md` → "Phase 1" and the data model in
`docs/DB_SCHEMA.md` → "Phase 1". Scope: the shared shell + dashboard/finance
tab used identically by CEO, Board Chair, Senior Manager, Finance Manager,
and Commercial Manager. Role-specific tabs beyond the dashboard (Agencies,
Cartable, VIP Club, Pricing, Refunds, Employee management, Reservation) are
later phases — not in scope here.

**Scope note on IT Manager**: IT's real dashboard (per the design extraction)
is service-health widgets, not the shared sales/KPI chart — it's excluded
from `reporting.controller.ts`'s allowed roles and its `panels/nav` entry is
`implemented: false`, so it renders the coming-soon placeholder rather than
a broken fetch-and-error dashboard. Building IT's actual dashboard is a
later phase.

**Scope note on chart granularity**: `q3`/`q6`/`year` are wired end-to-end
(backend + frontend). `day`/`month` granularities are implemented on the
**backend** (bucket logic + flight-scoped queries) and now wired on the
**frontend** via shared `SalesChartControls` + `JalaliDatePicker` on the
shared dashboard and both finance views (ops + analytic). `flight` mode
remains on dashboard/analytic views only (flight search input). See
`docs/features/panel-sidebar-badges-day-picker.md`.

## Acceptance checklist

### Staff auth
- [x] Login with correct username/password → 2FA challenge issued, no token yet — `backend/test/auth.e2e-spec.ts` › "issues a 2FA challenge on correct password, no token yet"
- [x] Login with wrong password → 401, no challenge issued — `auth.e2e-spec.ts` › "rejects a wrong password..."
- [x] Login for a suspended account (`isActive=false`) → `ACCOUNT_SUSPENDED`, 403 — `auth.e2e-spec.ts` › "rejects login for a suspended account..."
- [x] 2FA verify with correct code → access token + refresh cookie issued — `auth.e2e-spec.ts` › "logs in with the correct 2FA code..."
- [x] 2FA verify with wrong code → `TWO_FACTOR_INVALID`, attempts counter increments — `auth.e2e-spec.ts` › "rejects a wrong 2FA code..."
- [x] 2FA code expires after 2 minutes → `TWO_FACTOR_EXPIRED` — `auth.e2e-spec.ts` › "rejects an expired 2FA challenge"
- [x] 2FA code is single-use (replay fails) — `auth.e2e-spec.ts` › "a 2FA code cannot be replayed once consumed"
- [x] Rate limiting on login — `auth.e2e-spec.ts` › "rate-limits repeated login attempts"
- [x] Passwords stored as argon2 hashes only, never plaintext — `auth.e2e-spec.ts` › "rejects passwords stored as plaintext..."
- [x] `/auth/refresh` rotates the refresh token; old one is rejected on reuse — `auth.e2e-spec.ts` › "/auth/refresh rotates the refresh token..."
- [x] `/auth/logout` revokes the refresh token; subsequent refresh fails — `auth.e2e-spec.ts` › "/auth/logout revokes the refresh token..."

### RBAC / panel shell
- [x] `/auth/me` returns the correct `role` — `auth.e2e-spec.ts` › "/auth/me returns the correct identity..."
- [x] `/panels/nav` returns exactly the confirmed tab set per role — `backend/test/panels.e2e-spec.ts` › "returns the confirmed tab set for Finance Manager..." / "...for CEO"; frontend-side in `frontend/e2e/staff-login-journey.spec.ts`
- [x] A request to a role-restricted endpoint from the wrong role → 403 — `reporting.e2e-spec.ts` › "IT Manager (not a reporting role) gets 403..."; `audit.e2e-spec.ts` › the two 403 cases
- [x] Backend independently rejects even if a client bypasses the UI — every `panels.e2e-spec.ts`/`reporting.e2e-spec.ts` 403 test hits the endpoint directly with a real (mismatched-role) token, not through the UI
- [x] CEO/Senior Manager can toggle `PanelAccessFlag`; toggled-off panel 403s for that role — `panels.e2e-spec.ts` › "CEO can toggle a sibling panel off..."
- [x] Toggling writes an `AuditLog(category=ACCESS)` row — same test, asserts the audit row
- [x] Concurrency: two simultaneous toggles of the same panel — `panels.e2e-spec.ts` › "two simultaneous toggles of the same panel from two CEO sessions..."

### Reporting (sales chart / KPIs / completed-flights / low-sales alert)
- [x] `sales-chart?granularity=q6` returns 6 periods reconciling with `kpis` revenue — `backend/test/reporting.e2e-spec.ts` › "sales-chart q6 returns 6 periods whose per-channel sum reconciles..."
- [x] `granularity=month` daily-bucket logic — unit-tested in `backend/src/modules/reporting/reporting.service.spec.ts` › "month granularity returns one bucket per day..." (frontend UI deferred, see scope note above)
- [x] `granularity=flight&flightNo=...` returns only that flight's sales — `reporting.e2e-spec.ts` › "sales-chart by flightNo returns only that flight's sales"
- [x] `kpis?periodKey=<bar>` re-scopes; summed periods equal the full-range total — `reporting.e2e-spec.ts` › "kpis re-scope to a single periodKey..."
- [x] `marginPct` is derived, never hardcoded — `reporting.e2e-spec.ts` › "marginPct is derived..."
- [x] `completed-flights-summary` reconciles `sold + unsold === total` — `reporting.e2e-spec.ts` › "completed-flights-summary reconciles..."
- [x] `low-sales-alerts` only returns flights under the occupancy threshold — `reporting.e2e-spec.ts` › "low-sales-alerts only returns flights..."
- [x] Aggregates computed in SQL/service layer, never shipped as raw rows to the frontend for client-side summing — verified by code review of `reporting.service.ts` (Prisma queries + server-side reduce, nothing summed in React)
- [x] Money is a raw integer IRR in every response — `reporting.e2e-spec.ts` › "money fields are raw integers..."; frontend applies `faMoney`/`faDigits` at render time only (`frontend/src/lib/fa-format.ts`, unit-tested)

### Manager activity / audit feed
- [x] CEO's `manager-reports` excludes CEO/SENIOR_MANAGER/BOARD_CHAIR as actor — `backend/test/audit.e2e-spec.ts` › "CEO's manager-reports excludes..."
- [x] Board Chair/Senior Manager see every role, unfiltered — `audit.e2e-spec.ts` › "Senior Manager's manager-reports includes every role..."
- [x] IT's `logs` only returns SYSTEM/ACCOUNT categories — `audit.e2e-spec.ts` › "IT Manager's system logs only include..."
- [x] Non-permitted roles get 403 on both endpoints — `audit.e2e-spec.ts` › the two 403 cases

### Frontend (Vitest + RTL)
- [x] Login form renders RTL, Persian labels, inline Persian validation errors — `frontend/src/features/auth/LoginPage.test.tsx`
- [x] Server error message surfaces inline in Persian — `LoginPage.test.tsx` › "shows the server error message when login fails"
- [x] KPI cards render Persian digits + تومان formatting — `frontend/src/lib/fa-format.test.ts`; rendered end-to-end in `frontend/src/features/dashboard/DashboardPage.test.tsx`
- [x] Sales chart renders legend/bars, selection toggles, table-view fallback — `frontend/src/components/SalesBarChart.test.tsx`
- [x] Dashboard loading/error states render — `DashboardPage.test.tsx` › the success and error-message cases
- [x] Executive `DashboardPage` (CEO/Chair/Senior) matches design-reference-v2 dark dashboard: KPI cards آژانس/مسافر/بلیط/درآمد, low-sales 72h banner, گزارش مالی channel bar+tiles (not bar chart), کارتابل widget — `DashboardPage.test.tsx`
- [x] Across reporting dashboards: exactly **one** low-sales banner (`alerts[0]`); remaining alerts open in the header notification bell — `DashboardPage.test.tsx` › `'shows only one low-sales banner and puts the rest in notifications'`
- [x] Day/month/flight modes show the deferred-scope message rather than a broken fetch — superseded: day/month now use `SalesChartControls` + `JalaliDatePicker` (Phase C, `panel-sidebar-badges-day-picker.md`); flight mode uses flight-no input on dashboard/analytic finance views
- [x] 2FA step component test (renders after password submit, not before) — `frontend/src/features/auth/TwoFactorPage.test.tsx` (Phase 32). Writing the "not before" case caught a real bug: `TwoFactorPage` called `navigate('/login')` during render instead of in a `useEffect`, so React Router's own guard silently dropped the navigation — visiting `/login/2fa` directly with no `challengeId` in location state rendered a blank page instead of redirecting. Fixed by moving the call into a `useEffect` keyed on `challengeId`; see PLAN.md's Phase 32 entry.

### E2E (Playwright)
- [x] Full staff login journey (password → 2FA → dashboard) per role, landing on that role's dashboard with only its permitted tabs — `frontend/e2e/staff-login-journey.spec.ts`, parametrized over finance/ceo/itadmin
- [x] A role whose dashboard isn't implemented (IT) gets the coming-soon placeholder honestly, not an error — same spec, `hasSalesDashboard: false` case
- [x] An unauthenticated visitor is redirected to `/login` — same spec
- [x] A "coming soon" tab renders without crashing — same spec
- [ ] Pixel-level visual check against `design-reference/پنل مدیر مالی.dc.html` — not automated (no visual-regression tooling wired up yet); manually screenshot-compared during Phase 1 development and judged a reasonable-fidelity recreation, not a pixel diff

---

The pixel-level visual-regression check is the only item left unchecked
(the 2FA unit test above was closed in Phase 32) — no visual-regression
tooling is wired up yet, and the visual fidelity was manually
screenshot-verified during Phase 1 development.
