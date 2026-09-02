# Currency display policy

## Contract

All persisted and API money values remain integer IRR decimal strings. Currency
conversion is presentation-only and must never change ledger arithmetic,
invoices or exported report values.

- Public website and customer-account surfaces display IRR values as toman
  (`rial / 10`) with a visible toman unit.
- Finance-manager dashboard, finance operations, financial reports and invoice
  views display the original amount in rial with a visible rial unit.
- The staff-side agency finance tab follows the finance-manager policy,
  including invoice issuance, settlement, credit limits and financial history.
- Every agency-portal price, credit, invoice, sale and statement value displays
  the original amount in rial. Agency-entered credit-limit values are entered
  and submitted as rial, without a toman multiplication.
- Finance CSV, Excel and PDF exports remain IRR and require no conversion.

## Acceptance

- [x] `fa-format.test.ts` proves toman and rial formatters use distinct semantics.
- [x] `FinanceDashboardPage.test.tsx` proves finance dashboard values are rial.
- [x] `FinancePage.test.tsx` proves finance operations are rial.
- [x] `FinanceReportsPage.test.tsx` proves report summaries are rial.
- [x] `AgencyDetailPage.test.tsx` proves finance invoice display and IRR input semantics.
- [x] Agency dashboard, sales and credit tests prove agency values and inputs are rial.
- [x] The complete 976-test frontend suite remains green, including public-site
  money tests that continue to prove toman display.
- [x] Owner approved commit/push/review/merge on 2026-09-02; deployment remains
  explicitly deferred.
