# Kafka receive / PostgreSQL commit / offset acknowledgement

Roadmap step 13 continuation. Add a Core inbox Kafka handler factory, using the
existing v1 envelope and publisher key/headers. No business payload is invented;
no producer, domain writer, application consumer, flag or deployment is enabled.
Order/Inventory/Payment retain their existing ACID ownership.

## Contract

`CommerceInboxKafkaHandler.runConfig(client, subscription, apply)` returns a
KafkaJS run configuration with autoCommit false and sequential message handling.
The trusted subscription supplies exact topic, consumer identity and expected
producer. It is never derived from a message. The caller owns authenticated
Kafka client creation, connect/subscribe/run/stop/disconnect and deployment.
Use this run configuration unchanged; never swallow handler failures, seek past
failed records, or commit offsets elsewhere for this group.
Subscription fields are snapshotted when the run configuration is created.
The callback receives `apply(manager, event)`: the exact transaction manager
and detached envelope snapshot supplied by the inbox, not Kafka's
raw payload or a separate connection. Receipt ownership stays within Core.

Each record must have a bounded non-null UTF-8 JSON value, a valid v1 envelope,
the publisher's exact aggregate key, and matching single event-id,
correlation-id and event-version headers. Unexpected topic, malformed offset,
tombstone, malformed JSON, ambiguous headers and metadata mismatch fail before
DB access. Unexpected producer is rejected by the existing inbox.

The handler heartbeats, consumes through the transactional inbox, heartbeats
again, then commits offset + 1 with bigint arithmetic. It never acknowledges
before the DB commit, or after validation/DB/handler failure. If the final
heartbeat/offset commit fails, the committed receipt remains and replay is a
duplicate. Errors reaching KafkaJS are replaced with a fixed error, without a
raw cause (no payload, raw SQL or token). Handler errors stop this run; the
application supervisor owns restart from the committed group offset.
This is at-least-once delivery with idempotent local effects, not distributed
exactly-once or a guarantee of business event ordering.

Poison records fail closed and stop progress; no automatic skip, DLQ or replay
policy is introduced. A production handler must use the supplied manager,
validate its domain payload and remain shorter than the Kafka session timeout.
Topic ACLs authenticate publisher access; a producer string alone is not proof
of service identity. Production lifecycle, lag/alerts, DLQ, payload schemas,
least-privilege Core DB grants and cutover acceptance remain open.

## Backend checklist

- [x] Read existing inbox, publisher, KafkaJS runner and broker fixtures.
- [x] Document API/schema boundary before implementation.
- [x] Validate transport metadata before DB access; unit tests cover malformed
  JSON/UTF-8/size/version/key/headers/topic/offset
  (`src/modules/commerce-inbox/commerce-inbox-kafka.handler.spec.ts`).
- [x] All 32 adapter unit tests prove callback transaction-manager forwarding and actual
  callback-before-commit-before-ack ordering, bigint offsets, duplicates,
  subscription snapshot/validation, both heartbeat failures, safe errors
  and no acknowledgement after DB failure
  (`src/modules/commerce-inbox/commerce-inbox-kafka.handler.spec.ts`).
- [x] Real Kafka + PostgreSQL: block handler before DB commit and observe no
  committed group offset, then commit and observe one effect
  (`test/kafka/commerce-inbox.kafka-spec.ts`).
- [x] Fail offset commit after DB success, restart the same group and observe
  replay without another effect, followed by the next event without loss
  (`test/kafka/commerce-inbox.kafka-spec.ts`).
- [x] Handler failure rolls back both receipt/effect and leaves the group offset
  uncommitted; new consumer in the same group retries successfully
  (`test/kafka/commerce-inbox.kafka-spec.ts`; 3 broker receive tests passed).
- [x] Local regression: all 809 backend unit tests (139 suites), 8 PostgreSQL
  inbox tests and 16 real Kafka tests (3 suites) pass. Full read-only lint,
  typecheck, build and `git diff --check` pass.
- [x] Owner-approved PR #60 merged as `41785f4`; CI `34014081649` and
  CodeQL `34014081599` passed. No server deployment.

Files: inbox Kafka handler/spec/module, real Kafka receive spec, docs/API,
DB_SCHEMA and PLAN. No new dependency, table, migration, HTTP endpoint or seed.

Regression evidence: the transaction-manager callback test failed against the
initial adapter (it forwarded event/transport payload instead); it passes after
forwarding the inbox callback unchanged. ACK failure in the broker test is
injected at the commitOffsets boundary; message transport, group offsets and DB
effects are real. This does not claim broker-network chaos or a process kill.

The initial broker fixture used zero consumer protocol retries and timed out
before entering the first handler. With five bounded protocol retries (automatic
restart still disabled), the focused receive suite and full broker suite passed.
Kafka bootstrap retry is not a policy to skip failed business records.
