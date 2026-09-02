# Panel sidebar badges + Jalali day-picker (Phase C)

Closes deferred items from `docs/features/panel-shell-dashboard.md`:
sidebar badge gaps (referrals) and finance-ops day/month chart filtering.

## Acceptance checklist

| # | Behavior | Test |
|---|----------|------|
| 1 | Cartable badge (red) on open tasks count | `PanelShell.test.tsx` |
| 2 | Refund payout-queue badge (purple) for FINANCE_MANAGER | `PanelShell.test.tsx` |
| 3 | Staff new-employee badge (red) | `PanelShell.test.tsx` |
| 4 | IT logs badge (7-day count) | `it-manager.md` (existing) |
| 5 | Referrals badge (purple `#a855f7`) — SENIOR_MANAGER `awaitingReport` | `PanelShell.test.tsx` |
| 6 | Referrals badge — EMPLOYEE `awaitingMyReport` | `PanelShell.test.tsx` |
| 7 | Badge pill aligned to nav-row end (design `justify-between`) | `nav-badge-*` testids |
| 8 | Dashboard day mode shows `JalaliDatePicker` + passes `date` param | `DashboardPage.test.tsx` |
| 9 | Dashboard month mode passes `periodStart` param | `DashboardPage.test.tsx` |
| 10 | Finance ops view (FINANCE_MANAGER) day/month via `SalesChartControls` | `FinancePage.test.tsx` |
| 11 | Finance analytic view day/month (existing `SalesChartControls`) | manual / prior coverage |

## Deferred

- Flight-number granularity on finance-ops KPI row (analytic view only; flight
  mode excluded from ops view intentionally — no sales chart there).
- Agencies pending-request sidebar badge (design shows pending count on
  dashboard widgets, not sidebar, for senior manager).

## Files touched

- `frontend/src/components/PanelShell.tsx`
- `frontend/src/components/PanelShell.test.tsx`
- `frontend/src/features/finance/FinancePage.tsx`
- `frontend/src/features/dashboard/DashboardPage.test.tsx`
- `frontend/src/features/finance/FinancePage.test.tsx`
- `docs/features/panel-sidebar-badges-day-picker.md`
- `docs/features/panel-shell-dashboard.md` (checklist update)
- `PLAN.md`
