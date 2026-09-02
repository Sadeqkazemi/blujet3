# Feature: پرواز (flightops) — sale auto-close + نیرا manifest submission

Covers `docs/API.md` → "Phase 24" and `docs/DB_SCHEMA.md` → "Phase 24".
Closes the `flightops` gap flagged deferred since Phase 18 (`PANEL_NAV`)
and Phase 22 (وضعیت پرواز's dropped operational stat boxes — those stay
dropped; this is a distinct capability, see docs/API.md's Phase 24 note).

Scope, read verbatim from `پنل ادمین سایت.dc.html`'s flightops list/detail
sc-if blocks and its `roleDefs` (only `super`/`siteAdmin`/`finance`/
`commercial` include `flightops` — CEO, SITE_ADMIN, FINANCE_MANAGER,
COMMERCIAL_MANAGER): sale on each flight auto-closes 4 hours before
departure, and the full passenger manifest auto-uploads to سامانه نیرا
(Iran's civil aviation manifest system) at that same moment. Clicking a
flight shows its passenger list and when it was submitted.

Out of scope for this phase (documented, not an oversight): enforcing the
4-hour close as a booking-creation restriction (the design has no manual
"close" action either — this is a reporting/manifest-submission surface,
not a new booking rule); a real نیرا HTTP integration (behind a mock
provider, same as every other external system in this codebase); CSV/
Excel manifest export (`exportPax` in the mock has no real file format
specified in the design).

## Acceptance checklist

### Backend — sale-close derivation + نیرا submission
- [x] `isSaleAutoClosed(departureAt)` pure helper: true iff `departureAt − now ≤ 4h`, false otherwise, boundary-exact at exactly 4h
      — `backend/src/modules/flightops/sale-close.util.spec.ts`
- [x] Lazy materialization: reading the list or a detail for a `SCHEDULED` instance past its 4h threshold with `niraSubmittedAt` still null calls `NiraProvider.submit(...)` with the real passenger manifest and persists `niraSubmittedAt`; instances not yet past the threshold are left untouched
      — `backend/test/flightops.e2e-spec.ts` › "closes and submits to نیرا automatically once within 4h of departure"
- [x] Idempotent: reading the same instance twice after closure does not call the provider a second time or move `niraSubmittedAt`
      — `backend/test/flightops.e2e-spec.ts` › "submitting twice is a no-op — provider called once, timestamp unchanged"
- [x] `NiraProvider` is a swappable interface (`MockNiraProvider` in dev/test, matching the `SmsProvider`/`PaymentGateway` pattern) — never called directly outside `NiraService`
      — `backend/src/modules/flightops/nira.service.spec.ts`

### Backend — list & detail
- [x] `GET /flightops` returns real KPIs (کل پروازها / باز / بسته‌شده-در نیرا / مجموع مسافران) that reconcile with the row data, scoped to `SCHEDULED` instances only, ordered by soonest departure
      — `backend/test/flightops.e2e-spec.ts` › "GET /flightops: real KPIs reconciling with rows, SCHEDULED-only, soonest-first"
- [x] `GET /flightops/:id` returns sold/free/capacity/occupancy, نیرا submission status + timestamp (or "pending"), and the real passenger manifest (name, decrypted national ID, seat, PNR) for `SOLD_STATUSES` passengers only
      — `backend/test/flightops.e2e-spec.ts` › "GET /flightops/:id: real manifest with decrypted national IDs, only sold passengers"
- [x] 404 for a non-existent or CANCELLED instance id (cancelled flights are excluded — no real manifest to submit)
      — `backend/test/flightops.e2e-spec.ts` › "404 for a missing or CANCELLED instance"
- [x] Every endpoint 403s for a role outside CEO/SITE_ADMIN/FINANCE_MANAGER/COMMERCIAL_MANAGER (e.g. SENIOR_MANAGER, EMPLOYEE)
      — `backend/test/flightops.e2e-spec.ts` › "403s for a role outside the flightops set"

### Frontend
- [x] List: 4 KPI cards, table (مسیر / شماره پرواز / تاریخ و ساعت / فروش‌ظرفیت / وضعیت فروش / سامانه نیرا) with real Jalali dates + Persian digits, status pills (باز/بسته‌شده) and نیرا pills (بارگذاری در نیرا ✓ / در انتظار بسته‌شدن)
      — `frontend/src/features/flightops/FlightOpsPage.test.tsx` › "renders KPI cards and the flight list with real status/نیرا pills"
- [x] Clicking a row opens the detail view: 4 stat boxes (فروخته‌شده/خالی/ظرفیت/ضریب اشغال), نیرا card (done banner with submission time, or pending banner), passenger table
      — `FlightOpsPage.test.tsx` › "opens a flight's detail view with stat boxes, نیرا status, and the passenger manifest"
- [x] Back button returns to the list
      — `FlightOpsPage.test.tsx` › "opens a flight's detail view…" (asserts the back link)
- [x] `flightops` nav entry appears for CEO/SITE_ADMIN/FINANCE_MANAGER/COMMERCIAL_MANAGER and not for other roles
      — `backend/test/flightops.e2e-spec.ts` › "PANEL_NAV includes flightops for exactly the 4 design-confirmed roles" (server-computed nav, no separate frontend nav test needed — matches existing `PANEL_NAV` test convention)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
