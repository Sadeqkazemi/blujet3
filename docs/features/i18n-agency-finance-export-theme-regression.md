# Language, agency finance, workbook and contrast regression

## User-approved scope

- English and Arabic remain selectable for public, customer and agency surfaces.
- An agency purchasing a public seat for a customer remains in the public inventory pool, but is attributed to the agency in finance and exports.
- Every paid agency customer booking creates one paid sale invoice and one agency-linked SALE ledger entry, without duplicates on an idempotent retry.
- Historical paid agency bookings are backfilled into the agency finance projections.
- Excel exports open as valid OOXML workbooks without a repair prompt.
- The reserved UAT customer and agency wallets are reconciled to exactly 100,000,000 toman in a new guarded deployment run.
- Light management surfaces and calendars use dark primary copy and readable muted copy; dark surfaces keep light primary copy.

## Acceptance checklist

- [x] Agency header exposes keyboard-accessible Persian, English and Arabic controls on desktop and mobile.
- [x] Selecting English sets LTR; selecting Arabic sets RTL; the authenticated preference is persisted.
- [x] Finance agency summaries include every paid booking with `agencyId`, including public-inventory purchases.
- [x] Detailed finance filters and exports report those rows as agency sales.
- [x] A paid agency customer purchase appears in the agency paid-invoice tab and financial timeline.
- [x] Existing agency sale ledgers missing `agencyId` and paid bookings missing sale invoices are reconciled by migration.
- [x] Generated Excel packages pass a real workbook load and preserve all eight report sheets.
- [x] UAT wallet reconciliation is guarded, audited, backed up and targets 1,000,000,000 IRR for both reserved accounts.
- [x] Light panel cards, pricing/cartable copy and the date picker meet readable foreground/background contrast.
- [x] Focused backend/frontend regression tests, builds and migration checks pass.
