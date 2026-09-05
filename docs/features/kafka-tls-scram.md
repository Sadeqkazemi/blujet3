# Kafka TLS/SCRAM integration gate

Scope: test the existing Kafka publisher/config against a real isolated broker
using TLS and SCRAM-SHA-256/512. No production code, HTTP contract, database,
business producer, server configuration or deployment changes.

Backend checklist:
- [x] Read existing publisher/config and sibling real-broker fixture/tests.
- [x] Document unchanged API/schema and isolated fixture credentials first.
- [x] Generate short-lived, per-run loopback certificate and SCRAM credentials
  (`local-kafka-security.ts`, exercised by secure suite setup).
- [x] Both supported SCRAM mechanisms deliver the exact fixture event over TLS
  (`kafka-security.kafka-spec.ts`, two parameterized delivery tests).
- [x] Wrong password, unknown user and untrusted certificate fail closed and
  expose only the publisher's redacted error, with no new broker record
  (three rejection tests; each followed by a successful authenticated delivery).
- [x] TLS hostname verification rejects a mismatched server name
  (secure suite, explicit `ERR_TLS_CERT_ALTNAME_INVALID` assertion).
- [x] Existing plaintext outbox commit/rollback/crash tests remain green
  (`commerce-outbox.kafka-spec.ts`, three tests).
- [x] Stop only owned broker; remove generated private-key/config material
  (secure suite cleanup verifies both files are absent).
- [x] Local real tests, lint/typecheck and workflow contract checks pass
  (2026-09-05: 9/9 real tests, 116.097 s; full read-only lint, typecheck,
  4/4 workflow contract tests; 48/48 existing canonical-event, publisher and
  Kafka-config unit tests).
- [ ] Owner-approved publication and Linux/ARM CI pass before merge.

Only synthetic events are published. Certificates/credentials are created at
runtime using the installed Java 21 keytool; no production trust store is changed,
no TLS verification is disabled, and no key material is committed or printed.
The broker's controller listener remains loopback plaintext for this single-node
fixture. This is client TLS/SCRAM evidence, not production topology validation,
ACL/authorization validation, multi-broker durability, mTLS or certificate rotation.

The suite is discovered by the existing `npm run test:kafka` command and its
required CI job. No new runtime flags or dependencies are introduced.

Touched files: `backend/test/kafka/local-kafka.ts`,
`backend/test/kafka/local-kafka-security.ts`,
`backend/test/kafka/kafka-security.kafka-spec.ts`, this checklist, API/schema
notes and roadmap/previous CI acceptance evidence. No endpoint was added:
HTTP 400/401/403/ownership checks are not applicable to this test-only slice.
All broker and keytool subprocesses are local and bounded. The fixture controller
is plaintext; client authentication succeeds for both SCRAM mechanisms. This does
not establish production cluster security or authorize enabling Kafka there.

References: [Kafka SASL](https://kafka.apache.org/39/security/authentication-using-sasl/)
and [Kafka TLS](https://kafka.apache.org/39/security/encryption-and-authentication-using-ssl/).
