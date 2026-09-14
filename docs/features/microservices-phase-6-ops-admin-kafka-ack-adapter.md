# Microservices phase 6 — Ops/Admin Kafka acknowledgement adapter

## Boundary

This slice adds a construction-only KafkaJS adapter around the existing
transactional Ops/Admin projection consumer. It does not create a Kafka client,
subscribe to a broker, copy data, switch the read database, move a writer or
deploy a service.

The only accepted topic is the configured Ops/Admin topic. Every delivery must
carry the canonical `core-ops:CartableTask:<aggregateId>` key and transport
headers matching the parsed `CartableTaskProjected` v1 event.
`event-schema-id` remains optional for legacy v1 backlog until the separately
approved strict-header gate is enabled.

## Acceptance checklist

- [x] Kafka auto commit is disabled and each partition is processed
      sequentially.
- [x] Topic, partition, offset, size, UTF-8 JSON, strict event contract, key and
      transport headers fail closed before projection.
- [x] Schema headers, when present, equal
      `blujet.ops-admin.CartableTaskProjected.v1`; an optional strict flag
      rejects a missing header.
- [x] The next offset is committed only after the Ops/Admin projection
      transaction succeeds for applied, duplicate and stale deliveries.
- [x] Heartbeat, projection and acknowledgement failures remain retryable and
      return a sanitized boundary error without payload, content, identifiers,
      database details or broker errors.
- [x] A failed ACK followed by redelivery creates one projection and one inbox
      receipt, then safely acknowledges the replay.
- [x] The adapter is available from the Ops/Admin module without a Kafka client
      or runtime provider.
- [x] Existing HTTP/OpenAPI and PostgreSQL schemas remain unchanged.
- [x] Focused unit and real-PostgreSQL tests, read-only lint, typecheck and
      production build pass before review.

## Deferred gates

Kafka client lifecycle, broker credentials, subscription, consumer-group
checkpoint persistence, bounded retry and DLQ, baseline replay, reconciliation
approval, reader URL cutover and deployment remain disabled and require
separate evidence and owner approval.

## Local evidence

- 27 focused Ops/Admin unit tests pass, including transport admission,
  projection-before-ACK ordering, sanitized retry behavior and module wiring.
- All 220 Backend unit suites and 1,292 tests pass.
- A fresh temporary PostgreSQL database applied both standalone Ops/Admin
  migrations and passed all 4 projection E2E cases, including ACK-gap replay.
- Changed-file read-only ESLint, Backend typecheck, production build and
  `git diff --check` pass. The tracked OpenAPI artifact is unchanged.
