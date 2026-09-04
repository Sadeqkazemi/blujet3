# Core order retrieval — B3.3b

This read-only servicing boundary resolves a Core order by UUID or PNR. It is
owner-scoped and exposes only persisted operational data needed by servicing,
agency and finance callers; encrypted national IDs, password material and PSP
secrets never cross the response boundary.

## Acceptance checklist

- [x] Internal-token authentication and owner scoping return `401`/`404` with
      no resource disclosure (`backend/test/core-itinerary.e2e-spec.ts`).
- [x] UUID and PNR references resolve the same order, with deterministic
      traveller, segment, document and coupon ordering (`backend/test/core-itinerary.e2e-spec.ts`).
- [x] Effective lifecycle uses `servicingStatus ?? status`, and refund plus
      coupon servicing history is returned without a write (`backend/test/core-itinerary.e2e-spec.ts`).
- [x] Scoped lint, typecheck, production build and existing schema parity pass;
      no migration or public route was added.

Void, partial refund, exchange, EMD and Nira/DCS writes remain input-gated
servicing slices and are not inferred by this endpoint.
