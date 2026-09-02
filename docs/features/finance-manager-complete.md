# Finance manager panel completion

Approved references: screenshots supplied 2026-08-13 for «مالی»، «گزارشات و
خروجی»، and «اتصال نرم‌افزارهای مالی».

## Acceptance checklist

- [x] Finance-manager sidebar includes the two new implemented destinations in
  the approved order and shows the real connected-provider count.
- [x] Main finance page matches the approved dark RTL hierarchy: KPI cards,
  low-sales alert, completed-flight strip, recent transactions/revenue mix,
  and agency settlements. The unrelated report-range control is absent.
- [x] Reports page implements agency, charter, customer, and flight-search
  tabs with flight/day/month/quarter/half-year/year filters shown by the
  reference.
- [x] Jalali month/day controls filter real backend results; empty periods show
  an explicit empty state and never seeded browser-only values.
- [x] CSV and Excel actions download the currently filtered real report.
- [x] Flight search returns real flights, supports selection, and renders real
  seat/sales/agency settlement details.
- [x] Accounting connections list Holo, Sepidar, Hesabfa, Rahkaran, and Parmis;
  API keys are encrypted and only a masked suffix is returned.
- [x] Connect/sync/disconnect call real backend adapters, fail closed when
  provider deployment configuration is absent, and write audit entries.
- [x] Backend endpoints have role guards, validation, Swagger operation/error
  documentation, and focused unit tests.
- [x] Frontend has loading, empty, error, retry, success, and disabled/busy
  states and focused interaction tests.
- [x] Frontend/backend build, typecheck, lint, and test suites pass before the
  diff is offered for review; merge/deploy happens only after user approval.
