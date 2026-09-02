# Responsive search and agency operations QA

## Acceptance checklist

- [x] The results-page edit-search dialog is a mobile bottom sheet with a sticky header, stacked origin/destination controls, a centered swap action, and no clipped date/passenger/cabin fields.
- [x] The mobile edit-search action remains reachable above the safe-area inset and preserves one-way/round-trip, route, date, passenger, and cabin behavior.
- [x] The expanded flight-detail metadata cards sit lower than the journey timeline while labels remain aligned to the reading edge and values remain centered.
- [x] Agency sales details load the authenticated agency profile from `GET /agency-portal/profile` and display the registration name, manager, license, phone, email, city, address, and joined date as read-only values.
- [x] Agency sales and export queries remain server-scoped to the authenticated `agency_id`; no agency identifier is accepted from the browser.
- [x] Agency notices/amendments come only from site-admin bulletin dispatches (`AGENCY_BULLETIN`), not from the public-site announcement CMS or automatically from flight availability.
- [x] Creating or publishing a flight does not create a customer/agency bell item; `FlightInstance` workflow notifications stay management-only.
- [x] Notification rows are recipient-scoped and limited to entity types relevant to the authenticated agency; management-only notifications are excluded server-side.
- [x] The agency notices list displays at most 10 records per page and keeps filtering/page navigation functional in fa/en/ar.
- [x] Site admin can target one, multiple, or all active agencies and dispatch history retains exact recipient/read counts.
- [x] Finance-manager, commercial-manager, site-admin, and agency portal regression suites pass for their real API/UI flows and role boundaries.
- [x] Responsive browser QA covers edit search and expanded flight details; authenticated browser/API QA covers agency sales/notices and the relevant management panels when local credentials are available.

## Test evidence

- Frontend full regression: `npm test` → 179 files / 947 tests passed.
- Frontend production build: `npm run build` passed; `npm run lint` passed with pre-existing warnings only.
- Focused agency/search/admin UI regression: 6 files / 67 tests passed before the full run.
- Backend service regression: agency bulletins, audience filtering, agency portal and finance reports → 3 suites / 13 tests passed.
- Backend real-database role/flow regression: agency portal, finance reports, commercial overhaul, notifications and panels → 5 suites / 74 tests passed.
- Notification delivery regression after the flight-noise rule: `notifications.e2e-spec.ts` → 5 tests passed, including rejection of `FlightInstance` from the agency bell.
- Browser QA at 490×800 verified the mobile bottom sheet, unclipped controls, route direction and lowered metadata layout. Authenticated agency browser QA verified all eight immutable registration fields (`0` inputs), the notices-only tabs, the fixed `/notifications` development proxy, and a bell containing only the agency's own booking notification.
