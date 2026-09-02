# Commercial panel — agencies cross-view tabs, web-service & seat-request modals

**Status: backend implemented on `cursor/backend-commercial-overhaul-20260818`
(from `claude/frontend-overhaul-20260816`).** Production pages call
`frontend/src/api/agencies.ts`. Mock adapters remain only as isolated
fixtures (`frontend/src/api/agencies-mock.ts`) and are not imported by
feature pages.

Source: uploaded design handoff `design_handoff_commercial_panel/` —
sections "AGENCIES: MAIN TABS", "AGENCIES WITH DEBT", "ALL INVOICES",
"ALL COOPERATION REQUESTS", "ALL SEAT REQUESTS", "HISTORY TAB",
"WEB SERVICE REQUEST DETAIL MODAL", "SEAT REQUEST DETAIL MODAL".

## Acceptance checklist

### Real data (no mock)

- [x] Commercial Manager's آژانس‌ها page shows a 3-pill tab bar (آژانس‌های
  همکار / درخواست همکاری / آژانس‌های دارای بدهی) —
  `GET /agencies`, `GET /agencies/requests`,
  `POST /agencies/debtors/notify-all`, `POST /agencies/:id/settle`
  — `AgenciesListPage.test.tsx` › "sees the 3-tab bar and the agency list
  by default", "coop-requests tab shows pending requests", "debtors tab
  shows the notify-all + all-invoices entry points"
- [x] Non-Commercial roles (`SITE_ADMIN`/`EMPLOYEE`/`SENIOR_MANAGER`/
  `FINANCE_MANAGER`) branch is unchanged —
  `AgenciesListPage.test.tsx` Senior/Finance-role tests
- [x] Web-service purchase requests preview box —
  `GET /agencies/webservice-requests` —
  `AgenciesListPage.test.tsx` › "web service request preview opens the
  real-data detail modal"; `WebserviceRequestDetailModal.test.tsx`
- [x] Agency detail page تاریخچه (History) tab reuses
  `AgencyDetail.commercialExtras.transactions` —
  `AgencyDetailPage.test.tsx`
- [x] `GET /agencies/invoices` cross-agency aggregate with
  `?status=UNPAID|PAID|VOIDED` — `AgenciesService.listAggregateInvoices`,
  `backend/test/commercial-overhaul.e2e-spec.ts`,
  `frontend/src/api/commercial-adapters.test.ts` › `fetchAggregateInvoices`
- [x] OVERDUE is preserved internally and never mapped to VOIDED. The
  UNPAID tab matches `UNPAID` + `OVERDUE` and serializes OVERDUE as
  `UNPAID` on the wire — `docs/API.md`
- [x] `GET /agencies/seat-requests` structured manager queue —
  `AgenciesService.listSeatRequests`,
  `backend/test/commercial-overhaul.e2e-spec.ts`
- [x] `PATCH /agencies/seat-requests/:id/decide` creates one
  `AgencyInvoice` on approve, none on reject; repeats return 409;
  cartable `sourceId` is synced — e2e commercial-overhaul
- [x] `POST /agency-portal/seat-requests` persists
  `agency_seat_requests` + `agency_seat_request_flights` and keeps the
  cartable task as a notification
- [x] History tab seat-request sub-list is the real adapter filtered by
  `agencyId` — `AgencyDetailPage.tsx` / `fetchAggregateSeatRequests`

### Compatibility decisions

- termMonths accepted: `1 | 3 | 6 | 12` (smallint). Legacy portal
  `3|6|12` plus commercial UI `1|3|12`. Omitted term stores null and
  lists as `1`.
- Portal POST still accepts a single `flightInstanceId`; the join table
  can hold multiple flights.
- `agencyId` on the seat-request row is the agency user id, with no FK
  to `agency_profiles`, so the UAT sandbox identity can persist a
  request. Invoice-on-approve still requires a real profile.

### Explicitly NOT done this phase

- [ ] No merge to `main`, no deploy. After PR #168 merges, rebase this
  branch onto `main` and retarget the PR.
