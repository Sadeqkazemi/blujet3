# Core Offer to Order/Hold binding — contract before implementation

Status: **proposed; awaiting owner approval before implementation**

This slice makes a signed Core Offer the input to a new atomic hold command.
It remains inside the NestJS Core Platform, the authoritative PostgreSQL
primary and the existing Order/Inventory transaction. It does not extract a
new service, expose an internal route publicly, enable the historical PSS
writer or call a PSP.

## Proposed contract and safety decisions

- Add `POST /internal/v1/offers/:offerId/hold`, protected by
  `X-Internal-Token` and a required `Idempotency-Key`.
- The body contains the existing Core hold request plus `integrityToken`.
  Seller identity is not accepted separately: Core derives it as `USER` or
  `AGENCY` from the validated `channel` and `ownerId`, then verifies the signed
  Offer binding.
- Core verifies signature, offer ID, seller, exact itinerary/passenger quote
  projection and expiry. Plaintext traveller identity fields are excluded from
  the Offer digest and remain protected by the existing encrypted Order write.
- After locking every affected `FlightInstance` row in stable order, Core
  reprices from authoritative inventory. The hold is created only when the
  locked current total exactly equals the signed Offer total. A changed price
  returns `409 OFFER_PRICE_CHANGED` and writes no Order, traveller or hold row;
  the caller obtains a new Offer before retrying.
- Persist nullable `CoreItineraryOrder.sourceOfferId` with a unique index.
  Existing orders remain valid with `NULL`; a signed Offer can create at most
  one Order even when different idempotency keys race.
- An identical replay with the original `Idempotency-Key` returns the original
  Order even after the Offer expires. Reuse of that key with another Offer or
  request returns `409 IDEMPOTENCY_PAYLOAD_MISMATCH`.
- Reusing an already-consumed Offer with another idempotency key returns
  `409 OFFER_ALREADY_USED`; it never creates or returns a second Order.
- The existing `/internal/v1/core/itineraries/hold` route remains unchanged for
  compatibility. Public `/api/v1/**` cutover is a separate, feature-flagged
  phase after this internal contract is proven.

## Acceptance checklist

- [ ] Valid, unexpired, seller-bound Offer creates one 15-minute multi-segment
      hold and stores its `sourceOfferId` — PostgreSQL E2E.
- [ ] Missing internal auth returns 401; missing/invalid idempotency key or DTO
      returns 400; missing/non-sellable inventory returns 404 — E2E.
- [ ] Tampered, expired, wrong-route, wrong-owner and changed-request Offer
      inputs fail closed without Order/Inventory side effects — unit/E2E.
- [ ] A price change under locked inventory returns
      `409 OFFER_PRICE_CHANGED`, creates no Order, and exposes no token/PII —
      unit/E2E.
- [ ] Identical idempotent replay returns the original Order after Offer
      expiry; changed replay returns `IDEMPOTENCY_PAYLOAD_MISMATCH` — E2E.
- [ ] The same Offer with two different keys has exactly one winner and one
      persisted Order; the loser receives `OFFER_ALREADY_USED` — concurrency
      E2E.
- [ ] Existing unsigned internal hold behavior and its last-seat concurrency
      guarantees remain green — existing Core itinerary E2E.
- [ ] Migration is expand-only (`sourceOfferId` nullable + unique), passes
      production-schema compatibility, backup/PITR and full CI.
- [ ] Internal routes stay outside gateway/public exposure and no deployment
      flag changes.

## Explicitly deferred

- Public website or partner API cutover and rollback flag.
- Persisting the stateless Offer itself or storing its integrity token.
- PSP verification, Nira/DCS integration, NDC mapping and payment capture.
- Removing the compatibility hold endpoint.
