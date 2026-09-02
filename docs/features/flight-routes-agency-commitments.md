# Flight routes and agency commitments

## Acceptance checklist

- [ ] `مسیرهای پروازی` is an independent commercial-manager sidebar route and is not rendered inside `مدیریت پروازها`.
- [ ] A route row exposes its aircraft-derived total seat capacity.
- [ ] Entering a known flight number in the add-flight form resolves the active route template and fills route, departure date/time, duration, aircraft and cabin capacity while keeping those fields editable.
- [ ] Aircraft selection initializes cabin capacities from the aircraft catalog; the manager may edit the per-flight snapshot without changing the aircraft catalog or the MD-80 seat map.
- [ ] Agency commitments in add-flight are read-only and come from active reservation allotments; no manager-entered duplicate commitment is created.
- [ ] The agency summary lists each agency, allocated seats and contracted revenue and shows total agency seats and free online seats.
- [ ] Commercial pricing receives the same server-calculated agency/free-seat/revenue summary.
- [ ] Capacity and revenue aggregates are calculated server-side and contain no mock fallback.
- [ ] Backend and frontend contract tests cover route navigation, route resolution and allotment summaries.

## Capacity rules

`freeSeats = max(0, totalCapacity - charterSeats - activeAgencyAllotments - directReservedSeats)`.

An active agency allotment is `HARD`, or `SOFT` whose `releaseAt` has not passed. Agency bookings consume the allotment and therefore are not subtracted a second time. `agencyRevenueIrr` is the sum of `seatsAllocated * contractPriceIrr` for active allotments with a contracted per-seat rate.

## Safety

This feature reads aircraft cabin capacities but never mutates the aircraft definition or MD-80 seat layout. Route fields copied into a flight definition are editable snapshots.
