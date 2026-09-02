# Aircraft cabin capacity and per-route activation — acceptance checklist

This phase implements the commercial-manager cabin requirements confirmed on
2026-08-24. Aircraft cabin capacities are explicit business data; the seat-map
editor remains the physical source used to verify their upper bounds.

- [x] The aircraft create/edit form shows FIRST, BUSINESS, COMFORT and ECONOMY
  as four explicit cabin-capacity rows.
- [x] Positive configured capacities are unique, sum to `totalCapacity`, and do
  not exceed the matching physical seat-map bands.
- [x] Existing aircraft edit loads the stored `AircraftCabin` capacities.
- [x] Selecting an aircraft in route creation shows exactly its positive cabin
  capacities as the available cabin list.
- [x] Every available cabin has an active checkbox for the route. An inactive
  cabin is excluded from the route and generated flight snapshot.
- [x] An active route/flight cabin quantity may be reduced, but cannot exceed
  the aircraft definition's capacity for that cabin.
- [x] At least one cabin must remain active with a positive quantity.
- [x] Add Flight loads the resolved route cabin snapshot and applies the same
  authoritative per-aircraft bounds to manually edited capacities.
- [x] Frontend tests cover aircraft capacity persistence and per-route cabin
  activation/deactivation.
- [x] Backend tests cover explicit cabin totals and reject capacities above the
  physical aircraft layout.
