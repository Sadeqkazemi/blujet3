# Commercial Manager screenshot gap sync (2026-08-21)

Source of truth: the 13 user-supplied screenshots for the
`COMMERCIAL_MANAGER` panel. Existing correct behavior stays in place. Sample
names and numbers visible in the prototype are visual examples only and must
never be copied into production data.

## Acceptance checklist

### Shared shell and navigation

- [x] The sidebar follows the approved order, shows exactly one «خدمات»
  entry, and retains «تعریف هواپیما» for the Commercial Manager per the final
  product decision.
- [x] Existing server-side role checks and the real pages behind every retained
  navigation item remain unchanged.

### Dashboard

- [x] The dashboard header contains the panel search and notification controls.
- [x] The three real KPI cards and the single low-sales warning are followed
  directly by the financial summary and cartable, matching screenshot 1.
- [x] No extra sales chart or secondary request/debtor panels are inserted into
  this dashboard composition; those workflows remain reachable from their own
  pages and cartable.
- [x] A zero financial total renders as zero, never as a fabricated non-zero
  fallback.

### Agencies

- [x] The page title/subtitle, three main tabs, search field and partner rows
  match screenshot 2 without changing cooperation/debtor workflows.
- [x] Every partner row shows current-month ticket count and sales from
  `GET /agencies`, plus ledger-derived current debt and the real account state.
- [x] Seat and web-service queues keep their existing real workflows but do not
  interrupt the approved partner-list composition.
- [x] Commercial agency detail keeps the approved overview/finance/messages/
  history tabs; the overview includes the real credit card shown in screenshot
  3, and finance/messages/history keep their existing API-backed behavior.

### Flight routes and flights

- [x] The routes page initially shows the guidance, add button, active/history
  tabs and honest empty/list state; the creation form opens only after
  «افزودن مسیر جدید» is selected.
- [x] Route creation continues to use the existing real preview/create APIs,
  aircraft capacity, Jalali dates, IRR prices and idempotency guard.
- [x] The commercial flight detail keeps its real visibility, channel, fare
  class, agency-release and price-history controls, with agency fare-class
  release displayed before public-site fare-class pricing as in screenshots
  11–13.

### Quality and safety

- [x] Frontend regression tests cover navigation normalization, dashboard
  composition, agency monthly metrics, credit overview, route-form disclosure
  and flight-detail section order.
- [x] Backend contract coverage proves current-month agency fields are typed
  and returned from database aggregates.
- [x] Frontend/backend typecheck and the focused test suites pass.

Verification: 65 focused frontend tests and 23 backend E2E tests passed;
frontend and backend production builds completed; focused frontend lint has no
errors (four existing `set-state-in-effect` warnings remain); `git diff
--check` is clean.

## API delta

`GET /agencies` adds two read-only fields to each agency row:

- `monthlyTicketsSold: number` — passengers/tickets on paid or ticketed agency
  bookings created in the current server month.
- `monthlySalesIrr: string` — current-month immutable `SALE` ledger entries
  linked to real bookings, serialized as an IRR decimal string.

No table, migration, new balance column or mock fallback is introduced.
