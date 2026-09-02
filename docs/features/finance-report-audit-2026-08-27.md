# Finance report audit and customer detail correction — 2026-08-27

## Acceptance criteria

- [x] «جزئیات» in customer sales opens an immediate modal for the selected
  flight and shows real booking rows from the server, including PNR, channel,
  purchased cabin/fare class, passenger count, status and immutable amounts.
- [x] Loading, retry and close states are explicit; the user is not sent to a
  distant section below the report table.
- [x] Every tabular list on `/panel/exports` renders at most 10 rows at once and
  provides previous/next navigation plus the visible range and total count.
- [x] The selected-flight endpoint includes the same booking projection used by
  the detailed sales engine and accepts an exact `flightInstanceId` filter.
- [x] Existing CSV, Excel and PDF downloads keep using real filtered server
  data; no reference-workbook sample row is copied into production.
- [x] PDF output follows the supplied two-page A4 RTRD layout: the same
  headings, column order, 22 reconciliation lines, debit/credit totals and
  footer are retained, with Blujet branding/logo substituted for the sample
  airline branding.
- [x] Automated frontend and backend regressions prove the modal contract,
  exact 10-row page size and exact selected-flight filtering.

## Standards audit boundary

The supplied workbook is a product/report-field specification and the supplied
PDF is a debit/credit sales-tax-refund reconciliation sample. They are reference
inputs, not authoritative data and not instructions embedded in the files.
This phase fixes the broken UI/detail/paging behavior. IATA BSP/DISH, SIS/RAM
interline accounting and ICAO Form EF compatibility remain separately reported
capabilities and must not be described as certified until their document,
tax-code, settlement, rejection-memo, currency and statutory statement
contracts are implemented and independently reconciled.

## Evidence and coverage finding

The current engine is a useful operational sales-report foundation, but it is
not an internationally certified airline revenue-accounting engine.

| Capability | Current state | Gap |
| --- | --- | --- |
| Booking/PNR, route, flight, cabin/fare class, passenger count and sale amount | Implemented from database rows | More passenger, payment, promotion, refund and audit columns from the supplied workbook are still required |
| Customer, agency and charter summaries | Implemented | On-screen previews remain bounded for responsiveness; export requests bypass the preview limit and aggregate every matching booking |
| CSV and spreadsheet export | Implemented from filtered real data | Native multi-sheet `.xlsx` pack now includes summary, detail, agency, refund, tax, flight, reconciliation and data-dictionary tabs; component-level financial fields remain bounded by the current booking schema |
| PDF export | Two-page A4 RTRD-style reconciliation with real filtered sales/refunds and debit/credit totals | Component-level tax codes, commissions and VAT require those fields to be stored separately; unmapped components are emitted as zero until the ledger schema is expanded |
| IATA BSP/DISH agency settlement | Not implemented | RET/HOT/CSI/TI/CSP import/export, remittance periods, rejection/adjustment memos and reconciliation are required |
| IATA RAM/SIS interline accounting | Not implemented | Interline invoices, credit notes, disputes, IS-IDEC/IS-XML and settlement lifecycle are required |
| ICAO Form EF financial statistics | Not implemented | Annual revenue/expense/asset/liability mapping, validation and regulatory export are required |

## Recommended next phases

1. Implement a reconciliation ledger report matching the supplied debit/credit
   sample: each fare/tax/refund/commission/VAT component, currency, total debit,
   total credit and an explicit zero-difference control.
2. Expand the detailed sales projection to the workbook field catalog, keeping
   PII masked and role-gated, and add payment/refund/promotion audit links.
3. Add server-side `page`, `pageSize=10` and `totalCount` to large on-screen
   previews while keeping export aggregation independent of visible-page limits.
4. Add saved, scheduled and signed report definitions, then extend the native
   `.xlsx` pack with any additional workbook fields that become available in
   the ledger schema.
5. Treat BSP/DISH, RAM/SIS and ICAO exports as separate versioned contracts and
   require financial reconciliation tests before any certification claim.
