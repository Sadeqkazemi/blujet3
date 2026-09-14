# Kafka consumer authorization integration gate

Scope: exercise a dedicated TLS/SCRAM consumer against the isolated Kafka 3.9.1
fixture with StandardAuthorizer enabled, default deny, and a per-run consumer
identity that is not a superuser. No production code, server ACL, environment
flag, API, event schema, database or business-writer change.

Backend checklist:

- [x] Read architecture, publisher ACL sibling tests and the Kafka 3.9.1 harness.
- [x] Document unchanged API/schema and test-only access model before code.
- [x] Authenticated consumer without ACLs cannot read records or join a group
  (`kafka-security.kafka-spec.ts`: denies an authenticated consumer with no
  resource grants; setup separately proves successful SCRAM authentication).
- [x] Explicit exact-topic Read and exact-group Read grants permit consumption
  of an exact canonical event by the restricted consumer (same spec: consumes
  after granting only literal-topic Read and group Read).
- [x] That same consumer cannot read another existing topic and cannot join
  another consumer group; denials are redacted and no payload is printed (same
  spec: denies the same consumer access to another topic / group).
- [x] Existing TLS/SCRAM and publisher ACL tests still pass in the same suite.
- [x] Owner-approved CI on Linux/ARM real Kafka before merge. No deployment.

Files: `backend/test/kafka/local-kafka-security.ts`,
`backend/test/kafka/kafka-security.kafka-spec.ts`, API/schema notes, roadmap and
this checklist. HTTP 400/401/403 and tenant tests are not applicable: no route
or business service is changed. No new dependencies or configuration flags.

The fixture administrator is a superuser; the publisher and consumer are not.
The consumer grant is literal and scoped to one randomized topic and one
randomized group, with no Write, Create, Delete, Alter or wildcard grants.
The internal single-node controller remains loopback plaintext; User:ANONYMOUS
is a fixture-only superuser for controller traffic. Clients must still
authenticate over SASL_SSL. This is NOT a production broker configuration.

All grants and SCRAM identities exist only in this disposable broker metadata.
Cleanup stops the owned broker and removes private key/config files only.
Reference: [Kafka 3.9 authorization](https://kafka.apache.org/39/security/authorization-and-acls/).

Evidence: the CI-blocking Kafka 3.9.1 broker suite, Backend, eight E2E shards,
CodeQL and CI gate pass. Local Kafka workflow contract tests 4/4, scoped ESLint,
typecheck, production build, diff hygiene and OpenAPI stability also pass.
