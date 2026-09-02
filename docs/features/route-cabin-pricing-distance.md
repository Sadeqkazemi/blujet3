# Route cabin pricing, standard fare class, and smart distance

## Scope

- The seasonal route form records one positive base price for every enabled
  cabin instead of relying only on one flight-wide price.
- Every aircraft cabin owns one standard default fare-class code. Defaults are
  `F` for FIRST, `C` for BUSINESS, `W` for COMFORT, and `Y` for ECONOMY; the
  operator may explicitly change the code while defining the aircraft.
- The route form can request an advisory AI distance for the selected origin
  and destination. The result is shown with its source and must be accepted by
  the operator; manual distance entry remains available when AI is unavailable.

## Acceptance checklist

- [x] Aircraft create/update persists and returns `defaultClassCode` for each
  configured cabin and rejects duplicate or malformed class codes.
- [x] Existing aircraft cabins are migration-backfilled with their standard
  code without changing capacity or seat layout.
- [x] The current route form requires `basePriceIrr` on every enabled cabin;
  the backend validates it against the legal ceiling while accepting legacy
  clients by falling back to the route-wide agency price.
- [x] Materialized flight occurrences receive one initial fare rule per cabin
  using the aircraft's default class code and that cabin's base price.
- [x] The route and seasonal template keep `distanceKm` and `distanceSource`;
  a missing AI provider never blocks manual route creation.
- [x] The distance-suggestion endpoint returns only a validated advisory result
  and never persists it by itself.
- [x] The route form displays cabin price inputs, standard class codes, and a
  clear smart-distance/manual fallback state in Persian RTL.
- [x] Backend and frontend regression tests cover validation, persistence,
  inheritance into fare rules, provider failure, and form payload mapping.
