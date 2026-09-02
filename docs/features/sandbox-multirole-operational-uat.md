# Sandbox multi-role operational UAT

## Objective

Provide a repeatable functional-readiness gate for the multi-role flight
lifecycle described in `sandbox-multirole-uat (1).md`. The gate combines the
existing database-backed E2E suites with a controlled live smoke test. It must
not turn known product gaps into fabricated passing behavior.

## Safe execution rules

- Automated mutation tests run against the seeded `blujet_test` database and a
  dedicated local/UAT stack by default.
- Browser journeys refuse a non-local `E2E_BASE_URL` unless the operator sets
  `UAT_ALLOW_REMOTE_MUTATION=YES` explicitly.
- Production smoke testing is read-only except for authentication challenges
  created with documented seed accounts.
- Every record intentionally created in a shared UAT environment must include
  `UAT` in a searchable name/reference.
- Real passenger PII, real cards, and real financial transfers are forbidden in
  sandbox/UAT runs.

## Automated acceptance matrix

| Flow                                    | Automated proof selected by the runner                                                                                                                                                         | Expected result                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Commercial route/flight/pricing -> CEO  | `flights.e2e-spec.ts`, `pricing.e2e-spec.ts`, `flights-journey.spec.ts`, `pricing-journey.spec.ts`                                                                                             | Commercial can create/propose; CEO can register; unauthorized roles are rejected     |
| IT services and employees               | `it-manager.e2e-spec.ts`, `phase31-employee-it-dept-permissions.e2e-spec.ts`, `it-manager-journey.spec.ts`                                                                                     | Service configuration and employee permissions are persisted and server-enforced     |
| CEO/Board Chair seat lock               | `phase13-managerial-lock-governance.e2e-spec.ts`, `reservation-journey.spec.ts`                                                                                                                | Authorized lock/release works and public inventory excludes locked seats             |
| Passenger purchase lifecycle            | `auth.e2e-spec.ts`, `booking-engine.e2e-spec.ts`, `customers.e2e-spec.ts`, `customer-identity.e2e-spec.ts`, `public-purchase-journey.spec.ts`                                                  | OTP-shaped auth, hold, re-price, payment sandbox and ticket lifecycle pass in UAT    |
| Agency onboarding and portal            | `phase16-agency-signup.e2e-spec.ts`, `agencies.e2e-spec.ts`, `agency-portal.e2e-spec.ts`, `phase13-agency-allotments.e2e-spec.ts`, `agencies-journey.spec.ts`, `agency-portal-journey.spec.ts` | Existing single-approval onboarding, portal isolation and allotment bookkeeping pass |
| Supplementary financial/lifecycle rules | `refunds.e2e-spec.ts`, `club.e2e-spec.ts`, `phase13e-pnr-lifecycle-reconciliation.e2e-spec.ts`, `phase27-employee-fl-manage-ag-settle-fn-invoices.e2e-spec.ts`                                 | Refund, club/ledger, PNR and settlement invariants pass                              |

The runner is `scripts/run-sandbox-multirole-uat.mjs`.

Examples:

```bash
# Show the exact suites without executing them.
node scripts/run-sandbox-multirole-uat.mjs --list

# Run database-backed backend UAT for all flows.
node scripts/run-sandbox-multirole-uat.mjs

# Run flows 1, 2 and 3, including browser journeys, on a local/UAT stack.
node scripts/run-sandbox-multirole-uat.mjs --flow=1,2,3 --browser
```

## One-time KL2550 financial evidence scenario

The UAT deployment includes a separately guarded, owner-approved scenario for
the exact `KL2550` IKA-FRA occurrence departing at
`2026-09-01T04:30:00.000Z`. It is not a general seed or load-test command.

- A fresh PostgreSQL custom-format backup is mandatory before execution.
- The runner refuses any different flight id, route, date, capacity, cabin
  layout, non-sandbox environment, non-`uat.*` actor, or unrelated active
  booking on the target occurrence.
- All 140 physical seats are held and wallet-paid individually with stable
  idempotency keys: FIRST 16, BUSINESS 25 and ECONOMY 99.
- Each HELD seat is observed in shared inventory before payment. After the
  sold-out checkpoint, ten synthetic tickets (4 FIRST, 3 BUSINESS, 3 ECONOMY)
  pass through customer submission, site-admin referral, finance step-up and
  paid refund.
- Wallet purchases, SALE/REFUND ledger entries, final booking states and the
  140 -> 130 occupied-seat transition are reconciled before success.
- The deploy host retains root-only JSON evidence and a finance sales CSV;
  the one-time sentinel is written only after every invariant passes.

The entry point is
`backend/dist/database/run-uat-kl2550-financial-scenario.js`. Direct execution
requires `NODE_ENV=production`, explicit sandbox auth, the exact confirmation
phrase, the approved flight-instance id, the backup reference and the protected
shared UAT password. The GitHub Actions deployment is the only supported way to
run it on the hosted UAT environment.

## Known non-passable requirements

These are release blockers or product decisions, not skipped successful tests:

- Incomplete-profile visibility is limited to SITE_ADMIN and the platform has
  two inconsistent definitions of "incomplete".
- Agency approval is single-approver; the requested Commercial + Finance dual
  sign-off is not implemented.
- Per-agency allotments are bookkeeping only. There is no production booking
  path that consumes an agency's own allotment.
- Real SMS/OTP depends on an enabled `ext_kavenegar` record with an encrypted
  API key. Without it, the provider falls back to log-only Mock SMS.
- Payment remains sandbox-only until a real gateway driver and callback flow are
  configured and certified.

## Live evaluation — 2026-08-05

Target: `http://202.133.90.31`

| ID      | Check                                  | Result               | Evidence / observation                                                                                          |
| ------- | -------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| LIVE-01 | Public home and navigation render      | PASS                 | Home, flight status, search and checkout routes respond                                                         |
| LIVE-02 | Airport catalog is available in search | PASS                 | Origin picker returned the database-backed city/airport list, including THR/DXB/IST/NJF                         |
| LIVE-03 | Search -> flight detail -> checkout    | CONDITIONAL PASS     | THR -> DXB on 1405/05/14 returned EP-821 and opened checkout at 3,800,000 toman                                 |
| LIVE-04 | Customer OTP request                   | BLOCKED              | UI reports that a code was sent, but production currently falls back to Mock SMS without a Kavenegar key        |
| LIVE-05 | Staff login                            | BLOCKED              | Username/password reaches mandatory 2FA; the real code cannot be delivered while SMS is Mock                    |
| LIVE-06 | Agency login and dashboard             | PASS                 | Seed agency login works with local-format `09120000002`; dashboard, sales and credit pages load                 |
| LIVE-07 | International-format agency phone      | FAIL                 | `+989120000002` is shown as valid by the UI but is rejected by the login API; normalization/validation disagree |
| LIVE-08 | Per-agency seat commitment             | BLOCKED              | Seat page loads but no real agency booking path consumes the allotment                                          |
| LIVE-09 | Agency sales/credit reporting          | NOT PRODUCTION-CLEAN | Reports contain seeded EP-821/BJAG*/INV-* records because production was started with `SEED_ON_START=true`      |
| LIVE-10 | Transport security                     | BLOCKED              | The deployed entry point is plain HTTP on a raw IP, so login/payment/PII must not be used operationally         |

Automated-run evidence:

- GitHub Actions run `#425` passed the repository's full backend, frontend and
  ML test jobs before deploying this version.
- The new local UAT runner passed its manifest/dry-run validation. Its database
  execution was correctly blocked on this workstation because PostgreSQL was
  not listening on `localhost:5432`; the runner now reports that precondition
  explicitly instead of emitting a seed/Jest stack trace.

## Operational release decision

**NO-GO for real passenger sales.** The application is suitable for continued
sandbox/UAT work, but not for processing real passengers or money yet.

Mandatory exit criteria:

- HTTPS on the production domain, HTTP redirected to HTTPS.
- `SEED_ON_START=false` in production and an audited cleanup/reset of seed data.
- Real Kavenegar configuration plus verified OTP delivery, retry, expiry and
  failure behavior for customer and staff 2FA.
- Real payment gateway driver, signed callback verification, reconciliation,
  idempotency and a small-value certification transaction/refund.
- A product decision and implementation for agency dual approval and real
  per-agency allotment consumption.
- One server-computed incomplete-profile rule and an approved list of panels
  that may view the badge.
- Sentry DSNs, uptime monitoring, backup restore drill and an operator runbook
  verified in the deployment environment.
