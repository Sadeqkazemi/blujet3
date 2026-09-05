# BluJet Microservices Target Architecture

## Decision

BluJet will use selective microservices for domains it owns and explicit
integration contracts for capabilities implemented by external airline
systems. This is a strangler migration: no big-bang rewrite and no shared
business writes across services.

## BluJet owned domains

| Domain | Initial owner | Extraction order | Source of truth |
| --- | --- | --- | --- |
| Identity | identity-service | already extracted | identity schema/service |
| Notifications | notify-service | already extracted | notify schema/service |
| Experience | experience-service | already extracted | experience schema/service |
| Loyalty | loyalty-service | already extracted | loyalty schema/service |
| Agency | agency-service | already extracted | agency schema/service |
| Offer and pricing | Core commerce | next | Core pricing tables and API |
| Ticketing and refund | Core commerce | after contracts | Core until cutover |
| Payment and ledger | Core commerce | after reconciliation | Core until cutover |
| Order and booking | Core commerce | later | Core transaction boundary |
| Inventory and seat lock | Core commerce | last | Core PostgreSQL locks |
| Reporting | read-model service | after events | derived projections only |

Operations, crew and maintenance are not BluJet-owned bounded contexts. Their
systems remain authoritative and are accessed only through versioned adapters.

## External integration boundaries

- **Nira/DCS:** boarding pass, check-in, boarding and airport operational
  messages. BluJet sends only approved booking/ticket manifests and consumes
  acknowledgements; Nira remains authoritative for boarding-card issuance.
- **Flight operations/OCC:** schedules, delays, cancellations and aircraft
  changes through an adapter; no direct table access.
- **Crew and MRO:** references and status events are consumed as external data;
  BluJet does not create crew or maintenance records.

Each adapter must enforce service identity, request correlation, schema version,
idempotency, timeout, bounded payloads, replay policy and a dead-letter path.

## Platform rules before further extraction

1. Every service owns its tables/schema and exposes data through API or events.
2. Cross-domain writes use commands/events, never foreign-key writes into a
   different service's tables.
3. Transactional Outbox is required for every business event.
4. Public `/api/v1/**` routes remain compatibility facades during migration.
5. Order + Inventory + Payment remain one ACID boundary until a reviewed Saga
   and reconciliation design proves equivalent safety.
6. All money events carry integer IRR, currency, idempotency key and audit ID.
7. External integrations fail closed for unsafe writes and degrade read paths
   only where the existing contract explicitly permits it.

## First implementation slice

- Publish canonical event envelopes for `OrderCreated`, `PaymentConfirmed`,
  `TicketIssued`, `RefundRequested` and `FlightDisrupted`.
- Add contract tests and an adapter interface for Nira/DCS without connecting
  production credentials.
- Add an event-consumer/read-model seam for reporting.
- Keep all feature flags off and keep deployment separate.

## Exit criteria

- Ownership matrix and event catalog reviewed.
- Contract fixtures cover valid, duplicate, stale-version and malformed events.
- Adapter tests prove timeout, retry, replay and dead-letter behavior.
- No existing public route or financial writer changes unexpectedly.
- A separate owner approval exists before any service extraction or cutover.
