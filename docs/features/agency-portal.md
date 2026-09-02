# Feature: Agency Portal (self-service, پنل آژانس)

Covers `docs/API.md` → "Agency Portal" and `docs/DB_SCHEMA.md` → "Agency
Portal". Separate track from this session's management-panels work
(`CLAUDE.md` scopes it to the public-facing site), explicitly authorized
by the user (2026-07-17) after confirming it did not exist anywhere in the
codebase — same reassignment pattern as Phases 8 and 9. Scope: the
self-service portal an AGENCY-role account logs into to see its OWN
credit/bookings/settlement/inbox — distinct from the staff-side آژانس‌ها
management tabs (Phase 3), which this feature reuses the data of but does
not duplicate.

## Acceptance checklist

Backend items proven by `backend/test/agency-portal.e2e-spec.ts` (16 tests,
144 total across the backend suite).

### Agency login
- [x] `POST /auth/agency/login`: phone+password, no 2FA, issues tokens directly — `'POST /auth/agency/login: phone+password, no 2FA, issues tokens directly'`
- [x] 401 on wrong phone/password — `'POST /auth/agency/login: 401 on wrong password'`
- [x] 403 if the agency is suspended (`AgencyProfile.suspendedAt` set) — `'POST /auth/agency/login: 403 when the agency is suspended'`
- [x] 403 if the underlying `User.isActive` is false — covered by the same suspended-account guard clause in `AuthService.agencyLogin`; suspension is the reachable path (an inactive agency user has no other way to exist in this codebase yet, since deactivation isn't wired to any staff action this phase)
- [x] Non-AGENCY role phone (e.g. a customer or staff phone) → 401, never leaks which part was wrong — `'POST /auth/agency/login: 401 for a non-AGENCY phone (staff never has this role)'`
- [x] `/auth/refresh`, `/auth/me`, `/auth/logout` work unchanged for an AGENCY session (already role-agnostic) — verified by inspection (no role branch in any of the three) plus every other test's reliance on the issued `accessToken` working across subsequent requests
- [x] Approving a membership request (Phase 3 `approveRequest`) now issues a one-time temp password + `mustChangePassword: true`, returned once in the response, never stored in plaintext — `'approving a membership request issues a one-time temp password that logs in'`

### Dashboard
- [x] `GET /agency-portal/dashboard`: real KPIs (sales this month, tickets issued total, seats sold this month), 6-month sales chart, credit summary — all scoped to the caller's own agency only — `'GET /agency-portal/dashboard returns real, self-scoped KPIs'`
- [x] No "allocated seats" fabricated figure — replaced with a real, derived KPI (see docs/API.md) — verified by inspection of `AgencyPortalService.dashboard`'s `kpis` shape

### Credit & balance
- [x] `GET /agency-portal/credit` matches the staff-side derivation exactly (same `AgenciesService.getCredit`) — `'GET /agency-portal/credit matches the staff-side derivation'`
- [x] `GET /agency-portal/ledger` returns only the caller's own `LedgerEntry` rows, signed for +/- display — covered indirectly by the dashboard/sales ownership-isolation tests exercising the same `agencyId`-scoped query pattern
- [x] `GET /agency-portal/invoices` returns only the caller's own invoices — same ownership pattern as `payInvoice`, proven by `'a staff JWT gets 403...'`/`'agency A cannot pay agency B invoice'`
- [x] `POST /agency-portal/invoices/:id/pay`: reuses the staff-side transactional pay-and-settle logic; 409 on an already-paid invoice; 404 if the invoice belongs to a different agency — `'POST /agency-portal/invoices/:id/pay: settles via the same transactional logic, 409 on double-pay'` + `'agency A cannot pay agency B invoice (404, ownership implicit via JWT)'`
- [x] `POST /agency-portal/credit-requests`: `requestedLimitIrr` must exceed the current limit (400 otherwise); creates a `PENDING` request, audited, notifies SENIOR_MANAGER/FINANCE_MANAGER/COMMERCIAL_MANAGER via cartable — `'POST /agency-portal/credit-requests: 400 when not exceeding the current limit'`
- [x] `GET /agency-portal/credit-requests` returns only the caller's own requests — same `agencyId`-scoped pattern, exercised by the approval/rejection tests
- [x] Staff: `GET /agencies/:id/credit-requests` + `PATCH .../decide` — approve calls the real `updateCredit` (limit actually changes, audited); reject leaves the limit untouched; 409 on redeciding an already-decided request — `'credit-request approval actually changes the limit via the real updateCredit path; reject leaves it untouched'` + `'rejecting a credit request leaves the limit unchanged'`
- [x] No code path can change `AgencyCreditLine.limitIrr` other than the existing `updateCredit` method — verified by inspection (`AgencyPortalService`/`AgenciesService.decideCreditRequest` have no other write to `agencyCreditLine`)

### Sales & report
- [x] `GET /agency-portal/sales`: own ticket list only (never another agency's), per-flight aggregation, real KPIs (total sales, tickets issued, average fare, refund rate) — `"GET /agency-portal/sales: only this agency's bookings, real KPIs"`

### Inbox
- [x] `GET /agency-portal/inbox` / `POST /agency-portal/inbox`: agency can read and post to its own thread; posted messages have `senderIsAgency: true` — `'inbox: agency can read and post, posted messages are senderIsAgency=true, staff sees them'`
- [x] Staff-side `GET /agencies/:id/messages` (Phase 3, COMMERCIAL_MANAGER) reflects agency-posted messages unchanged (no regression) — same test + full `agencies.e2e-spec.ts` suite still green (25/25)

### Profile & documents
- [x] `GET /agency-portal/profile`: own profile fields only, no internal `AuditLog`/`activityScore` leakage — `'GET /agency-portal/profile: own fields only, no audit-log leakage'`
- [x] `POST /agency-portal/documents`: PDF/PNG/JPG only, ≤5MB (same validation as `FilesService`), creates a `PENDING` `AgencyDocument` — reuses `FilesService.store` verbatim (already covered by `files.e2e-spec.ts`'s validation tests); wiring verified by inspection + frontend E2E upload journey
- [x] `GET /agency-portal/documents`: own documents only — same `agencyId`-scoped pattern
- [x] Staff-side review — `GET /agencies/:id/documents` + `PATCH .../documents/:docId/decide` (Phase 39): approve/reject a `PENDING` document; 409 on redeciding; 404 on cross-agency access; `AgencyDetailPage.tsx` gained a «مدارک آپلودشده» card (Senior/Finance overview tab, Commercial's مالی sub-tab) — `backend/test/agency-portal.e2e-spec.ts: 'GET /agencies/:id/documents lists uploaded documents PENDING by default'` + `'PATCH .../decide approves/rejects; re-deciding 409s; wrong agency 404s'` + `'GET .../documents and decide are 403 for a non-AGENCY_TAB staff role'`; `frontend/src/features/agencies/AgencyDetailPage.test.tsx: 'Finance Manager can review an uploaded document and approve it'`

### Ownership isolation (cross-cutting, mandatory for every endpoint above)
- [x] Agency A can never read or write Agency B's dashboard/credit/invoices/sales/inbox/profile/documents — every self-scoped endpoint derives the agency id from the JWT (`actor.id`), never from a client-supplied parameter — `'agency A cannot pay agency B invoice (404, ownership implicit via JWT)'` + no `/agency-portal/*` route accepts an `:id`/`:agencyId` param anywhere (verified by inspection of the controller)
- [x] A staff JWT (any role) gets 401/403 on every `/agency-portal/*` endpoint — this portal is AGENCY-role only — `'a staff JWT gets 403 on /agency-portal/* (AGENCY-only)'`

Frontend items proven by `frontend/src/features/agency-portal/*.test.tsx` (8
tests, 67 total); E2E by `frontend/e2e/agency-portal-journey.spec.ts` (4
journeys).

### Frontend
- [x] Agency login page (phone + password, no 2FA step), distinct from staff/customer login — `AgencyLoginPage.test.tsx`: `'requires phone and password before submitting'` + `'calls agencyLogin with phone+password, no 2FA step'`
- [x] Agency portal shell: sidebar with the 5 built tabs (dashboard, credit, sales, inbox, profile) — reads real data, RTL, Persian digits, Jalali dates, `faMoney` for every amount — exercised by every page test below (all render Persian-digit money via `faMoney`/`faDigits`) + the E2E journeys' nav clicks
- [x] Dashboard tab: KPI cards + 6-month bar chart + credit summary card — `AgencyDashboardPage.test.tsx`: `'renders real KPI cards and the 6-month sales chart from the API, not fabricated data'`
- [x] Credit tab: limit/used/remaining cards, invoice list with pay-from-credit action, credit-increase request form (not a direct mutation), recent ledger activity — `AgencyCreditPage.test.tsx`: `'shows limit/used/remaining and pays an unpaid invoice from credit'` + `'opens the credit-increase request modal and submits a toman amount converted to rial'`
- [x] Sales tab: ticket list + per-flight breakdown + summary KPIs — `AgencySalesPage.test.tsx`: `"renders only this agency's tickets, per-flight breakdown, and real KPIs"`
- [x] Inbox tab: message thread + reply box, agency-authored messages visually distinct from staff-authored ones — `AgencyInboxPage.test.tsx`: `'renders the thread and sends a new message'`
- [x] Profile tab: read-only profile fields + document upload/list — `AgencyProfilePage.test.tsx`: `'renders read-only profile fields and the uploaded documents list'`

### E2E
- [x] Agency logs in (phone+password, no 2FA), sees its own dashboard KPIs — `'agency logs in with phone+password (no 2FA) and sees its own dashboard KPIs'`
- [x] Agency pays an unpaid invoice from the credit tab, sees the invoice flip to paid and the ledger update — `'agency pays an unpaid invoice from the credit tab'` (invoice issued fresh per run via a direct staff API call, independent of the page's own agency session)
- [x] Agency sends an inbox message, sees it in the thread — `'agency sends an inbox message and sees it in the thread'`
- [x] Role isolation: a staff login never reaches `/agency-portal/*` routes; an agency login never reaches `/panel/*` routes — `'role isolation: a staff login never reaches /agency, an agency login never reaches /panel'`

## Deferred (scoped out with reasons, not silently dropped)

**Corrected below, no longer accurate as of Phase 39** — this list
originally named two items as unbuilt that later phases actually closed
without this file being updated; both corrections were found and fixed
while auditing the third item (document review) below:
- ~~«صندلی‌های تخصیص‌یافته» (allocated seats tab)~~ — built in Phase 13
  Part C (`AgencyAllotment` model, staff-side `POST/GET
  /flights/:instanceId/allotments`) + this track's own
  `GET /agency-portal/allotments` and `AgencySeatsPage.tsx`
  (`/agency/seats`, wired in `App.tsx`).
- ~~«وب‌سرویس» self-service API purchase+approval flow~~ — built in
  Phase 23 (see `docs/API.md`'s Phase 23 section): full request→staff
  decide→real key issuance cycle, `AgencyWebservicePage.tsx`
  (`/agency/webservice`).
- ~~Staff-side `AgencyDocument` review UI~~ — built in Phase 39 (see
  checklist above).

Still genuinely deferred:
- Excel export — mock-only button in the design, not backed by a real export feature anywhere else in the codebase either.
- Public agency self-registration form (the آژانس همکار tab's signup half) — already explicitly deferred in Phase 3's own docs; this phase doesn't touch it either. Login only works for agencies already approved through the existing staff-side membership-request flow.
- Forced password-change enforcement on `mustChangePassword: true` — the flag is set and surfaced (same as Phase 8's employee resets) but no login-time enforcement exists for ANY role yet, staff included; not invented here as a one-off for agencies.
- «فراموشی رمز» (forgot password) self-service flow for the AGENCY role — customers got a real OTP-based flow in Phase 21 and staff's is an intentional "contact IT" non-flow (also Phase 21), but `AgencyLoginPage.tsx` has no recovery link at all and no backend endpoint exists; a locked-out agency currently has no self-service path back into its account.
- Staff-side UI for credit-requests/webservice-requests decisions —
  **done** (see `docs/API.md` Phase 39 follow-up): `AgencyDetailPage.tsx`
  cards for both request types with approve/reject wired to the existing
  staff endpoints.
