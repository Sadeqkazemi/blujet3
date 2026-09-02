# Customer account refunds (استرداد بلیط) — acceptance checklist

Design: `design-reference-v2/پنل کاربر.dc.html` → primary account tab
`refund` / current route tab key `refunds`.

This phase completes the account tab. Existing anonymous
`/manage-booking/refund`, ticket-page submission, SITE_ADMIN referral and
finance payout remain compatible and use the same penalty engine.

## Database and concurrency

- [x] Migration adds non-null unique `RefundRequest.trackingCode`
      (`RF-XXXXXXXX`) and backfills existing rows without exposing UUIDs.
- [x] Migration adds unique `RefundRequest.bookingId`; two concurrent
      submissions for one booking yield exactly one request and one stable
      409 response.
- [x] Seed creates realistic requests in multiple lifecycle states with
      history and tracking codes; existing refund/payment tests remain green.

## Customer API

- [x] `GET /my/refunds/eligible-bookings` is USER-only and owner-scoped;
      returns only `TICKETED|PAID`, no-prior-request bookings with current
      server-computed penalty/refundable amounts; excludes <3h/100% cases.
- [x] `GET /my/refunds/rules` returns the authoritative four brackets in
      descending threshold order; no customer write surface exists.
- [x] `POST /my/refunds/preview` validates ownership and eligibility and
      recomputes the current rule; unknown/not-owned is 404, ineligible is
      409, malformed body is 400.
- [x] `POST /my/refunds` recomputes rather than trusting preview values,
      validates/encrypts IBAN, creates tracking/history, and returns the
      enriched customer row.
- [x] `GET /my/refunds` and `GET /my/refunds/:id` return route, PNR,
      flight/departure, tracking code, amount snapshot and history; never
      return IBAN or passenger PII; detail is owner-only.
- [x] Staff/agency roles receive 403 on every `/my/refunds/*` customer
      endpoint; auth failure is 401.
- [x] Existing anonymous manage-booking and ticket-page submissions receive
      tracking codes and preserve their response compatibility.
- [x] SITE_ADMIN referral fixes the existing unreachable payout path:
      `SUBMITTED|REVIEW → FINANCE` with admin-review + finance-referral
      history; FINANCE reassignment stays FINANCE; only FINANCE_MANAGER can
      still execute the step-up-protected payout.

Proof target: `backend/test/customer-account-refunds.e2e-spec.ts` (happy
paths, 400/401/403/404/409, ownership, PII absence, concurrency) plus
existing `refund-submission.e2e-spec.ts`, `refunds.e2e-spec.ts`, and
`manage-booking.e2e-spec.ts`.

## Frontend

- [x] `AccountRefundsTab` renders the navy intro/KPIs and correct
      loading/error/empty states.
- [x] Eligible-flight cards show route, PNR/flight, Jalali local departure,
      time left, penalty and refundable toman using shared formatters.
- [x] Four rule cards render from API data (not hardcoded percentages) with
      the process note from the design.
- [x] «درخواست استرداد» opens a modal, refreshes the server preview, offers
      saved bank accounts plus validated manual IBAN fallback, and shows
      paid/penalty/refundable breakdown before confirmation.
- [x] Successful submission closes the modal, removes the booking from
      eligible cards, and adds its tracking card without a page reload;
      API errors remain visible and do not duplicate requests.
- [x] Tracking cards show route, PNR, short tracking code, status, amount and
      four-stage timeline; only actual history entries are marked complete.
- [x] fa is RTL/Jalali/Persian digits, en is LTR with design English copy,
      ar is RTL with Arabic copy/shared fallback; isolated codes remain LTR.
- [x] Responsive layout preserves the design structure on mobile.

Proof target:
`frontend/src/features/public-site/AccountRefundsTab.test.tsx` and an
account-page integration test in `AccountPage.test.tsx`; Playwright journey
`frontend/e2e/customer-account-refund.spec.ts`.

## Completion gate

- [x] Prisma generate/migrate/seed all succeed.
- [x] Backend unit + E2E, frontend Vitest, Playwright journey, lint and
      typecheck all pass.
- [x] `docs/openapi.json`, `docs/API.md`, `docs/DB_SCHEMA.md`, generated
      frontend types and `PLAN.md` are synchronized after implementation.
