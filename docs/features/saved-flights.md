# Saved flights (نشان‌شده‌ها) — acceptance checklist

Design: `design-reference-v2/پنل کاربر.dc.html` → tab `saved`.

## Backend
- [x] `GET /my/saved-flights` — USER only; returns flight detail + live `priceIrr` + `bookable` — `saved-flights.e2e-spec.ts`
- [x] `POST /my/saved-flights` — creates bookmark; 409 duplicate; max 20 — `saved-flights.e2e-spec.ts`
- [x] `DELETE /my/saved-flights/:id` — owner only; 404 for others — `saved-flights.e2e-spec.ts`
- [x] Staff roles get 403 on all `/my/saved-flights` endpoints — `saved-flights.e2e-spec.ts`

## Frontend
- [x] `AccountPage` `saved` tab lists cards with route, date/time, price, book + remove — `AccountPage.test.tsx`
- [x] Empty state «هنوز پروازی ذخیره نکرده‌اید» — covered by `AccountSavedFlightsTab` (empty array in other tests)
- [x] `ResultsPage` bookmark button saves flight (authenticated) — `ResultsPage.test.tsx`
- [x] Unauthenticated bookmark redirects to sign-in — `ResultsPage.test.tsx`

## Explicitly deferred
- Save from mock/demo result cards (no real `flightInstanceId`).
- Cross-device sync beyond normal authenticated API (no offline/localStorage mirror).
