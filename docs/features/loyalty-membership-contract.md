# A6.18 — Real customer membership contract

Test-only follow-up to A6.12. Compare built Core ClubService/client with real
Loyalty HTTP and an exact-column PostgreSQL reader. Keep the existing public
membership API, single Core writer, permissions and default-off flags unchanged.

Backend checklist:
- [x] Read controller/service, entity/client, existing E2E and sibling probes.
- [x] Confirm the A6.12 API/schema contract before implementing tests.
- [x] Limit changes to one probe, one E2E suite and API/schema/PLAN/feature docs.
- [x] Implement and verify the real boundary (11 cases); no new dependencies
  or migration.

Acceptance — loyalty-service/test/membership-contract.e2e-spec.ts:
- [x] Exact Core/remote parity with ledger-derived points (not member cache),
  latest readable card request/history and UTC timestamp; prove remote delivery.
- [x] Owner isolation, absent/inactive membership, no-request eligibility and
  rejection of foreign owner assertions and invalid service identity.
- [x] Disabled Core flag makes zero HTTP calls; service-disabled 404 fails
  closed as documented, while unavailable service/lost grants use Core fallback.
- [x] Lost-grant readiness and recovery, unchanged fixture/ledger snapshots,
  exact synthetic-fixture and temporary-role cleanup in a named _test database.
- [x] Loyalty full E2E (74 cases) and unit (16 cases), Backend client (11
  cases), both typechecks/builds, full Loyalty lint and scoped Backend lint pass.

The probe runs already-built Core with a read-only database session; it is
typechecked before transpile-only child-process execution. Reports contain
only comparison status and HTTP/remote-result/warning counters, never rows,
tokens or owner identifiers. Both fixture owners are synthetic; ledger and
request writes exist only in test setup/cleanup, not application code.
The full Loyalty E2E suite runs sequentially. Its 11 new membership cases are
included in the 74 total. No temporary membership reader remains after tests.

- [x] Public Club regression rerun (26/26): authorization, owner-bound reads,
  unchanged join/card-request writers and validation. Total: 127 relevant cases.
- [ ] GitHub CI/PostgreSQL 16 after separately approved publication.

This is local/CI contract evidence, not production parity or rollout approval.
No financial/points writer is moved and no server action is authorized.
