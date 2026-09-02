# Customer profile, checkout, and price-calendar fixes

Acceptance checklist for the customer-facing defects reported on 2026-08-24.

- [x] Account information displays and edits first name and last name in separate fields while preserving the existing `fullName` API contract. — `AccountPage.test.tsx`
- [x] Saved-passenger creation/editing captures native and Latin first/last names separately and persists them in an unambiguous first-name-then-last-name order. — `AccountPage.test.tsx`
- [x] A legacy one-part saved Latin name is placed in the checkout last-name field, never the first-name field. — `checkout-saved-pax.test.ts`
- [x] The permanent seat-selection ancillary recreates its checkout mirror when an older database is missing `SEAT_SELECTION`; the public checkout therefore shows its fee control. — `ancillary-services.service.spec.ts`
- [x] Passenger review renders document number and birth date in separate, non-overlapping cells on desktop and labelled rows on mobile. — `ReviewStep.test.tsx`
- [x] Price-calendar previous/next controls load further six-day windows indefinitely in both directions instead of stopping at the initial seven-day response. — `FlightPriceCalendar.test.tsx`
