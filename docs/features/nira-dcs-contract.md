# NIRA/DCS integration contract v1

This slice defines the versioned boundary only. It does not call NIRA, store
vendor credentials, submit manifests, or change the existing public API. NIRA
remains authoritative for boarding-card and airport operational messages.

## Contract

`NiraManifestRequest` contains `schemaVersion=v1`, correlation and idempotency
identifiers, a bounded flight number, an exact UTC departure timestamp and a
bounded passenger list. Passenger fields are validated at this boundary and
are never logged. `NiraManifestAcknowledgement` is versioned and distinguishes
an accepted response (acknowledgement id required) from a rejected response
(vendor code required).

Unknown fields, malformed timestamps, invalid identifiers, unsafe flight
numbers, invalid passenger identifiers/seat codes and unbounded lists are
rejected before any adapter call. The parser returns a detached snapshot so a
caller cannot mutate the validated request after admission.

## Activation boundary

The existing `NiraProvider`/`NiraService` remains unchanged and the mock stays
the only development provider. A real adapter must be added only after the
airline supplies the vendor schema, sandbox, acknowledgement codes,
certificates and retry/dead-letter policy. Production must fail closed when a
real provider is requested but unavailable. No `FlightDisrupted` producer is
enabled by this contract.

## Checklist

- [x] Versioned request and acknowledgement types with exact-field validation
  (`src/common/nira/nira-contracts.spec.ts`).
- [x] Correlation/idempotency, UTC, passenger-bound and acknowledgement
  invariants covered by 18 unit cases.
- [x] No production call, credential, migration, route or runtime flag changed.
- [ ] Vendor sandbox adapter, timeout/retry/replay/dead-letter tests — requires
  the NIRA documentation and sandbox supplied by the airline.
