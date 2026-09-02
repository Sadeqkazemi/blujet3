# EMPLOYEE panel dark-align (design-reference-v2 + screenshots)

Acceptance checklist for پنل کارمند parity with user screenshots
(سمیرا احمدی / واحد بازرگانی) and `design-reference-v2/پنل کارمند.dc.html`.

## Nav
- [x] «مدیریت پروازها» removed from employee sidebar — no `flights` in `EMPLOYEE_SECTION_NAV`
- [x] Labels: مدیریت آژانس‌ها / گزارش‌ها / کارتابل / ارجاعات — `panels.e2e-spec.ts`
- [x] `com.ahmadi` gets agencies + reports + cartable + referrals, never flights
- [x] `sales.moradi` gets agencies + cartable + referrals, never flights
- [x] Zero-perm `emp.none` still gets dashboard + referrals

## Shell
- [x] Brand subtitle «پنل کارمند» — `PanelShell` ROLE_BRAND_SUB
- [x] No «نقش این پنل» chip for EMPLOYEE
- [x] Footer: initials + fullName + واحد · رتبه + logout

## Dashboard
- [x] Title «داشبورد کارمند» + green واحد pill — `EmployeeDashboardPage`
- [x] KPI row: کارهای باز / ارجاعات در انتظار / واحد سازمانی
- [x] Permissions card with green check chips (no flights)

## Agencies
- [x] Employee table view آژانس / شهر / مجوز / وضعیت — `EmployeeAgenciesPage` via `AgenciesRouter`

## Reports
- [x] «گزارش‌های من» activity feed — `EmployeeReportsPage` + `GET /staff-reports/mine`

## Referrals
- [x] Dark cards + شروع بررسی / تکمیل و بستن / ارجاع این کار — `MyReferralsPage`

## Cartable
- [x] Dark employee cartable — `EmployeeCartablePage`

## Seed logins
- `com.ahmadi` / `Blujet@1404` — سمیرا احمدی (agencies, reports, cartable, referrals)
- `sales.moradi` / `Blujet@1404` — commercial demo (no flights)
- `emp.none` / `Blujet@1404` — zero permissions
# Superseded navigation decision

The earlier requirement in this file to hide flight surfaces from every
employee was superseded by the 2026-08-13 unit-derived access requirement.
Employees now receive manager-derived navigation only when IT grants the
matching live permission; see `it-employee-unit-access.md`. The demo accounts
remain flight-free until such a grant is made.
