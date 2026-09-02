# Central PSS/CRS extraction and airline document lifecycle

Status: **APPROVED — owner approval received 2026-09-01**

This programme turns the current direct-sale booking engine into a central,
airline-owned Passenger Service System. The public/agency website remains a
client of the PSS and must never keep an independent inventory, PNR, ticket,
coupon, or EMD source of truth.

The migration is deliberately incremental. A big-bang rewrite would put live
inventory and financial reconciliation at unacceptable risk.

## Approved product decisions

1. Use a traditional-compatible hybrid model now: PNR + e-ticket + flight
   coupons + EMD, with an Offer/Order API boundary that can later support
   IATA ONE Order.
2. Add a separate NestJS `pss-service` package with its own PostgreSQL database
   (`PSS_DATABASE_URL`). The website backend calls it only through an internal
   authenticated adapter. Browsers and public partners never reach it directly.
3. Keep current `/search`, `/bookings`, `/reservation`, and partner endpoints as
   compatibility facades during migration. They delegate to PSS after cutover.
4. Make the PSS database the only writer for schedules used for sale, fare
   inventory, holds, reservations, PNRs, ticket documents, coupons, and EMDs.
5. Allocate ticket/EMD numbers only from accountable document-stock ranges.
   Production fails closed when the airline numeric accounting code or an
   approved stock range is missing. The current random `780...` generator is
   not an acceptable production allocator.
6. Target NDC 24.1 messages at the external adapter boundary. Calling the
   internal Direct Connect API "NDC certified" is forbidden until a named
   partner test harness and certification are completed.
7. Real Nira integration is a vendor boundary. Production remains fail-closed
   until the airline supplies the protocol, endpoint, credentials, message
   timing, acknowledgement/retry rules, and test environment.
8. Interline/codeshare remains disabled until a named partner supplies its
   agreement, carrier codes, schedule/ticketing messages, settlement rules,
   test cases, and certification path.

## Non-negotiable invariants

- One PNR identifies one reservation/order and may contain multiple travellers
  and multiple ordered flight segments.
- Each ticketed traveller has one accountable ticket document and one ordered
  coupon per air segment. Infants without a seat still receive the document
  treatment required by the approved ticketing policy.
- Each paid ancillary that requires an EMD is represented by an accountable EMD
  document and coupon; it is never disguised as an air ticket or ledger note.
- Holds and ticketing lock every affected inventory bucket in a deterministic
  order. A multi-segment command succeeds completely or changes nothing.
- PNR, ticket, coupon, EMD, inventory and payment-confirmation commands are
  idempotent. Duplicate delivery cannot double-sell or double-issue.
- Financial authorization is not invented by PSS. The website/payment service
  sends a verified payment reference; PSS records the reference and performs
  fulfilment exactly once.
- All state changes append an audit event and transactional outbox event.
- Ticket/coupon history is immutable. Exchange creates replacement documents;
  refund/void changes lifecycle status and never overwrites history.
- The website database may keep read projections, but projections never
  authorize a sale and are rebuildable from PSS events.

## Delivery slices and acceptance checklist

### Slice 0 — contracts, service shell, and safe migration controls

- [x] Create `pss-service` with validated environment, health/readiness probes,
      structured logging, request IDs, internal authentication and OpenAPI.
      Proven by `env.validation.spec.ts`, `internal-auth.guard.spec.ts`, and
      `service-shell.e2e-spec.ts`.
- [x] Add `PssClient` interface and HTTP adapter to the website backend; tests
      use a fake only at this network boundary. Proven by
      `http-pss.client.spec.ts`.
- [x] Add transactional idempotency and outbox stores. Proven by
      `idempotent-command.service.spec.ts` and the real-Postgres command replay
      case in `service-shell.e2e-spec.ts`.
- [x] Add reconciliation reports comparing current booking/inventory rows with
      PSS shadow projections. No production writer is switched in this slice.
      Proven by `shadow-reconciliation.service.spec.ts`, the authenticated E2E
      report case, and `backend`'s `pss:reconcile:shadow` operator command.
- [ ] Document rollback and prove a restored backup before cutover.
      Rollback is documented and CI executes
      `scripts/verify-backup-restore.sh`; keep this unchecked until that CI job
      has produced fresh passing evidence.

### Slice 1 — multi-segment CRS and inventory authority

- [ ] A reservation accepts an ordered list of one or more flight instances;
      duplicate, discontinuous, cancelled, unpublished, chronologically invalid
      and minimum-connection-time-invalid itineraries are rejected.
- [ ] Availability is calculated per segment/cabin/fare bucket from PSS-owned
      inventory transactions, active holds and issued coupons.
- [ ] A single transaction and deterministic row-lock order holds all segments.
      Failure on any segment releases/rolls back all segments.
- [ ] One PNR is created per reservation, not per passenger or segment.
- [ ] Hold expiry is handled by a durable worker as well as lazy reads; worker
      restart and duplicate delivery are tested.
- [ ] Existing single-segment API requests remain compatible.
- [ ] Concurrency E2E proves exactly one winner for the last seat on every leg.

### Slice 2 — accountable e-ticket documents and flight coupons

- [ ] Add approved ticket-stock blocks and atomic next-number allocation.
- [ ] Issue one ticket per traveller with one coupon per ordered air segment.
- [ ] Persist immutable issue-time flight, route, cabin, fare, tax, baggage,
      endorsement and validating-carrier snapshots.
- [ ] Implement document/coupon statuses for issue, airport control, flown,
      void, refund and exchange without deleting history.
- [ ] Backfill existing ticketed single-segment bookings idempotently; produce
      an exception report rather than fabricating missing accountable numbers.
- [ ] Public, agency, staff, finance and reservation views read the same PSS
      document and coupon data.

### Slice 3 — EMD and post-ticket servicing

- [ ] Configure ancillary reason/sub-code catalogues and whether an item
      requires EMD-A or EMD-S treatment.
- [ ] Issue EMD documents from accountable stock and associate coupons to the
      traveller, service, flight coupon and payment reference.
- [ ] Support consume, void, refund and exchange states transactionally.
- [ ] Partial segment refund/exchange updates only affected coupons and creates
      balanced financial reversal/reissue events.
- [ ] Duplicate commands and concurrent servicing cannot create two documents.

### Slice 4 — real Nira/DCS boundary

- [ ] Replace the always-wired mock with environment-selected mock and real
      providers; production startup fails when real Nira is required but absent.
- [ ] Generate the exact PNL/ADL/manifest contract required by the vendor from
      coupon state, never from a browser-created list.
- [ ] Persist submissions, payload digest, correlation id, acknowledgements,
      retries, dead-letter state and manual replay audit.
- [ ] Reconcile Nira acknowledgement against PSS passengers/coupons and alert
      mismatches before departure.
- [ ] Contract tests run against the vendor sandbox supplied by the airline.

### Slice 5 — NDC Direct Connect and controlled partner distribution

- [ ] Map NDC 24.1 AirShopping, OfferPrice, OrderCreate, OrderRetrieve,
      OrderChange and OrderCancel messages to the same PSS commands.
- [ ] Bind signed offers to seller, itinerary, travellers, price, currency,
      inventory version and expiry.
- [ ] Enforce seller scopes, tenant isolation, replay protection, rate limits,
      audit and settlement identifiers.
- [ ] Never claim GDS/NDC certification before a named partner passes its
      conformance and end-to-end financial test suite.

### Slice 6 — interline/codeshare (partner-gated)

- [ ] Import/export approved schedules and operating/marketing carrier data.
- [ ] Support validating/operating carrier ownership per segment and coupon.
- [ ] Implement partner availability, booking, ticketing, disruption, servicing
      and settlement only for explicitly contracted scenarios.
- [ ] Complete partner certification and revenue-accounting reconciliation.

### Slice 7 — cutover and independent operation

- [ ] Run shadow reads and reconciliation until inventory, reservations,
      documents and finance match for the agreed observation period.
- [ ] Switch all sale writers to PSS behind a feature flag; no dual writes.
- [ ] Prove rollback, retry, outbox replay, backup restore, RPO/RTO, alerting,
      capacity, load and failover targets.
- [ ] Make legacy booking tables read-only projections, then remove direct
      website writes in a later migration.

## Required owner/vendor inputs before affected slices

The following cannot be guessed or replaced with mock production behaviour:

- Airline IATA two-letter/three-letter codes and numeric accounting code.
- Approved e-ticket and EMD stock ranges and stock-management authority.
- Nira vendor protocol/API documentation, sandbox, endpoint, credentials,
  certificates/IP allow-list, acknowledgement codes and support contact.
- Named GDS/NDC/interline partners, target message version, commercial scope,
  settlement route and certification test harness.
- Production RPO, RTO, peak searches/second, bookings/second, retention and
  data-residency requirements.

## Completion evidence

Each checked item must name its unit/contract/E2E test. Completion requires
migration rehearsal, rollback rehearsal, full CI, security review, load test,
backup restore and vendor sandbox evidence for every external integration.
