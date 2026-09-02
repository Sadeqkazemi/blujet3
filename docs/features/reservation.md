# Feature: Reservation system — seat lock & PNR management (Phase 9)

Covers `docs/API.md` → "Phase 9" and `docs/DB_SCHEMA.md` → "Phase 9".
Scope: the shared `ReservationSystem` component's PNR management, seat
map + managerial seat lock, staff-side manual PNR issuance, and search —
embedded in CEO (nav label هواپیما), BOARD_CHAIR (هواپیما), SENIOR_MANAGER,
and IT_MANAGER panels. Agency API access (Phase 3 already covers it) and
flight/schedule creation (Phase 10) stay out of the reservation module's
write path; the «پروازها» sub-tab is a read-only upcoming-instance list
that opens the seat map.

## Acceptance checklist

Backend items proven by `backend/test/reservation.e2e-spec.ts` (13 tests,
128 total); frontend by `frontend/src/features/reservation/*.test.tsx` (3
tests, 59 total); E2E by `frontend/e2e/reservation-journey.spec.ts` (4
journeys, run against a fresh `POST /reservation/_test/flight-instance`
instance per journey — non-production-only, same pattern as
club/pricing's own `_test` seeding hooks — so results never depend on the
seed's ambiguous historical/demo instances).

### Seat map & locking
- [x] `GET /reservation/seatmap/:flightInstanceId` computed from `AircraftSeatMap` + sold `Passenger.seatCode` + active `SeatLock`s; correct row/column layout — `'GET /reservation/seatmap/:id computes rows from AircraftSeatMap with correct capacity'`
- [x] `POST /reservation/seatmap/:id/lock`: canSeatLock roles (`CEO`/`BOARD_CHAIR`/`SENIOR_MANAGER`/`COMMERCIAL_MANAGER`; 403 for IT_MANAGER); 409 on already-sold/-locked seat; PII encrypted+hashed, never returned in plaintext; audited (RESERVATION) — `'POST lock: canLock roles only, 409 on already-locked, encrypted PII never returned, audited'` (includes IT → 403)
- [x] Concurrent lock attempts on the same seat: exactly one succeeds (DB partial-unique-index enforced) — `'concurrent lock attempts on the same seat: exactly one succeeds (DB-enforced)'` (5 parallel requests, 1×201/4×409)
- [x] `PATCH /reservation/seatmap/locks/:id/release`: canSeatLock only; 409 on already-released; seat relockable after release — `'PATCH release: canLock only, 409 on already-released, seat becomes lockable again'`
- [x] `GET /reservation/seatmap/:id` includes sold-seat passenger `{ fullName, pnr, nationalId, bookingStatus, priceIrr }` for staff panels — `'GET /reservation/seatmap/:id includes sold-seat passenger details for staff'`

### PNR management
- [x] `GET /reservation/pnr` grouped-by-flight, `q=` filters PNR/passenger name — `'GET /reservation/pnr lists grouped by flight and q= filters by PNR/passenger'`
- [x] `GET /reservation/pnr/:pnr` full detail; 404 for unknown PNR — `'GET /reservation/pnr/:pnr returns detail; unknown PNR -> 404'`
- [x] `PATCH /reservation/pnr/:pnr/seat`: canLock only; 409 on taken seat; 409 on CANCELLED booking; audited — `'PATCH /reservation/pnr/:pnr/seat changes seat; 409 on a taken seat and on a CANCELLED booking'`
- [x] `PATCH /reservation/pnr/:pnr/cancel`: canLock only; frees the seat for resale; 409 if already CANCELLED — `'PATCH /reservation/pnr/:pnr/cancel frees the seat for resale; 409 if already cancelled'`

### Search & manual issuance
- [x] `GET /reservation/search`: origin/dest/date → SCHEDULED instances + computed price + free-seat count — `'GET /reservation/search finds SCHEDULED instances on origin/dest/date with computed price + free seats'`
- [x] `POST /reservation/pnr` (manual issuance): canLock only; TICKETED Booking+Passenger+LedgerEntry(SALE), no payment step; 409 on unavailable seat; audited — `'POST /reservation/pnr issues a TICKETED booking directly (no payment step), 409 on unavailable seat, audited'`
- [x] `GET /reservation/dashboard-stats` real counts, no fabricated fields — `'GET /reservation/dashboard-stats returns real counts, no fabricated fields'`

### Role isolation
- [x] FINANCE_MANAGER 403 on every endpoint — finance isolation assertions in `backend/test/reservation.e2e-spec.ts`; commercial may read the seat map via `RESERVATION_ROLES`, while finance remains excluded
- [x] SENIOR_MANAGER: seat lock + PNR writes succeed — `'SENIOR_MANAGER can lock seats and manage PNRs (same canLock as CEO)'`

### Frontend (design-reference-v2 `ReservationSystem` shell)
- [x] Four sub-tabs: داشبورد / مدیریت رزروها / دسترسی آژانس‌ها / پروازها — `ReservationPage.test.tsx` + `reservation-journey.spec.ts`
- [x] Dashboard KPIs + channel mix + dependent service health (real toggles/latencies) — `'renders the design four-tab shell and dashboard KPIs/services/channels'`
- [x] PNR search (PNR + last name) + recent table + detail modal (change/cancel/no-show for canLock) — `'PNR tab lists recent bookings…'` / no-show tests
- [x] Agency API access list or empty state — `'agency tab shows empty state…'` / `'agency tab lists agencies…'`
- [x] Flights occupancy table — `'flights tab renders occupancy rows or empty state'`
- [x] Flights tab: click a flight → seat-map popup; sold seat shows reserver name; IT cannot lock — `FlightSeatMapModal.test.tsx` + `'clicking a flight opens the seat-map popup (IT cannot lock)'`
- [x] SENIOR_MANAGER can change seat / cancel in detail modal — `'SENIOR_MANAGER can change seat and cancel in the detail modal'`
- [x] `PANEL_NAV.SENIOR_MANAGER` includes سامانه رزرواسیون — `panels.e2e-spec.ts`
- [x] Role isolation: FINANCE_MANAGER have no reservation nav entry — E2E

### E2E
- [x] IT Manager sees the four-tab shell — `'IT Manager sees the design four-tab reservation shell'`
- [x] IT Manager finds an API-issued PNR and cancels it in مدیریت رزروها — `'IT Manager finds an issued PNR in مدیریت رزروها and cancels it'`
- [x] BOARD_CHAIR opens PNR detail with change/cancel — `'BOARD_CHAIR can open PNR detail with change/cancel controls'`
- [x] SENIOR_MANAGER can lock/manage (nav + canLock) — `'SENIOR_MANAGER can lock seats and manage PNRs (same canLock as CEO)'`
- [x] Non-reservation role has no reservation nav entry — `'Non-reservation role has no reservation nav entry (role isolation)'`

### Phase 30 — data-driven seat-map aisle gap
- [x] `GET /reservation/seatmap/:id` returns `cabinLayout.{BUSINESS,ECONOMY}.aisleAfterIndex`, computed from that flight's real `AircraftSeatMap.{business,economy}ColsLeft.length` (via `resolveAircraftType`, so an aircraft-type override is respected) instead of the frontend assuming a fixed seat position — proven against both the seeded 2-2/2-3 config AND a distinct custom aircraft type with a reversed 3-2 economy split, so the test can't pass by coincidence — `backend/test/reservation.e2e-spec.ts: 'GET /reservation/seatmap/:id returns cabinLayout.aisleAfterIndex reflecting the real per-aircraft column split, not a fixed assumption'`
- [x] Seat-map aisle gap rendering lived in the Phase 9 operational UI; v2 shell no longer embeds the seat grid (APIs still return `cabinLayout.aisleAfterIndex` for any future consumer)

### Phase 36 — عدم حضور مسافر (mark no-show)

`PATCH /reservation/pnr/:pnr/no-show` (Phase 13 Part E, `CAN_LOCK_ROLES`)
shipped fully implemented and e2e-tested but had no frontend control —
found via the same endpoint-vs-frontend-caller audit as Phase 35's
reconciliation-queue gap. No design-reference screen mentions «عدم
حضور»/no-show at all (see `docs/DB_SCHEMA.md`'s Phase 13 Part E note —
there's no boarding/check-in concept in the design to attach a control
to), so this is a small, natural addition to the already-built PNR-detail
modal (next to the existing «تغییر صندلی»/«لغو رزرو» actions) rather than
a new screen.

- [x] The PNR detail modal shows a «ثبت عدم حضور مسافر» button for a
      `canLock` role when the booking is `TICKETED` or `FLOWN`, calling
      the existing endpoint and refreshing the detail + list on success —
      `ReservationPage.test.tsx: 'a canLock role can mark a TICKETED
      booking as no-show, and the detail refreshes'`
- [x] The button is not offered for a `CANCELLED` booking (the backend's
      own 409 `CONFLICT` guard is not relied on to hide it) —
      `ReservationPage.test.tsx: 'no-show is not offered for a CANCELLED
      booking'`
- [x] `FLOWN`/`NO_SHOW` added to the frontend's `BookingStatus` type and
      status-badge map (`فروخته → پرواز شده`/`عدم حضور`) — same tests

### Deferred (scoped out with reasons, not silently dropped)
- Ticket print/PDF generation — no «چاپ بلیط» button wired this phase; a real PDF pipeline needs the public-site track's e-ticket template.
- Flight/schedule/capacity **creation** UI («+ تعریف پرواز جدید») — Phase 10 `/flights/*`; the reservation shell lists SCHEDULED occupancy and opens a view-only seat-map popup (no create-flight control in this tab).
- Operational «رزرو جدید» chrome from Phase 9 — superseded by v2 tabs; seatmap/issue APIs remain (seat map is now the پروازها popup, view-only for IT).
- Managerial seat-lock request/approval queue (`PATCH
  /reservation/seatmap/locks/:id/approve`/`reject`, `POST
  /reservation/pnr/from-lock/:lockId`) — still deliberately backend-only;
  `docs/API.md`'s Phase 13 Part D note already documents "no design
  screen exists for a request/approval queue," and building one now would
  mean inventing a multi-step approval UI with no reference to build it
  against — a larger, real product-design task, not a small wiring job
  like this phase's no-show button.
