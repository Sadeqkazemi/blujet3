# Unified panel themes and active-flight presentation

## Scope

- Management and employee panels (Persian/RTL)
- Agency portal and authenticated customer account (fa/en/ar direction rules unchanged)
- Commercial dashboard, agency seat-request section, staff/user reports, and active-flight list

## Acceptance checklist

- [x] Light mode contains no hard-coded dark surfaces in the reported commercial-dashboard, agency-request, finance-summary, staff-report, and active-flight surfaces; the shared management compatibility layer covers remaining legacy panel utilities.
- [x] Dark mode applies consistently to management/employee shells and the agency/customer portal shells without changing role permissions.
- [x] A persistent, keyboard-accessible theme control switches light/dark mode and restores the last choice.
- [x] Commercial dashboard summary bands and agency seat-request sections use theme tokens instead of fixed navy backgrounds.
- [x] Active flights use a professional card/table hybrid with clear route, schedule, capacity, fare classes, status, and channel-sale actions.
- [x] Active-flight rendering uses only API data and retains loading, error, and empty states.
- [x] Agency sales reports already paginate at 10 rows; staff/user audit reports now explicitly show 10 real records per page.
- [x] Wallet destinations in agency and customer navigation/cards use a wallet icon and remain readable in all locales/themes.
- [x] Existing RTL/LTR locale behavior, RBAC, API calls, and financial data rules remain unchanged.
- [x] Focused frontend tests cover theme switching/persistence, report pagination, wallet navigation, and active-flight card structure.
- [x] Frontend lint, build, and affected tests pass.
- [x] The commercial flight-detail modal uses panel tokens/default dark chrome instead of forcing a light variant; the selected tab and channel chart no longer leave white surfaces in dark mode.
- [x] Active-flight presentation is exactly one compact flight card per row at every desktop breakpoint.
- [x] Agency/customer header legacy inline ink colours are normalized to white/gray in dark mode while light mode retains black/gray copy.

## Evidence

- `PanelShell.test.tsx`: persisted management theme switching.
- `AgencyPortalShell.test.tsx`: agency theme switching and wallet destination.
- `AccountPage.test.tsx`: customer theme switching and wallet navigation.
- `StaffReportsPage.test.tsx`: exactly 10 report records per page.
- `FlightsPage.test.tsx`: commercial active-flight card structure.
- `FlightsPage.test.tsx`: flight-detail dialog asserts dark modal chrome and rejects the former `bg-white` shell.
- Verification on 2026-08-30: `npm run lint` (no errors; pre-existing warnings only), `npm run build`, and 80 focused tests across seven affected suites.
- In-app visual automation was attempted, but no browser backend was connected in this session; source-level token audit and component tests were used instead.
- Verification follow-up on 2026-08-30: the browser backend connected successfully, but the isolated branch origin had no authenticated staff session; production builds and component-level modal/theme assertions were therefore used for the protected screen.
