# Kafka ACK / database acknowledgement gap

Scope: test the documented at-least-once boundary with real Kafka and local
PostgreSQL. No production code, schema, flag, domain writer or deployment change.

Backend checklist:
- [x] Read dispatcher/service/entity and sibling real-broker tests.
- [x] Document unchanged API/schema and scoped failure injection before code.
- [x] After real Kafka ACK, close only the worker's dedicated test DataSource;
  failure to persist delivery must leave the encrypted row undelivered/leased.
- [x] A new worker cannot reclaim a live lease or append a duplicate early.
- [x] Age only the uniquely identified fixture lease; a new worker delivers
  the identical persisted envelope/ID at a distinct broker offset and marks it
  delivered. Further drain does not append a third record.
- [x] All real broker/security/ACL/outbox tests and full read-only lint/typecheck
  pass (local evidence below).
- [ ] Owner-approved publication and Linux/ARM CI before merge.

Files: `backend/test/kafka/commerce-outbox.kafka-spec.ts`, API/schema notes,
roadmap and feature evidence. No endpoint: HTTP auth/ownership tests do not apply.
Kafka sends and database queries are real; a test-only publisher subclass closes
its worker DataSource immediately after `super.publish` acknowledges delivery.
This is controlled connection-loss injection, NOT an OS process-kill test.
The shared inspection DataSource remains open; no PostgreSQL service is stopped.
Lease aging avoids a two-minute sleep and is scoped by fixture ID plus producer.

Two physical broker records with the same event ID are expected here. Consumer
deduplication is still required and is NOT implemented or claimed by this test.
No payment, seat or business read model consumes these synthetic messages.

Local evidence (2026-09-05): `commerce-outbox.kafka-spec.ts` test "recovers the
same event after Kafka ACK but before database acknowledgement" proves the
three checked behaviors above. All 13 real Kafka/PostgreSQL tests passed in
115.439 s; all 48 focused canonical-event/publisher/config unit tests and all
4 workflow contract tests passed. Typecheck and full read-only backend lint
passed. `git diff --check` passed; owned Java processes stopped. No process
kill, end-to-end exactly-once delivery or production consumer is claimed.
