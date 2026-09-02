# Agency, loyalty, reservation and cartable UI fixes

Approved by the product owner on 2026-08-25 from the supplied screenshots.

## Acceptance checklist

- [x] An authenticated agency keeps a complete agency identity/profile menu on
  every public page, including flight results. The menu exposes the agency
  portal, purchased flights, webservice, profile/documents and sign-out.
  Proof: `PublicHeader.test.tsx` — agency identity/profile-menu regression.
- [x] The customer profile badge does not display the word «نقره‌ای» for the
  default SILVER tier; GOLD and PLATINUM labels remain explicit. Proof:
  `AccountSidebar.test.tsx` — base membership label regression.
- [x] The customer club tab includes the real bank-loan entry point and clearly
  routes bank customers/non-customers to the existing loan workflow without
  fabricated connection or loan data. Proof: `AccountClubTab.test.tsx` — real
  loan/support route assertions.
- [x] Seat selection is a collapsed, locked section until the seat-selection
  service fee is accepted (or real loyalty access is available). The seat map
  and detailed aircraft/cabin copy are not rendered while locked. Proof:
  `ExtrasStep.test.tsx` — locked collapsed seat section regression.
- [x] The agency ticket-search layout keeps the origin/destination swap control
  between the two airport fields at desktop and mobile widths; it must never
  overlap either date field. Proof: `AgencyTicketPage.test.tsx` — route-field
  container excludes the date picker.
- [x] The BOARD_CHAIR reservation dashboard does not render the system-service
  status panel. Other authorized reservation views keep their existing data.
  Proof: `ReservationPage.test.tsx` — BOARD_CHAIR dashboard regression.
- [x] In a sandbox/UAT environment, the staff directory may return active UAT
  manager accounts so CEO/BOARD_CHAIR transfer pickers are usable. Production
  continues to hide temporary UAT accounts. Proof:
  `staff-directory.module.spec.ts` — sandbox/production filtering pair.
- [x] Approving or rejecting a cartable request closes its review modal and
  requires no transfer target. Transfer remains an independent optional action.
  Proof: `CartablePage.test.tsx` — approve-without-transfer modal close.
- [x] Fare-cabin choices are derived from the selected aircraft definition and
  stay synchronized when the aircraft changes. Proof: `AddFlightPage.test.tsx`
  — resolved schedule/aircraft-definition cabin intersection.

## API contract touched

- `GET /staff-directory` — unchanged response envelope and row shape. In an
  auth-sandbox environment only, active temporary UAT staff accounts are valid
  directory recipients. Outside sandbox mode they remain excluded.
- Existing customer APIs remain authoritative: `GET /me/club`,
  `POST/GET /me/loan-applications`, agency portal profile/credit endpoints and
  aircraft-definition/flight-definition endpoints. No display rows are mocked.

## Regression proof

All checklist items are covered by the focused tests above. No database
migration is required.
