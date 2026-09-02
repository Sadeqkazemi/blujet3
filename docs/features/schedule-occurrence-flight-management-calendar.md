# Feature: schedule occurrences, flight-management search and calendar drill-down

## Scope

Commercial route schedules materialize one inactive flight record for every
selected operating day. The Add Flight workflow resolves the shared flight
number, exposes every pending occurrence (including its Jalali month/day), and
lets the manager complete the intended record without creating a duplicate.
The flight-management page gains a real search toolbar and a sliding low-sales
alert. The shared date picker supports direct year, month and day selection in
management/forms while the public homepage search deliberately retains its
original month-by-month day grid. Farsi uses Jalali Persian month names;
English and Arabic use localized Gregorian month names.

## Acceptance checklist

### Schedule API and persistence

- [x] Creating a schedule materializes exactly one `FlightInstance` for every
      matching day in the selected range and weekdays.
- [x] Every materialized occurrence starts as definition `DRAFT` with
      `publicSaleEnabled=false`, so it is absent from public and agency sale
      surfaces until the existing approval/publication workflow enables it.
- [x] Resolving a flight number returns all future non-cancelled occurrences
      in date order with id, UTC departure/arrival, definition status,
      visibility and version, while retaining the next-occurrence
      compatibility fields.
- [x] Schedule preview/create remain idempotent and conflict-safe.

### Add Flight

- [x] Entering a known flight number fills the route/aircraft/cabins and shows
      the schedule's operating weekdays and Jalali month range.
- [x] Every pending daily occurrence is visible and selectable; selecting one
      updates the inherited date/time and completes that exact record.
- [x] Completed or otherwise ineligible occurrences are visibly unavailable
      and cannot be submitted again.

### Flight management

- [x] Low-sales warnings render as a single-slide carousel with previous/next
      controls, position indicator and wrap-around navigation.
- [x] Search controls filter by origin, destination, flight number and Jalali
      date without fabricating records.
- [x] Filtering applies consistently to active, future/operations, completed
      and history lists, with honest empty states.

### Shared calendar

- [x] The shared calendar header drills down from day to month to year and lets
      the user select year, month and then day directly.
- [x] Jalali remains the staff/Farsi calendar and Gregorian remains available
      where the existing locale contract requires it.
- [x] Existing min-date, price-calendar, responsive sheet and selected-day
      behaviours remain intact.

### Verification

- [x] Backend E2E covers inactive per-day materialization and resolve payload.
- [x] Frontend tests cover occurrence selection, warning slider, management
      filters and year/month/day calendar navigation.
- [x] Backend/frontend build, lint/typecheck and focused tests pass.
- [x] Local browser verification covers the homepage calendar exception,
      shared year/month/day interaction and Persian/English/Arabic month
      localization; protected Add Flight and management search/slider states
      are covered by focused React integration tests with realistic API rows.
