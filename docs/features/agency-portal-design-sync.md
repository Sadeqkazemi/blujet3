# Agency portal screenshot sync (2026-08-21)

Approved visual references: the twelve screenshots supplied by the product
owner on 2026-08-21. Demo names, prices, counts, and messages visible in those
screenshots are layout references only; production rows must continue to come
from tenant-scoped APIs.

## Acceptance checklist

### Shared shell

- [x] Public header, agency identity card, right-hand RTL sidebar, active pills,
  notification badge, and responsive mobile navigation match the reference.
- [x] Sidebar order is: dashboard, ticket purchase, allocated seats, web
  service, API docs, credit, sales, inbox, profile.
- [x] The shared “new message” action opens a management-message modal without
  navigating away; recipient, subject, and body are validated and persisted
  through the existing agency inbox API.

### Ticket purchase

- [x] `/agency/tickets` uses the same `GET /airports` catalog and `/results`
  query contract as the public homepage search.
- [x] One-way/round-trip, origin, destination, Jalali departure date, return
  date, and passenger count are validated.
- [x] Submitting navigates to the public `/results` page so the authoritative
  public search endpoint provides the same published flights as the homepage.

### Allocated seats, web service, and API docs

- [x] Allocated-seat route filters, status sections, real allotments, and the
  existing request/sell actions are presented in the screenshot layout.
- [x] Web-service pending, rejected, active-key, request-history, real plan
  prices, and purchase states are rendered from API responses only.
- [x] API documentation uses the reference two-column navigation/content
  layout and never exposes a raw API key.

### Credit, sales, and inbox

- [x] Credit cards, unpaid/paid/ledger tabs, search/filter controls, invoice
  descriptions, pay-from-credit, and credit-increase request use real data.
- [x] Sales cards and activity rows use server-derived agency data; empty
  states are honest zeros/empty lists.
- [x] Inbox uses a list/detail layout. Existing messages remain compatible;
  subjects are parsed from the existing stored subject prefix when present.

### Proof

- [x] Frontend component tests cover ticket search navigation and each revised
  page's loading, empty, error, and populated states.
- [x] Existing agency-portal backend and frontend suites pass.
- [x] Typecheck/build and lint pass.
- [ ] A local browser smoke confirms the ticket search
  reaches `/results` with the same query parameters as the homepage.

The local backend and Vite servers responded successfully during verification,
but the in-app browser blocked/refused all localhost bridge variants before the
login page loaded. The same navigation contract is covered by
`AgencyTicketPage.test.tsx`; visual browser smoke remains the only unchecked
proof item.

## Verification record

- Frontend: 8 focused files / 30 tests passed.
- Backend: `agency-portal.e2e-spec.ts` 32/32 and
  `commercial-overhaul.e2e-spec.ts` 7/7 passed.
- Frontend and backend production builds passed.
- Frontend oxlint and targeted backend ESLint passed (repository-wide frontend
  warnings remain pre-existing and non-failing).
