# Public flight selection and localization

## Acceptance checklist

- [x] Public flight search sends the selected cabin and date to the API; a result is returned only when that exact cabin is published and has enough available seats.
- [x] `FIRST`, `BUSINESS`, `COMFORT`, and `ECONOMY` remain unchanged from search through results, checkout, payment, booking, invoice, and issued ticket.
- [x] A result card cannot silently fall back to another cabin or let the passenger switch to a cabin that was not searched.
- [x] The displayed total uses the real fare of the selected cabin and the complete passenger mix; cabin fares are never presented as interchangeable defaults.
- [x] The destination picker excludes the selected origin and the origin picker excludes the selected destination.
- [x] Imam Khomeini International Airport (`IKA`) is available in the airport reference data.
- [x] Route direction is origin-to-destination: origin is physically right in Persian/Arabic and left in English; arrows point toward the destination in results, details, checkout, and issued tickets.
- [x] Public ancillary services contain Persian, Arabic, and English title/description fields; checkout renders the active locale and never falls back to Persian in Arabic/English.
- [x] Only explicitly selected ancillary services and selected paid seat types are included in totals, booking payloads, invoices, and payment review.
- [x] English pages contain no Persian text/digits in the affected flow; Arabic pages contain Arabic translations rather than Persian strings.
- [x] Regression tests cover exact-cabin filtering, `FIRST` parsing, route direction in all locales, localized ancillary labels, and exclusion of unselected extras.

## Verification

- Backend unit suite: 87 suites / 328 tests passed.
- Frontend unit and component suite: 178 files / 934 tests passed.
- Backend and frontend production builds passed.
- The repository-wide backend lint remains blocked by pre-existing CRLF/Prettier violations outside this change; changed TypeScript files pass ESLint with the line-ending-only rule disabled.
