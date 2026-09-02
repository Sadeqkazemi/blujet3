# Agency active-flight catalogue

## Acceptance checklist

- [x] The agency portal's **Active flights** tab lists every future
  `SCHEDULED` + `PUBLISHED` flight returned by
  `GET /agency-portal/seat-request-options`, even when the agency has no
  allotment for that flight.
- [x] A published flight with no agency allotment shows honest zero
  allocated/sold values and its current server-derived requestable capacity;
  it is never represented by fabricated inventory.
- [x] The active-flight tab count is based on unique active flight instances,
  not the agency's allotment-row count.
- [x] An active catalogue card opens the existing real seat-request flow with
  the exact flight/cabin/fare class preselected. When commercial quota and
  price are not yet released, the flight remains visible and the existing
  flow explains that the request is awaiting commercial release.
- [x] Existing agency allotment cards and their ticket-sale action remain
  available without duplicate catalogue cards for the same
  flight/cabin/fare class.
- [x] The temporary `uat.agency` account can read back its own persisted seat
  requests without receiving another agency's data; its unrelated mutation
  restrictions remain unchanged.
- [x] Frontend regression coverage:
  `AgencySeatsPage.test.tsx` › "lists every published flight in active flights
  without requiring an allotment and opens its request flow" and "keeps an
  existing allotment card without duplicating the matching catalogue class".
- [x] Backend tenant-isolation coverage:
  `uat-shared-password.e2e-spec.ts` › "seat request history returns only the
  UAT agency own persisted requests".
