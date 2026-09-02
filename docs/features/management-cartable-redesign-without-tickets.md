# Management cartable redesign without support tickets — acceptance checklist

## Product boundary

- [x] The cartable route of SITE_ADMIN, every manager, and every employee renders only internal organizational work.
- [x] The assigned-support-ticket workspace is not mounted, fetched, or linked from any manager/employee cartable.
- [x] SITE_ADMIN keeps the existing dedicated support center on `/panel/tickets`; ticket APIs, assignment, replies and status behavior are unchanged and are not embedded in `/panel/cartable`.
- [x] Cartable labels, filters, summaries, empty states, rows, and actions use internal-work terminology and never support-ticket terminology.
- [x] Existing internal cartable decisions, transfers, manager messages, employee completion, and operations flight approval remain functional.

## Visual acceptance

- [x] SITE_ADMIN and executive/manager cartables use the same compact ticket-inspired dashboard composition: internal-work heading, status summary cards, filters/search, organized rows, and 10-row pagination.
- [x] Employee cartable uses the same visual language while retaining employee permission boundaries and manager-message history.
- [x] Operations cartable uses the same visual language while retaining its flight decision workflow.
- [x] Empty, loading, error, and filtered-empty states remain explicit and contain no mock rows.
- [ ] The layout remains RTL and usable at desktop and mobile widths.

## Automated proof

- [x] `CartableRouter.test.tsx` proves no assigned support workspace renders for CEO, EMPLOYEE, OPERATIONS_MANAGER, IT_MANAGER, or SITE_ADMIN cartables.
- [x] `CartablePage.test.tsx` proves internal status cards, search, task rows, pagination, and existing decisions continue to work.
- [x] `EmployeeCartablePage.test.tsx` proves internal summary/search and permission-aware task actions continue to work.
- [x] `OperationsCartablePage.test.tsx` proves internal summary/search and the operational decision flow continue to work.
- [x] Focused frontend tests, lint, production build, and `git diff --check` pass.
