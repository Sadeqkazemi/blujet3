# Direct agency booking API

## Decision

blujet is the flight supplier. The agency API sells only blujet's internally
published inventory and agency allotments. This feature does not call a GDS,
NIRA, or a payment provider.

## Acceptance checklist

- [x] An active, non-expired agency API key authenticates with `X-API-Key`.
- [x] Suspended keys, suspended agencies, and disabled agency users fail closed.
- [x] API scopes are enforced: all scopes can search; only `SEARCH_BOOK` and
      `FULL` can book, retrieve bookings, and read credit.
- [x] Search returns only the existing published/sellable internal inventory.
- [x] Seat maps are read from the existing reservation engine.
- [x] Agency booking requires an owned allotment and an `Idempotency-Key`.
- [x] Booking reuses the transactional reservation service, including capacity,
      seat collision, agency credit, ledger, and passenger-age validation.
- [x] Booking/ticket retrieval is restricted to the authenticated agency.
- [x] Every endpoint is throttled and represented in Swagger.
- [x] Frontend API documentation describes the real API-key contract.
- [x] Focused unit tests and the backend build pass.

## Explicit exclusions

- GDS integration
- NIRA integration
- Bank/payment-gateway integration
- Selling inventory not owned or allocated by blujet
