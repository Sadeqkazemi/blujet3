# Kafka topic authorization integration gate

Scope: exercise the existing publisher against the isolated TLS/SCRAM broker
with Kafka StandardAuthorizer enabled, default deny, and separate per-run
administrator and restricted publisher identities. No production code, server
ACL, environment flag, API, event schema, database or business-writer change.

Backend checklist:
- [x] Read architecture, publisher/config and sibling TLS/SCRAM fixture/tests.
- [x] Document unchanged API/schema and test-only access model before code.
- [x] Authenticated publisher without ACLs cannot publish or append a record
  (`kafka-security.kafka-spec.ts`: denies an authenticated publisher with no
  resource grants; setup separately proves successful SCRAM authentication).
- [x] Explicit exact-topic Write and cluster IdempotentWrite grants permit
  exact canonical-event delivery by the restricted publisher (same spec:
  delivers exact events after granting only literal-topic Write and IdempotentWrite).
- [x] That same publisher cannot publish to a different existing topic;
  denial is redacted and no record is appended; allowed-topic control succeeds
  (same spec: denies the same publisher access to another existing topic).
- [x] Existing authentication/TLS and outbox tests still pass (same secure spec
  and `commerce-outbox.kafka-spec.ts`; 12/12 real tests, 113.47 s).
- [x] Full read-only lint, typecheck, 48 focused unit tests and 4 CI-contract
  tests pass on 2026-09-05. `git diff --check` also passes.
- [x] Owner-approved PR #57 merged as `a7ba2ea`; CI `33975955259` and
  CodeQL `33975955263` passed, including Linux/ARM real Kafka tests.

Files: `backend/test/kafka/local-kafka-security.ts`,
`backend/test/kafka/kafka-security.kafka-spec.ts`, API/schema notes, roadmap and
feature evidence. HTTP 400/401/403 and tenant tests are not applicable: no route
or business service is changed. No new dependencies or configuration flags.

The fixture administrator is a superuser; the publisher is not. Its topic grant
is literal and scoped to one randomized topic, with no Create, Delete, Alter,
Read or group grants. The internal single-node controller remains loopback
plaintext; User:ANONYMOUS is a fixture-only superuser for controller traffic.
Clients must still authenticate over SASL_SSL. This is NOT a production broker
configuration or full network-isolation/consumer-authorization test.

All grants and SCRAM identities exist only in this disposable broker's metadata.
The existing cleanup stops its owned broker and removes private key/config files.
Reference: [Kafka 3.9 authorization](https://kafka.apache.org/39/security/authorization-and-acls/).

Red/green evidence: with the new restricted SCRAM user but no authorizer, the
no-grants test failed because publication succeeded (46.449 s targeted run).
Enabling StandardAuthorizer and default deny made all 12 real tests pass.
No production authorization weakness is inferred: this reproduces the previous
unrestricted test fixture only. Existing private-key/config absence assertions
passed during cleanup. This slice was pushed and merged in PR #57; no server
deployment was performed.
