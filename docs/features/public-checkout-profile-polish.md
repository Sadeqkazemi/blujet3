# Public checkout and account polish — acceptance checklist

Date: 2026-08-21

## Scope

- Checkout ancillary rules for seat selection and pet travel.
- Customer account information, wallet top-up, and bank-account form.
- Public home-search date-picker placement and agency-header services menu.

## API and database contract

- `GET /public/travel-costs` always exposes the fixed `SEAT_SELECTION` and
  `PET` services when checkout is available; these built-ins cannot be
  disabled or deleted from the commercial ancillary catalog.
- `GET /my/profile` returns `birthDate` and the decrypted customer `address`.
- `PATCH /my/profile` accepts an ISO `birthDate` and a trimmed `address`.
- The address is stored encrypted in `users.addressEnc`; it is never logged or
  exposed through staff lists.

## Acceptance checklist

- [x] The checkout seat map starts collapsed.
- [x] A customer below the loyalty threshold cannot open the seat map until
  the `SEAT_SELECTION` fee is accepted.
- [x] Accepting the seat-selection fee opens the map and includes the fee in
  the booking extras.
- [x] A customer with at least 15,000 club points may open the collapsed map
  without accepting the fee.
- [x] Pet travel and seat selection remain fixed built-in services.
- [x] Account information displays and edits birth date and address.
- [x] Persian wallet input renders Persian digits with stable grouping while
  the submitted API amount remains an integer IRR value.
- [x] The add-card/IBAN form is responsive, labelled, normalized, and visually
  matches the account cards.
- [x] On desktop the date picker opens below its field without locking the
  page; on responsive layouts it opens as a compact bottom sheet with the same
  close/overlay pattern as the airport picker.
- [x] Calendar arrows keep their physical direction in both layouts: previous
  on the left and next on the right.
- [x] The agency header exposes the same five public service links and icons as
  the public header, as a desktop dropdown and collapsed mobile accordion.

## Regression tests

- Frontend: 78 assertions across the checkout, account, calendar, public
  header, home search, and agency-shell suites.
- Backend: 7 focused unit assertions plus 4 profile E2E assertions.
