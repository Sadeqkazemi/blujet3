# Flight status control alignment

## Acceptance criteria

- [x] The flight-number and date controls use the same 56px height in flight-number mode.
- [x] The date control is presented as a single-line field with its label above it, matching the approved flight-status reference.
- [x] The Jalali calendar remains usable and continues to return the selected ISO date.
- [x] The route-mode origin, destination, date, and search controls remain aligned.
- [x] The focused/interactive field styling remains consistent with the existing public-site design.
- [x] Focused frontend tests, lint, and production build pass.
- [x] Flight-number text is visually right-aligned while preserving the left-to-right order of codes such as `BJ-410`.

## Verification

- `npm.cmd test -- --run`: 527 tests passed.
- `npm.cmd run lint`: completed with only pre-existing warnings outside this change.
- `npm.cmd run build`: production build passed.
- Browser measurement: flight-number and date controls both rendered at 56px with identical vertical bounds, 12px corner radius, and `#fafbfd` background.
- Flight-number alignment regression: the field keeps `direction: ltr` and applies `text-align: right`.

## Scope

Visual alignment only. No API, database, OTP, payment, or mock-data behavior changes.
