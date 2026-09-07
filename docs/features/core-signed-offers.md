# Core signed offers — contract before implementation

Status: **implemented and verified locally; awaiting PR review/merge**

This slice turns the existing read-only Core itinerary quote into an expiring,
seller-bound offer contract. It stays inside the NestJS Core Platform and the
same PostgreSQL transaction boundary. It does not extract Inventory, Order or
Payment, enable the historical shadow PSS writer, or change any public
`/api/v1/**` route.

## Proposed product and security decisions

- An offer is valid for **15 minutes**. The duration is configuration, capped
  between 60 and 900 seconds, and defaults to 900 seconds.
- A `SYSTEM` offer is bound to one authenticated customer UUID; an `AGENCY`
  offer is bound to one authenticated agency UUID. The public compatibility
  facade must derive this identity from the authenticated principal and must
  never accept an arbitrary seller UUID from a browser.
- Offer creation returns one UUID `offerId`, UTC `expiresAt`, the current Core
  quote and an opaque integrity token.
- The token is HMAC-SHA-256 signed with a dedicated secret. Its signed payload
  contains only version, offer ID, seller binding, expiry, request digest and
  quoted total. Traveller birth dates, PII, payment references and inventory
  details are not embedded in the token.
- Repricing requires the same seller, complete quote request and integrity
  token. The server verifies signature, expiry, route ID and request digest,
  then recalculates from authoritative Core data.
- Repricing returns the previous and current exact IRR totals plus
  `priceChanged`. It never silently accepts a changed request.
- Offers are stateless and create no database row. They do not hold inventory,
  authorize a payment or guarantee a seat. The existing Core hold/payment path
  still reprices and locks all affected flight rows transactionally.
- The endpoints are internal-only and retain `X-Internal-Token` service
  authentication. No nginx/gateway public route is added in this slice.

## Acceptance checklist

- [x] `POST /internal/v1/offers/search` returns a 15-minute, seller-bound,
      signed offer calculated by the existing Core quote service —
      `backend/src/modules/pss/core-offer.service.spec.ts` and
      `backend/test/core-itinerary.e2e-spec.ts`.
- [x] `POST /internal/v1/offers/:offerId/reprice` verifies the signature,
      offer ID, seller binding, exact request digest and expiry before reading
      current pricing — the same unit/E2E suites.
- [x] Repricing reports an unchanged quote and a changed price using decimal
      string IRR without JavaScript-number conversion — unit/E2E suites.
- [x] Tampered, expired, wrong-seller, wrong-offer and changed-request tokens
      fail closed with stable error envelopes — unit/E2E suites.
- [x] Missing/weak signing configuration fails closed and never leaks the
      secret or token in errors/logs — env-validation and HTTP tests.
- [x] Auth failure (401), DTO validation (400), non-sellable flight (404) and
      depleted capacity (409) remain covered — E2E suite.
- [x] Offer search and repricing create no order, hold, ledger or outbox row —
      PostgreSQL E2E row-count assertions.
- [x] Existing public search/booking APIs, Core quote/hold/payment tests and
      gateway exposure remain unchanged.

Local evidence: 13 focused unit/configuration tests, 35 real-PostgreSQL Core
itinerary/Offer E2E tests, four edge-routing tests, scoped zero-warning ESLint,
backend typecheck and production build. No schema migration is required.

## Explicitly deferred

- Public-site or partner cutover to this contract.
- NDC 24.1 message mapping and partner conformance.
- PSP verification, Nira/DCS submission, interline and codeshare.
- Persisted offer analytics or a Redis offer store; neither is needed for the
  correctness of this stateless first slice.
