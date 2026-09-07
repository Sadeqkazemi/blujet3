# Reporting runtime readiness

The backend exposes the existing public `/ready` probe (and its `/api/v1`
alias) with a safe process-local Reporting Kafka status. PostgreSQL must be
reachable. A disabled Reporting consumer is considered ready; an enabled
consumer is ready only after its connect/subscribe/run lifecycle reaches
`running`. Processing failures are observed as counters, but do not make a
running consumer unavailable by themselves.

## Acceptance checklist

- [x] `/ready` returns 200 with database and Reporting status when Reporting is
  disabled.
- [x] `/ready` returns safe 503 when the enabled Reporting runtime is not
  running, without broker details or payloads.
- [x] The existing `/health` response and rate-limit exemptions are unchanged.
- [x] Reporting status exposes only enabled/state, process-local failure count,
  failure time, last-message time and last-success time; no topic, group,
  credentials, offsets, payload or database rows.
- [x] A disabled runtime performs no broker calls; runtime shutdown remains
  idempotent.
- [x] `health.controller.spec.ts` and Reporting runtime/handler specs pass
  (31 tests total); scoped ESLint, backend typecheck and diff checks pass.

This is a readiness seam, not Kafka lag monitoring, a durable failure registry,
DLQ policy, or proof of production availability. It does not activate the
consumer, change schema, credentials, flags, or server configuration.

The message and success timestamps are process-local observations and reset on
restart. They are not broker event times and must not be used as an SLA or lag
calculation.
