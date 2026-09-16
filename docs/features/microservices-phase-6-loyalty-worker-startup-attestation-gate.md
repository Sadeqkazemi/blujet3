# Loyalty worker startup attestation gate

## Scope

- [x] Run the existing runtime-role attestation before reading a checkpoint or
      making any Kafka client call.
- [x] Start the consumer only when the active projection connection is exactly
      the restricted `blujet_loyalty_projection_runtime` identity.
- [x] Fail closed with a fixed, content-free startup error when attestation
      fails; do not emit SQL, URLs, credentials, role details or event data.
- [x] Preserve disabled behavior and the existing successful startup,
      checkpoint, processing and shutdown contracts.
- [x] Prove attestation-before-checkpoint-before-connect ordering and prove
      that a rejected attestation performs no checkpoint or Kafka operation,
      including a later shutdown hook; partial startup cleanup runs once.
- [x] Pass focused and full Loyalty tests, read-only lint, typecheck, build,
      OpenAPI stability and diff hygiene before opening a PR.

## Exclusions

This change does not provision or rotate a role, change a database URL,
activate Kafka, copy data, add a migration, edit production Compose, cut over
reads, deploy or merge. The existing role provisioner and real-PostgreSQL
permission proof remain the authority for the role contract itself.
