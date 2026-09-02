# Flight details, agency access, finance, and IT permission hardening

Approved reference: user screenshot supplied 2026-08-28 for the expanded
public flight-result card. This phase also covers the reported agency-login
failure, the finance-manager and agency-finance runtime checks, and keeping the
IT employee-permission catalog aligned with the current commercial and finance
surfaces.

## Acceptance checklist

### Public flight details

- [x] The expanded result preserves the selected cabin, route, schedule,
      passenger count, real fare, and remaining site inventory from the search
      offer; it does not fabricate or recalculate display-only business data.
- [x] The flight-details card uses an origin-to-destination timeline and places
      an airplane icon between origin and destination in Persian, Arabic, and
      English without reversing the semantic route.
- [ ] The price and detail hierarchy matches the approved light design at
      desktop width and remains usable at smaller widths.
- [x] Component tests prove route order, airplane marker, selected cabin,
      passenger total, and empty/optional fields.

### Agency access

- [x] A valid active AGENCY account can log in through `/agency/login` and is
      routed to its own portal; incorrect credentials, an inactive user, and a
      suspended agency remain rejected without leaking account state.
- [ ] The frontend distinguishes an unavailable server from invalid credentials
      and does not mislabel an API/authentication response as a network outage.
- [x] A focused backend auth test and frontend login test reproduce and guard
      the reported failure; a browser check exercises the real local stack.

### Finance manager and agency finance

- [x] Finance-manager dashboard/report figures come only from database-backed
      reporting and ledger APIs, with honest loading, error, and empty states.
- [x] Finance-manager transactions, agency settlements, customer/agency/charter
      reports, and exports retain role authorization and real-data filtering.
- [x] Agency credit, invoices, ledger, settlements, and financial event history
      are tenant-scoped to the authenticated agency; payment/settlement actions
      use the existing transactional ledger path and never mutate a display
      balance directly.
- [x] Focused frontend and backend tests cover authorization, ownership,
      financial totals/status changes, empty/error states, and prevent mock
      financial rows from appearing.

### IT employee permissions

- [x] `GET /it/permissions` exposes every currently enforceable commercial and
      finance employee capability under clear Persian sections and stable keys.
- [x] Permission dependencies and the IT assignment UI include the new keys;
      granting/revoking persists through the existing audited endpoint.
- [x] Server-side guards/employee permission checks consume the same stable keys
      as the catalog; hiding a navigation item is never the only enforcement.
- [x] Tests prove catalog completeness, assignment persistence, dependency
      expansion, and access to/denial of representative commercial and finance
      routes.

## Completion evidence

Each item is checked only after a named automated test or browser/runtime check
directly proves it. Merge and deployment remain outside this phase until the
user explicitly approves the reviewed diff.
