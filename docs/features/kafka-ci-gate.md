# Kafka real-broker CI gate

Scope: run the existing three real Kafka/PostgreSQL tests in an isolated CI job
and make its failure block CI gate. No production code, schema, public API,
business producer, server activation or deployment changes.

- [x] Inspect existing workflow, broker harness and migration/test setup.
- [x] Four workflow regression tests fail before adding the job (`scripts/kafka-ci.test.mjs`).
- [x] Configure backend/workflow/own contract-test changes and workflow_call (contract test 1).
- [x] Configure dedicated PostgreSQL 16 test DB, Java 21 and pinned Kafka archive (tests 2/3).
- [x] Verify pinned SHA-512 before extracting; bounded download/job timeout (tests 2/3).
- [x] Configure existing commit, rollback and crash/restart suite without mocks (test 4).
- [x] CI gate depends on broker job; no continue-on-error or deployment credentials (tests 1/2).
- [x] Bounded fixture-broker diagnostics on failure, no dumps or production data (test 4).
- [x] Local workflow tests, shell syntax and real-broker regression pass (evidence below).
- [ ] Owner-approved push and actual Linux CI execution before merge.

Existing standard unit/E2E commands remain unchanged. The job uses its own runner
and PostgreSQL service, so its outbox cannot race with other E2E shards. It does
not seed business data or install anything on an airline server. The existing
harness stops its owned Java process; the disposable runner is the timeout
cleanup boundary. TLS/SCRAM, replication, business consumers and throughput are
separate unverified gates; a single-node loopback test is not production readiness.

Java setup uses an immutable commit of the official
[setup-java action](https://github.com/actions/setup-java) with Temurin 21.
Kafka comes from the Apache 3.9.1 archive with a fixed SHA-512, not a mutable latest
download. No caching of broker data or migration state.

Local checks: all four `node scripts/kafka-ci.test.mjs` tests passed after failing
for the missing job; YAML parsed with the existing backend js-yaml dependency.
Every new shell step passed `bash -n`. The existing final gate was executed with
success/skipped, failure and cancellation results and returned 0, 1, 1. The
workflow digest matches the previously verified portable Kafka archive. These
are local configuration checks, not a claim of Linux CI execution or a cluster test.

Final local evidence (2026-09-05): `npm run test:kafka` with the existing portable
Java/Kafka paths passed all 3 tests in 117.297 seconds. The harness stopped its
owned broker and removed its uniquely identified outbox fixtures; fixture broker
logs remain in the OS temp directory. `git diff --check` passed. No backend code,
dependency, schema, production flag or deploy workflow changes are in this slice.

The new job has not yet executed on GitHub Linux/ARM. Download availability,
runner-specific behavior and the integrated CI result must be checked on the
first owner-approved PR. This is an explicit remaining acceptance gate, not a
passed test inferred from local Windows execution.
