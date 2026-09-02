# Public search airport and cabin scope

## Acceptance checklist

- [x] Domestic search lists only airports located in Iran.
- [x] International search lists foreign airports plus approved Iranian international airports, and excludes Iranian domestic-only airports.
- [x] Public airport pickers hide test and experimental city records.
- [x] Airports added from the reference catalog persist their Iran/foreign classification.
- [x] Manually added airports require an explicit Iran/foreign classification.
- [x] Existing foreign airport records are corrected by a data migration.
- [x] The results-page edit-search modal keeps the original domestic/international scope.
- [x] The results-page edit-search cabin selector is populated from `GET /search/cabins`, including First when active, instead of a hard-coded list.
- [x] Automated regression tests cover classification persistence, airport filtering, and dynamic cabin options.
- [x] The public search flow is verified in the local browser.

## API contract

- `POST /flights/airports` accepts `isInternational` where `true` means the airport is outside Iran (the existing persisted convention).
- `GET /search/airports` returns that classification to public search clients.
- `GET /search/cabins` remains the source of available public cabin classes.
