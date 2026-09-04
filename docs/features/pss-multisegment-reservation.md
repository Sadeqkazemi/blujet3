# PSS multi-segment reservation — Slice 1 contract

Status: **Core read-only resolution implemented — hold/order slice pending**

This slice introduces an internal, ordered itinerary contract while preserving
the existing public single-flight booking APIs. Inventory, orders and payment
remain in the Core Platform transaction boundary; no independent PSS writer or
dual-write is enabled by this document.

## Invariants

- An itinerary contains one or more ordered segments.
- Each segment references a published, non-cancelled `FlightInstance`.
- Segment order is explicit and contiguous (`sequence = 1..n`).
- A segment cannot be repeated in the same itinerary.
- The destination of segment `n` must equal the origin of segment `n+1`.
- Every next departure must be strictly after the previous arrival.
- Every segment must arrive strictly after its own departure.
- Core resolution enforces the transfer airport's persisted `minConnectMin`;
  a gap exactly equal to the minimum is valid. Missing airport/MCT or invalid
  MCT (not a non-negative integer) fails closed with `VALIDATION_FAILED`.
- One order/PNR owns all segments; it is never split by passenger or leg.
- Existing single-segment `/bookings`, `/reservation` and agency routes remain
  compatibility facades until a separately approved cutover.

## Contract shape (internal only)

`POST /internal/v1/offers/search` and `POST /internal/v1/orders` accept an
ordered `segments[]` array. Each segment carries the flight-instance reference,
origin/destination snapshot, cabin and fare-class selection. The server owns
route and schedule snapshots; clients cannot override them.

The internal DTO and pure resolved-segment validator exist under
`pss-service/src/itinerary/`. The first HTTP integration is the authenticated,
read-only Core endpoint `POST /internal/v1/core/itineraries/resolve`; no public
endpoint or writer is changed here.

## Explicitly pending product/vendor decisions

- Airport-pair/terminal-specific MCT overrides remain pending product input.
  Airport-level MCT already exists in `inventory.airports.minConnectMin` and
  is enforced by the Core resolver without inventing a universal fallback.
- Multi-segment pricing, baggage and ancillary allocation rules.
- Multi-segment hold locking and persisted order/segment mapping. Read-only
  cabin/fare-class availability is resolved from current Core tables in this
  slice.
- PSS writer cutover flag and rollback observation window.

## Acceptance evidence for the implementation slice

- [x] Validation tests for one segment, multiple segments, duplicate/
  discontinuous routes, cancelled/unpublished instances and invalid chronology
  (`itinerary.contract.spec.ts`).
- [x] Resolve flight instances, route/time continuity, sale gates and current
  cabin/fare-class availability from Core-owned data behind an authenticated
  read-only endpoint (`core-itinerary.service.spec.ts`,
  `core-itinerary.e2e-spec.ts`).
- [ ] Expose priced offer and atomic hold/order DTOs inside Core after the
  pending pricing and locking rules are approved.
- [x] Core connection-time follow-up: persisted airport MCT, exact boundary,
  short/missing/invalid rules, both transfers of a three-segment itinerary,
  valid direct itineraries and invalid segment duration. Local verification:
  25 PSS unit tests, 8 resolver HTTP E2E tests, typecheck, scoped lint and build.
- A concurrency E2E proving deterministic lock order and all-or-nothing hold
  across every segment, with no partial inventory mutation.
- [x] Existing single-segment PSS client compatibility tests remain green
  (`http-pss.client.spec.ts`).
- [x] No migration was required; TypeORM metadata typecheck, scoped lint and
  production build pass.

No migration, external vendor integration, server deployment or writer cutover
is authorized by this draft.
