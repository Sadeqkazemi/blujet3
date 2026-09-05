# A6.20 — Production read parity and controlled cutover

This phase prepares the already-merged Loyalty/Agency read contracts for a
production decision. It does not activate a flag, change a writer, run a
migration, or deploy a server.

## Preconditions

- Production read-only credentials are provisioned separately and have an
  expiry, owner and rotation record.
- Core and downstream service builds are the exact commits intended for the
  comparison window.
- The optional reader flags remain `false` until parity is accepted.
- No national-ID, payment, passenger-secret or Identity credential is granted
  to a downstream reader.

## Parity evidence

- Compare bounded samples for members, tier rules, membership, points,
  price-lock history, card requests, agency profile, invoices and credit-request
  history using stable IDs, status, IRR strings and UTC timestamps.
- Record counts, missing IDs, extra IDs, field mismatches and latency; redact
  PII and credentials from the artifact.
- Repeat the sample after a write-side event and confirm Core remains the sole
  writer and the downstream projection converges without dual-write.
- Verify tenant and owner isolation, empty results, revoked grants and
  unavailable-listener rollback with a disposable test principal.

## Cutover gates

1. Dry-run parity is complete with zero unexplained mismatches.
2. Readiness is green with the exact restricted grants and UTC configuration.
3. Enable one Core read flag for a canary cohort; keep the downstream flag off
   until the canary is observed.
4. Enable the matching downstream flag only after the canary remains healthy.
5. Roll back in reverse order (Core flag first, then downstream flag and
   optional grants) on any mismatch, timeout, 4xx contract error or alert.

## Required artifacts before activation

- Redacted parity report and query hashes.
- Grant/readiness output for each service and environment.
- Canary owner, cohort, start/end UTC and rollback operator.
- Alert thresholds for error rate, latency, malformed responses and fallback.
- Explicit owner approval for flag activation. Deployment remains a separate
  manually authorized action.

## Current status

- [x] Read contracts are implemented, tested and merged with flags off.
- [ ] Provision production read-only credentials and run the redacted parity
  sample.
- [ ] Obtain owner approval for canary flag activation.
- [ ] Activate flags or deploy (separate approval; not part of this phase).
