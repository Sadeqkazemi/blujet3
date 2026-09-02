# Wallet purchase accounting and flight channel release

## Scope

This change closes two operational gaps:

1. A ticket paid from a customer or agency wallet must debit the wallet and
   create the related financial sale entry as one atomic operation, and the
   new balance/ledger must be visible immediately.
2. Commercial staff must be able to build several fare programs inside each
   cabin. Site and agency ceilings are configured independently in separate
   panels and prices, while both consume one live reservation inventory. The
   creation price remains visible as a reference.

## Acceptance checklist

### Wallet purchase

- [x] `POST /bookings/:id/pay` with `paymentMethod=WALLET` either completes all
      of wallet debit, ticket issuance and `LedgerEntry(type=SALE)`, or commits
      none of them.
- [x] The wallet debit is linked to the booking and equals the final charged
      amount after any accepted promotion.
- [x] A replay/concurrent payment cannot debit the same wallet twice or spend
      beyond its committed balance.
- [x] The successful payment response exposes the committed wallet balance so
      the persistent header can update without showing stale credit.
- [x] `GET /my/wallet` returns the current ledger-derived balance and the real
      wallet-entry history (newest first); the account wallet tab renders it.
- [x] Finance recent transactions contains the corresponding booking sale and
      no fabricated row is introduced.
- [x] An end-to-end database test proves the balance delta, wallet entry,
      finance ledger entry, ticket status and idempotent replay.
- [x] The owner-approved UAT deployment performs a one-time, backed-up,
      audited reconciliation of the exact `uat.customer` and `uat.agency`
      ledger-derived wallet balances to 100,000,000 toman without adding a
      mutable balance column.

### Site/agency channel release

- [x] The fare-class card visibly shows the creation/base price.
- [x] A commercial manager can add more than one fare program (fare-class
      bucket) to the same cabin, each with its own capacity and validity window.
- [x] Site and agency price fields default to their saved channel price, or to
      the creation/base price when a channel-specific price has not been saved.
- [x] Site availability consumes only the site's released seats and site
      price; agency availability consumes only the agency pool and agency price.
- [x] Each channel retains its own ceiling and price; a sale/hold/allotment in
      either channel reduces the effective availability of both through the
      shared reservation inventory.
- [x] Agency release and site release are rendered in different cards and use
      different save actions. Either channel may be opened or closed alone.
- [x] A new fare program starts with both channels closed; each is explicitly
      opened by its own save action.
- [x] Each channel save is atomic and preserves the other channel's committed
      capacity and price.
- [x] Each channel ceiling cannot exceed fare-class capacity or fall below its
      sold/committed seats. The two ceilings may overlap because live shared
      inventory, not their sum, prevents overselling.
- [x] A price-change reason is required when the effective site price changes;
      price history and audit trail remain intact.
- [x] The form shows a busy state, a clear success/error result, then reloads
      the committed values.
- [x] Every sold fare is preserved in immutable booking/passenger snapshots
      and exposed to Commercial Management as a channel/rate sales history.
- [x] Backend and frontend regression tests cover base-price fallback,
      independent channel actions, and shared-inventory exhaustion.

## Out of scope

- Payment-gateway settlement and external bank accounting.
- Changing an already ticketed booking's payment method.
- Creating mutable wallet-balance columns; wallet balance remains the sum of
  immutable wallet entries.
