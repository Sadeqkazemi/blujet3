# Price-calendar adjacent-day browsing

## Acceptance checklist

- [x] In Persian/Arabic RTL calendars, the physical left arrow browses the window one day forward.
- [x] The physical right arrow in RTL calendars browses the window one day backward.
- [x] In English LTR calendars, physical-left browses backward and physical-right browses forward.
- [x] Arrow browsing never changes the passenger's selected travel date or reruns the flight search.
- [x] The passenger's selected date remains blue while it is visible in the browsed window.
- [x] Clicking a day card, rather than an arrow, changes the travel date and reruns the search.
- [x] Repeated one-day browsing requests API-backed windows without disabling either direction.
- [x] The existing day strip and blue selected card stay visible while the
  adjacent API window is loading; the whole calendar never flashes away.
- [x] The refreshed cards enter smoothly from the physical side of the arrow
  that was clicked, with reduced-motion support.
- [x] Rapid clicks remain one day per click and stale slower API responses
  cannot overwrite the newest visible window.

## Regression coverage

- `frontend/src/features/public-site/components/FlightPriceCalendar.test.tsx`
- `frontend/src/features/public-site/ResultsPage.test.tsx`

## Local verification

- Focused calendar and results tests cover Persian/Arabic RTL parity, English
  LTR inversion, one-day window steps, persistent blue selection, unlimited
  API window browsing, and the separation between arrow browsing and direct
  date selection. Additional deferred-response coverage verifies stable
  loading and out-of-order response protection.
- This change remains local until the user explicitly approves commit/push.
