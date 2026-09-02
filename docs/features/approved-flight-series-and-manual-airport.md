# Approved flight series and manual airport entry

## Problem

- A recurring route can materialize many dated `FlightInstance` rows under one
  flight number. Operations and CEO review the series as one grouped request,
  but after CEO approval every occurrence is a distinct published flight.
- The commercial active-flight list previously applied an unrelated seven-day
  window. For a three-days-per-week series this made only three of seventeen
  approved occurrences visible as active.
- The flight-city form only accepted entries from a bundled reference catalog;
  city name and IATA code could not be typed manually.

## Acceptance criteria

- Operations and CEO queues may keep one grouped card with occurrence count and
  the full date range.
- CEO approval continues to publish every pending occurrence in the series.
- Every future, sale-window-eligible, published occurrence is returned as a
  separate row in `GET /flights/overview.data.active`, regardless of how far in
  the future it departs. A 17-occurrence approved series therefore yields 17
  active rows (subject only to explicit management filters/pagination in the
  UI, never a seven-day data cutoff).
- KPI active count uses the same complete occurrence set.
- Commercial users can either choose a known airport from the reference list or
  manually enter city name, three-letter IATA code, and optional airport name.
- Manual IATA input is normalized to uppercase, validated as exactly three Latin
  letters, and uniqueness remains enforced by the backend.
- A newly created airport is immediately added to the flight/search selectors.

## Proof

- Backend regression coverage: `commercial-inventory.spec.ts` proves all 17
  far-future occurrences stay active; `flights.airports.spec.ts` proves manual
  IATA normalization and malformed-code rejection (8 focused assertions pass).
- Frontend component coverage: `FlightCitiesTab.test.tsx` proves manual
  city/code submission and catalog selection (4 assertions pass); the focused
  `FlightsPage` + city suites pass 16 assertions.
- Backend and frontend production builds pass. Backend semantic lint has zero
  errors (three pre-existing unsafe-map warnings); frontend lint has zero
  errors (existing repository warnings only).
- A local API smoke against the compiled backend returned 863 distinct active
  occurrence rows. A long-range sample flight number returned 234 individual
  rows from 2026-09-16 through 2026-10-04, proving the removed seven-day cutoff
  is effective at the real `GET /flights/overview` boundary.
