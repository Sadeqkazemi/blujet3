# Kafka real-broker integration gate

Scope: reproducible opt-in integration tests for the existing Kafka publisher,
Core outbox and dispatcher using real Kafka and PostgreSQL. No production writer,
public API, migration, runtime flag activation, server deployment or npm
dependency changes. Existing default tests must not require Java or a broker.

Reproduced during the first real run: KafkaJS 2.2.4 rejects an idempotent
producer configured with zero retries. This slice corrects producer retries to
one (bounded), retains the outbox retry budget and at-least-once contract, and
adds a real-vendor construction regression test to the normal unit suite.

Acceptance:
- [x] Read current publisher/config/outbox and existing PostgreSQL tests.
- [x] Confirm unchanged public API and schema; document test-only side effects.
- [x] Start isolated KRaft Kafka on loopback: `test/kafka/local-kafka.ts`, exercised by the integration suite.
- [x] Publish committed envelope/key/headers: `commerce-outbox.kafka-spec.ts`, commit test.
- [x] Rollback leaves no row/record: `commerce-outbox.kafka-spec.ts`, rollback test.
- [x] Outage/restart preserves event ID: `commerce-outbox.kafka-spec.ts`, crash/restart test.
- [x] Stop owned broker and delete only fixture rows: integration suite `afterAll`; broker logs retained.
- [x] Constructor regression: `kafka-event-publisher-construction.spec.ts`, real KafkaJS without networking.
- [x] Local unit/integration regression, scoped lint, build and typecheck pass (evidence below).
- [ ] Repository-wide read-only lint is clean (existing formatting/type-assertion errors outside this slice).
- [ ] Publish after approval and verify CI; opt-in broker suite is not wired into CI.
- [ ] Real TLS/SCRAM and multi-broker durability tests (separate gate if not run).

The test broker has replication factor 1 and loopback-only plaintext transport;
this is not production topology or evidence of TLS/SASL, failover, consumer
deduplication, load capacity or end-to-end exactly-once delivery. No passenger,
financial or business-source data is published; all messages are test fixtures.
The harness must refuse non-loopback DB targets or a database not ending _test.
It must fail rather than silently skip when explicitly invoked without tools.
The harness pins both Node and its own PostgreSQL connections to UTC. The local
Windows database defaults to Asia/Tehran; mixing that with UTC Node postpones
timestamp-without-timezone rows by 3.5 hours. This does not alter database-wide
settings. Matching UTC application/database sessions remains a deployment gate.

## Reproduce locally

Prerequisites: installed backend dependencies, a disposable loopback PostgreSQL
database ending `_test` configured in `.env.test`, an empty commerce outbox,
verified Apache Kafka **3.9.1 / Scala 2.13** and Java **21**. The harness applies
existing migrations to that test database only. Do not run beside other outbox
workers/tests sharing the same database. It never installs Java/Kafka itself.

PowerShell, from `backend/` (replace the two paths):

```powershell
$env:KAFKA_TEST_JAVA='C:/tools/jre-21/bin/java.exe'
$env:KAFKA_TEST_HOME='C:/tools/kafka_2.13-3.9.1'
npm run test:kafka
```

The command fixes Node TZ to UTC; the datasource fixes its own sessions to UTC.
Every invocation allocates a new temp directory, random loopback ports, topic,
consumer group and fixture producer. It kills only the Java child it started.
The same Kafka data directory is reused for the crash/restart assertion and
retained as `<OS temp>/blujet-kafka-*/broker.log` with fixture-only Kafka data.
Normal unit/E2E commands do not run this opt-in suite or require Java.

## Local evidence — 2026-09-05

- Windows; Node 22.15.0; PostgreSQL 18.2; Kafka 3.9.1; Temurin JRE 21.0.12.1+1.
  Portable downloads verified against official SHA-512 (Kafka) and SHA-256
  (Temurin) checksums; no global installation or server changes.
- `npm run test:kafka`: 3 real-broker/PostgreSQL tests passed.
- `npm test -- --runInBand --silent`: 137 suites / 767 tests passed.
- `npm run test:e2e -- --runInBand --runTestsByPath test/commerce-outbox.e2e-spec.ts test/commerce-outbox-status.e2e-spec.ts`:
  24 PostgreSQL tests passed.
- `npm run typecheck`, `npm run build`, scoped read-only ESLint: exit 0.
- Repository-wide read-only ESLint: 479 existing errors in unchanged files:
  473 `prettier/prettier` (including mixed line endings) and 6
  `@typescript-eslint/no-unnecessary-type-assertion`; no broad cleanup applied.
- TLS/SCRAM, replication-factor > 1, load, consumer deduplication and production
  timezone readiness are **not** demonstrated by these local results.

References: [Apache Kafka 3.9 quick start](https://kafka.apache.org/39/getting-started/quickstart/)
and [KafkaJS consuming](https://kafka.js.org/docs/consuming).
