# Agency search identity, dynamic cabins, and customer seat policy

## Acceptance checklist

- [x] An authenticated agency that opens public flight results keeps an agency
      identity control in the shared header and can return to the agency portal;
      customer sign-in/join controls are not shown for that session.
- [x] Homepage and agency flight searches load their cabin choices from cabins
      that exist on currently sellable flight inventory, including COMFORT and
      FIRST when Commercial has activated them; query values remain canonical
      `CabinClass` values.
- [x] The seat-map caption, legend, instructions, permitted-seat count, and map
      render only after preselection access is enabled. Disabling the paid option
      closes the map and clears its selected seats.
- [x] A checkout can preselect at most one physical seat per seat-bearing ticket
      (adult or child; lap infants do not consume a seat). The UI shows the
      maximum and remaining count, blocks an extra click, and the booking API
      independently rejects an over-limit request.
- [x] Manual preselection is preserved. Any remaining passengers are assigned
      atomically from authoritative free inventory by the server.
- [x] Automatic assignment keeps passengers from one order together where the
      layout permits, keeps children next to an adult in that order, prefers a
      solo passenger beside the same gender, and otherwise prefers a three-seat
      block's aisle seat then its window seat.
- [x] A row-side block carries at most one lap infant and exit-row seats are only
      assigned to adults without a lap infant. These rules are checked again
      under the flight row lock, so concurrent bookings cannot bypass them.
- [x] Persian and Arabic seat maps localize all visible aircraft labels for their
      locale while the amenity word `GALLEY` remains English in every locale.
- [x] Focused backend/frontend regression tests, production builds, semantic
      lint, and a local browser journey pass before hand-off.

## API surface

- `GET /search/cabins` returns the ordered distinct cabin classes exposed by
  currently sellable public flight instances. It is public and cached briefly.
- `POST /bookings` accepts an omitted `seatCode` for a seat-bearing passenger;
  the server then assigns one by policy. A supplied seat remains a manual choice.
- `GET /search/flights/:id/seatmap` includes data-driven `exitRows` from the
  aircraft seat-map definition.

## Inventory and concurrency

Seat-policy decisions are made inside the existing pessimistic flight-instance
transaction after current bookings/holds/locks are read. Passenger seat rows are
written in the same transaction. Search caches remain hints and never decide a
seat allocation.
