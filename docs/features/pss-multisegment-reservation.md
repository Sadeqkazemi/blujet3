# PSS multi-segment reservation — Slice 1 contract

Status: **Core resolution, quote, hold and accountable payment fulfilment implemented**

## Owner-approved commercial rule — 2026-09-04

The owner approved additive itinerary pricing: sum each segment's price,
taxes and selected extras, with baggage/service terms retained per segment.
There is no implicit through-fare discount, pooled baggage allowance or
promise of through-checked baggage. The target is one order/PNR and an atomic
all-segment hold. Rollout remains staged; a read-only quote is not a hold.

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

`POST /internal/v1/core/itineraries/quote` and
`POST /internal/v1/core/itineraries/hold` accept an ordered `segments[]` array.
Each segment carries the flight-instance reference, cabin, fare-class selection
and its own extras. The server owns route and schedule snapshots; clients
cannot override them.

The internal DTO and pure resolved-segment validator exist under
`pss-service/src/itinerary/`. The first HTTP integration is the authenticated,
read-only Core endpoint `POST /internal/v1/core/itineraries/resolve`; no public
endpoint or writer is changed here.

## Explicitly pending product/vendor decisions

- Airport-pair/terminal-specific MCT overrides remain pending product input.
  Airport-level MCT already exists in `inventory.airports.minConnectMin` and
  is enforced by the Core resolver without inventing a universal fallback.
- Through-fare discounts, pooled baggage and through-check operations are not
  part of the approved additive/per-segment rule.
- PSP callback/signature verification remains pending the selected provider's
  documentation. The internal payment-confirmation contract only accepts a
  reference already verified by a trusted caller; it does not emulate a bank.
- Post-ticket servicing (void/refund/exchange), EMD issuance and Nira/DCS
  submission remain later slices.
- PSS writer cutover flag and rollback observation window.

## Acceptance evidence for the implementation slice

- [x] Validation tests for one segment, multiple segments, duplicate/
  discontinuous routes, cancelled/unpublished instances and invalid chronology
  (`itinerary.contract.spec.ts`).
- [x] Resolve flight instances, route/time continuity, sale gates and current
  cabin/fare-class availability from Core-owned data behind an authenticated
  read-only endpoint (`core-itinerary.service.spec.ts`,
  `core-itinerary.e2e-spec.ts`).
- [x] Expose additive quote and atomic hold/order DTOs inside Core under the
  owner-approved pricing and per-segment baggage/service rules.
- [x] Core connection-time follow-up: persisted airport MCT, exact boundary,
  short/missing/invalid rules, both transfers of a three-segment itinerary,
  valid direct itineraries and invalid segment duration. Local verification:
  25 PSS unit tests, 8 resolver HTTP E2E tests, typecheck, scoped lint and build.
- [x] Concurrency E2E proves deterministic lock order, exactly one winner for
  the last seat on every leg and no partial inventory mutation. A separate
  failure case proves that an unavailable second leg creates no order/segment.
- [x] Existing single-segment PSS client compatibility tests remain green
  (`http-pss.client.spec.ts`).
- [x] Additive migration creates Core order/segment/traveller snapshots under
  the existing `orders` schema; the real PostgreSQL migration run, TypeORM
  metadata typecheck and production build pass.

No external vendor integration, server migration/deployment or public writer
cutover is authorized by this implementation.

## Additive quote implementation checklist

- [x] Inspect existing resolver, fare rules, passenger pricing, charge rules
  and ancillary catalog; reuse existing Core calculation conventions.
- [x] Document API/DB scope before implementation. Touch only PSS quote DTO,
  controller/service/module, group-size resolver support, focused tests/docs.
- [x] Authenticated read-only quote for 1–3 segments and 1–9 travellers.
- [x] Sum exact IRR fare/tax/extras; retain nullable baggage and services by leg.
- [x] Validate passenger age on every departure and enough seats in one fare
  bucket for the entire party; never split the party across fare classes.
- [x] Reuse per-passenger discounts, flight charges and ancillary overlays;
  duplicate/inactive extras fail closed. No price locks/promos/seat selection
  are claimed in the initial quote endpoint.
- [x] Unit/HTTP tests: arithmetic beyond JS safe integers, channel price,
  passenger mix, baggage differences, extras, auth, invalid input, capacity,
  changed price and no database writes. Local verification: 33 PSS unit tests,
  13 quote/resolver HTTP E2E tests, scoped zero-warning lint, typecheck and
  production build.
- [x] Persist one multi-segment order/PNR with common 15-minute expiry,
  deterministic flight-lock ordering, replay binding and all-or-nothing hold.
- [x] Store encrypted/hash-searchable traveller PII, per-leg fare/tax/baggage/
  extras snapshots, and make Core availability count both legacy bookings and
  active itinerary holds without a second inventory writer.
- [x] HTTP tests cover one PNR, child/adult prices, encrypted PII, replay,
  changed-payload rejection, unavailable-second-leg rollback and last-seat
  concurrency. Combined resolver/quote/hold HTTP evidence: 20 tests.
- [x] Reuse the restart-safe booking expiry cadence for itinerary holds; lock
  due rows with `SKIP LOCKED`, transition once and persist one lifecycle event.
  HTTP proof confirms expired inventory returns on every leg.
- [x] Cancel an active order under its owner scope, release every leg in one
  commit and make replay return the same cancellation without another event.
- [x] Persist trusted payment confirmation evidence before fulfilment, bind
  retries to owner/order/amount/reference, and retain failures for manual
  reconciliation instead of losing an externally captured payment.
- [x] Reprice the held itinerary without counting its own seats, lock every
  flight in stable order, and atomically transition `HELD -> PAID -> TICKETED`
  with one SALE ledger row.
- [x] Allocate one accountable e-ticket document per traveller from the shared
  stock and one ordered OPEN flight coupon per traveller/segment; no partial
  issue and no duplicate allocation on replay or concurrency.
- [x] Prove auth, validation, ownership, not-found, expiry/price/stock failure,
  exact IRR, idempotency, multi-coupon issue, rollback and concurrency. Local
  evidence: migration apply/revert/re-apply, 37 focused unit tests, 26 real
  PostgreSQL HTTP E2E tests, changed-file zero-warning lint, typecheck and
  production build.
