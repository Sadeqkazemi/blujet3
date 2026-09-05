# Kafka outbox status — read-only operational slice

Scope: one operator CLI following the existing shadow-report scripts; one
aggregate reader in the commerce-outbox module; focused unit/PostgreSQL tests;
package commands and documentation. No new dependency or HTTP endpoint.

Backend checklist:
- [x] Read existing outbox service/entity/dispatcher/spec and shadow-report CLI.
- [x] Document API/DB contract before implementation; preserve financial writers.
- [x] Exact decimal-string counts and allowlisted output:
  `backend/src/modules/commerce-outbox/commerce-outbox-status.spec.ts`.
- [x] Read-only snapshot, UTC time and lock timeout/recovery:
  `backend/test/commerce-outbox-status.e2e-spec.ts`.
- [x] Empty, pending, paused and attention states: both specs above.
- [x] Null/future age, scheduled retries, active/expired leases and quarantine:
  `backend/test/commerce-outbox-status.e2e-spec.ts`.
- [x] Restricted-column grants, denied payload access/writes and unchanged
  event rows: `backend/test/commerce-outbox-status.e2e-spec.ts`.
- [x] CLI success without Kafka/PII credentials, exit codes and redacted
  failures: `backend/test/commerce-outbox-status.e2e-spec.ts`.
- [x] 766 unit tests / 136 suites and 24 PostgreSQL E2E tests (including the
  existing `commerce-outbox.e2e-spec.ts`) passed locally; typecheck, build,
  scoped read-only lint and compiled CLI smoke also passed on 2026-09-05.
- [ ] CI evidence for this new branch; no publication/merge in this slice.

Contract (reportVersion 1): `capturedAt` UTC ISO, `dispatchConfiguredEnabled`
(configuration only, not worker liveness), `status`, `counts` and
`oldestPendingAgeSeconds` (decimal string or null). Counts are decimal strings:
pending, ready, scheduled, inFlight, expiredLease, quarantined. Pending excludes
delivered and quarantined; ready/scheduled/inFlight/expiredLease partition it.
Lease duration is shared with the dispatcher (120 seconds). At the exact lease
boundary the claim remains active, matching dispatcher's strict `<` predicate.
Future creation timestamps give age zero, never negative. Delivered history is
excluded. Missing/invalid schema or DB permission never becomes a zero report.

Status precedence:
1. ATTENTION if quarantined or expiredLease is nonzero.
2. PAUSED if pending is nonzero and dispatch is configured off.
3. PENDING if pending is nonzero and dispatch is configured on.
4. IDLE otherwise (does not mean Kafka is healthy).

Exit 0: IDLE/PENDING. Exit 2: ATTENTION/PAUSED. Exit 1: UNAVAILABLE, including
invalid config, DB failure, timeout or malformed aggregate. Failure JSON has
only reportVersion and status: no SQL, URL, credentials or partial counts.
No alert age/count threshold is invented; SLA alerts and external monitoring
integration remain separate work. This command sends no messages/notifications.

Run manually with authorized database credentials in DATABASE_URL. The only
Kafka setting read is KAFKA_EVENTS_ENABLED, strictly true/false (absent=false).
The CLI does not instantiate Nest, publisher, migration runner or seed.
Connection timeout 2 seconds; statement/lock timeouts 2 seconds. Use primary
for current queue state, not a lagging replica. Reporting never replays,
deletes, releases claims, activates flags or deploys code.

Time prerequisite: the existing TIMESTAMP-without-timezone columns must contain
UTC wall-clock values, as required by the repository data contract. Run writers
in UTC and audit timestamp provenance before interpreting historical backlog.
The reader cannot infer or repair rows previously written using a non-UTC host
clock. Windows fixtures explicitly insert UTC timestamp strings; no historical
data conversion or global driver/timezone setting is changed in this slice.

Public 401/403, DTO and OpenAPI changes are not applicable: this is a shell/DB
operator capability, not a public endpoint. OS and database access control
remain mandatory. No production command is executed by this implementation.

Verification environment: Windows, Node 22, local PostgreSQL 18.2; no broker
or server connection. The first integration run exposed local-time fixture
serialization; fixtures now insert explicit UTC strings and the same tests pass.
Temporary test rows and the dedicated NOLOGIN test role were cleaned up.
Real-broker checks, monitoring installation, SLA thresholds and operational
replay are still separate acceptance gates, not completed by this report.
