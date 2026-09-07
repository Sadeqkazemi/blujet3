# Reporting processing failure observation

The runtime uses KafkaJS logLevel.NOTHING. Add an application error log when
the manual-ack message handler rejects, so a processing failure is observable
without exposing raw broker/database errors or message content.

Backend change:
- [x] Read runtime, handler, existing tests and lifecycle contract.
- [x] No HTTP/API or schema change: the existing handler remains authoritative.
- [x] Touch runtime, its unit tests and documentation only.
- [x] Log one fixed processing-failure message per rejected invocation.
- [x] Rethrow a sanitized failure; do not acknowledge, retry or skip on behalf
  of the handler. Preserve the existing manual-ack run configuration.
- [x] Successful processing emits no error; disabled runtime makes no calls.
- [x] Prove raw errors and incoming payload never enter logs.
- [x] Focused tests, scoped lint and typecheck pass.

Evidence: `reporting-kafka.runtime.spec.ts` (failure sanitization/logging,
success and disabled paths) and `reporting-kafka.handler.spec.ts` (manual ACK
ordering). The new failure regression was red before the runtime change;
both suites then passed, 27 tests total. CI and real-broker regression remain
required before merge; they were not run in this local slice.

This is not a lag metric, DLQ, durable failure registry, or consumer crash
monitor. Broker retry/restart policy is unchanged. No flag activation,
deployment, credentials, new dependency, or replay command is included.
