# Management panel access, flight history, and sales intelligence

## Scope

This change hardens senior-manager panel access, separates CEO pricing work
from the generic cartable, expands the commercial flight lifecycle view, and
improves the aircraft and loyalty-tier interfaces. AI output remains advisory:
only an authorized commercial manager can apply a price change.

## Acceptance checklist

- [x] CEO and senior manager access controls include the Operations Manager panel.
- [x] Disabling a panel revokes active refresh-token sessions for that role.
- [x] A disabled panel returns `403 ACCESS_REVOKED` and every protected panel route
      is replaced by a full-page navy access-denied notice.
- [x] Persian and mixed management-panel numerals use a glyph-complete font.
- [x] The aircraft catalogue has a responsive summary-and-card layout using only
      API data, with loading, error, and empty states.
- [x] CEO pricing items are displayed only in Ticket Pricing, never in Cartable.
- [x] Registered CEO pricing items remain visible for three days, then disappear
      from that screen without deleting pricing or audit history.
- [x] Commercial Flight Management contains an Active Flight History tab only for
      non-completed flights.
- [x] Clicking a completed flight opens its complete lifecycle: flight data,
      prices, manager reviews, commercial price changes, and audit events.
- [x] Weak-sale alerts show persisted advisory AI price suggestions when available,
      degrade safely when the ML provider is unavailable, and never change a fare
      automatically.
- [x] Commercial panel entry automatically requests a refreshed advisory analysis
      when a weak-sale flight has no current suggestion.
- [x] Loyalty tier thresholds and the tier preview are redesigned responsively and
      remain backed by the existing club-rules API.
- [x] Backend unit tests, frontend component tests, lint/type checks, production
      builds, and targeted browser verification pass.
- [x] Changes are committed and pushed to a review branch only; no production/UAT
      deployment is triggered by this task.

## Data and retention rules

- `PanelAccessFlag` remains the source of truth for panel availability.
- Existing `RefreshToken.revokedAt` records are updated when access is disabled;
  no user or audit record is deleted.
- `FarePricingProposal.approvedAt` defines the three-day CEO-screen visibility
  window for registered records. The proposal and audit records are retained.
- `FlightInstance.aiSuggestion` / `FarePricingProposal.aiSuggestion` store only
  advisory provider output and generation metadata.
- Flight lifecycle details are assembled from existing flight, review, pricing,
  and audit records; no duplicate history table or synthetic data is introduced.
