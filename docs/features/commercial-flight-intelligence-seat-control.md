# Commercial flight intelligence and seat control

## Acceptance checklist

- [x] Creating a flight asks the internal ML pricing provider for an advisory suggestion; ML failure never blocks flight creation and never changes the published fare automatically.
- [x] Active flights with weak sales are identified from real sold-seat/capacity data and warn managers; the persisted suggestion is visible to the Commercial Manager.
- [x] Only CEO-approved/sellable flight instances appear in Commercial Manager active/future inventory. Each active row carries a server-computed `salesHealth` decision and opens one modal with `جزئیات پرواز` and `نقشه صندلی` tabs.
- [x] Opening an active flight shows real flight metrics and allows only `COMMERCIAL_MANAGER` to publish a new sale price with a required reason. The server enforces publication state/legal ceiling, audits old/new values, and invalidates public search/API caches.
- [x] The flight detail exposes the database-backed MD-80 seat map. Sold seats reveal their real passenger/PNR data to authorized viewers.
- [x] Manual managerial seat locking is allowed only for `CEO`, `BOARD_CHAIR`, and `COMMERCIAL_MANAGER`; `IT_MANAGER` is read-only and receives 403 on every lock/release/approve route.
- [x] An authorized manager can lock a seat for an agency, for a passenger with optional identity details, or anonymously. Agency targets are real `AgencyProfile` rows.
- [x] Seat availability is derived from aircraft capacity, paid/ticketed passengers, active managerial locks, and active public booking holds; it is never a frontend counter. `HELD`, `SOLD`, `LOCKED`, and company `BLOCKED` inventory remain visually and contractually distinct.
- [x] Public checkout holds inventory for exactly 15 minutes. Payment confirms/tickets the order; timeout or unsuccessful completion expires it and releases inventory.
- [x] Successful sales/payments remain represented by immutable `LedgerEntry` rows and therefore appear in finance reports and accounting integrations.
- [x] On desktop the trust badges are placed in a distinct left-side footer row with a small inward offset and no separator above the badges; mobile stacking stays unchanged. WhatsApp uses the canonical logo path.
- [x] Every site/agency fare-class card shows real class capacity, released seats, channel sold seats, sellable seats, and publication status from `commercial-control`.
- [x] Fare classes are collapsible per channel; a successful explicit confirmation saves/publishes through the real endpoint and collapses only that class card.
- [x] Per-class price assistance considers capacity/occupancy, time to departure, current/base price and competitor price; ML output is preferred and a clearly labelled analytical fallback is used when ML is unavailable.
- [x] Applying a suggestion only fills the new-rate input. A manager/authorized commercial employee must separately confirm before any fare or inventory is persisted.
- [x] Site and agency master activation switches call their independent backend commands and accurately show active/inactive status.
- [x] The shared staff management shell uses the light management-panel token palette; panel data and RBAC behavior remain unchanged.

## Safety rules

- AI output is advisory only. It cannot bypass the existing Commercial Manager price endpoint or CEO/legal pricing workflow.
- Seat-map geometry comes only from `AircraftSeatMap` in PostgreSQL.
- Passenger identity fields remain encrypted/hashed; agency locks store only the agency account foreign key.
- A managerial lock is not a sale. It creates no booking, ticket, or ledger entry until finalized through the existing governed flow.
- AI/analytical suggestions are never published automatically and never bypass re-pricing before payment.

## Verification map (2026-08-30 extension)

- Frontend behavior: `CommercialFareClassControls.test.tsx`.
- Backend contract/auth/advisory-only behavior: `backend/test/flights.e2e-spec.ts`.
- Runtime visual/interaction check: local `/panel/flights` with the Commercial Manager sandbox account.
