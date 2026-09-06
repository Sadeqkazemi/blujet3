# Database append-only order evidence

## Scope

Extend the PostgreSQL append-only boundary to the order lifecycle and refund
evidence tables that the architecture and schema contract already describe as
immutable. These rows are facts about a completed transition, not mutable
workflow state.

Protected tables:

- `orders.booking_lifecycle_events`
- `orders.core_itinerary_lifecycle_events`
- `orders.core_itinerary_coupon_events`

## Acceptance checklist

- [ ] A TypeORM migration installs a `BEFORE UPDATE OR DELETE` guard on all
      three order-evidence tables, reusing the shared audit trigger function.
- [ ] Trigger names are deterministic and the migration is safe to rerun.
- [ ] Trigger inventory is verified against `pg_trigger`.
- [ ] Existing append-only financial/audit guards remain installed.
- [ ] Migration `down` removes only the three new triggers; the shared
      function remains owned by the financial/audit migration.
- [ ] No ticket, refund-request, or reconciliation workflow row is locked;
      those tables intentionally transition status during processing.
- [ ] Typecheck, lint, build and the focused PostgreSQL migration regression
      pass. No public API or deployment change is included.
