# Feature: EMPLOYEE cartable (Phase B)

Covers `design-reference-v2/پنل کارمند.dc.html` cartable tab + dashboard KPI
cards. Backend permission keys `ct_list` / `ct_process` gate the tab and
actions; `referrals` stays unconditional (Phase 26).

## Acceptance checklist

### Backend — permission + nav
- [x] `ct_list` / `ct_process` seeded in `PERMISSION_CATALOG` (commercial + finance depts)
- [x] `EMPLOYEE_SECTION_NAV.cartable` wired; nav appears when employee holds either key
- [x] `GET /panels/employee-context` returns dept label + permission chip labels

### Backend — cartable access
- [x] `GET /cartable` — EMPLOYEE + `ct_list`; self-scoped tasks only — `employee-cartable.e2e-spec.ts`
- [x] `PATCH /cartable/:id/approve` — EMPLOYEE + `ct_process`; reject/transfer/chair-permission stay exec-only — same file
- [x] `POST /cartable/manager-message` — creates `EMPLOYEE_MESSAGE` cartable task for target manager — same file
- [x] `GET /cartable/manager-message/sent` — caller's sent messages — same file
- [x] `GET /cartable/manager-recipients` — exec managers with `isOwnManager` flag — covered by frontend + send test
- [x] Employee without `ct_*` gets 403 on cartable endpoints — same file

### Frontend
- [x] `CartableRouter` renders `EmployeeCartablePage` for EMPLOYEE, `CartablePage` for exec roles — structural
- [x] `EmployeeCartablePage`: message-to-manager form, task cards with «انجام شد ✓», empty state — `EmployeeCartablePage.test.tsx` (4 tests)
- [x] `EmployeeDashboardPage`: KPI cards (open cartable, pending referrals, unit) + permission chips — `EmployeeDashboardPage.test.tsx`
- [x] `PanelShell` cartable badge when nav includes `cartable` (pre-existing fetch) — Phase C `PanelShell.test.tsx`

### Tests
- [x] Backend e2e in `employee-cartable.e2e-spec.ts` (6 tests)
- [x] `panels.e2e-spec.ts` — sales.moradi nav includes `cartable`
- [x] `EmployeeCartablePage.test.tsx` (4 tests)
- [x] `EmployeeDashboardPage.test.tsx` updated for KPI cards (5 tests)
