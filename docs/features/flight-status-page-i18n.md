# Feature: وضعیت پرواز real i18n

Twenty-third page-set of the arc. `FlightStatusPage.tsx` is the real
flight-status lookup page (by flight number or route+date), backed by
`GET /flight-status` (Phase 22) — standalone and unrelated to the
excluded checkout/payment flow.

Most labels reuse `design-reference-v2/وضعیت پرواز.dc.html`'s own
`isEN`/`isAR` vocabulary for this exact page: `heroTitle`,
`flightNoLabel`, `dateLabel`, `searchLabel`, `notFoundTitle`/
`notFoundMsg` (fa text matches ours verbatim), `aircraftLabel`,
`delayAlertSub`, `manageBookingTitle`/`manageBookingSub`,
`support24Title`/`support24Sub`. Origin/destination field labels reuse
the `lblOrigin`/`lblDestination` ("From"/"To", "من"/"إلى") convention
already established in `HomeSearchPage.tsx` (Phase 42) rather than a
literal "Origin"/"Destination" translation. Fields with no design
counterpart (the mode-toggle "Origin & Destination" label, the
"(coming soon)" delay-notification suffix, loading/searching/error
fallback text) are hand-translated.

Airport city names reuse the same `CITY_NAMES` map/fallback-to-`cityFa`
pattern established in `HomeSearchPage.tsx`, duplicated locally per this
arc's established convention of page-local maps.

The flight-status pill required special handling: the backend's
`DEPARTED` status enum value maps to two different Persian strings
(`'فرود آمد'` "landed" or `'در حال پرواز'` "in flight") depending on
arrival time (see
`backend/src/modules/flight-status/flight-status.service.ts`), so a
simple 3-way `Record<status, Tr>` map isn't enough. Instead, a
`STATUS_LABEL_TR: Record<string, Tr>` is keyed by the exact fa string the
backend returns (`'برنامه‌ریزی‌شده'`, `'لغو شد'`, `'فرود آمد'`, `'در حال
پرواز'`), with the fa string itself as the identity fallback — this
guarantees byte-identical fa output while allowing en/ar lookup.

## Acceptance checklist

- [x] Hero title/subtitle, mode toggle, field labels, search
      button/busy state render in fa/en/ar — pre-existing 5 fa tests pass
      unmodified + `FlightStatusPage.test.tsx` › "renders translated
      heading, labels, and a translated status pill in English"
- [x] Not-found title/message render in fa/en/ar — same English test +
      `FlightStatusPage.test.tsx` › "renders translated heading and
      not-found message in Arabic"
- [x] The result card (status pill, city names, aircraft label,
      delay-alert/manage-booking/support-24 cards) renders in fa/en/ar —
      same English test
- [x] The status pill correctly translates all 4 possible backend
      strings (scheduled/cancelled/landed/in-flight), not just the 3-way
      status enum — same English test (asserts `'Scheduled'` from the
      `'برنامه‌ریزی‌شده'` fa string)
- [x] All 5 pre-existing tests pass unmodified — byte-critical fa string
      `'برنامه‌ریزی‌شده'` on the status pill stays byte-identical —
      `FlightStatusPage.test.tsx` (all 5 original tests, unchanged)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
