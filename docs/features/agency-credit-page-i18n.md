# Feature: پنل آژانس — Credit & Balance tab real i18n

Fifteenth page-set of the arc, third agency-portal page. `AgencyCreditPage.tsx`
renders real credit KPIs, an invoices table, a credit-increase request
list, a ledger, and a credit-increase request modal — all from real
`agency-portal` endpoints (no mock data).

EN strings are mostly extracted from `design-reference-v2/پنل آژانس.dc.html`'s
own rich `isEN` vocabulary for this exact tab (`creditBalanceTitle`,
`creditLimitLabel`, `payFromCreditLabel`, `recentActivityTitle`, etc.); AR
is a mix of the design's partial `isAR` coverage and hand-translation.

## Acceptance checklist

- [x] Heading, subtitle, add-credit button, all 3 credit KPIs, and the
      loading/error states render in fa/en/ar — `AgencyCreditPage.test.tsx`
      › "renders translated headings and the pay button in English" +
      "...in Arabic"
- [x] The invoices table (column headers, empty state, pay button/busy
      state, and invoice status badges) translates per locale — same two
      new tests, plus the pre-existing tests' unmodified fa assertions
- [x] The credit-increase request list and its status badges
      (Under Review/Approved/Rejected) translate per locale — implemented
- [x] The recent-activity ledger (entry-type labels, empty state)
      translates per locale — implemented
- [x] The credit-increase request modal (title, description, both field
      labels, validation error, submit fallback, submit/busy button)
      translates per locale — implemented
- [x] Both pre-existing tests pass unmodified — the byte-critical fa
      strings they assert stay byte-identical: the `'پرداخت از اعتبار'`
      button, the `'افزایش اعتبار'` button, the
      `'سقف درخواستی (تومان)'` label, and the `'ارسال درخواست'` button
      — `AgencyCreditPage.test.tsx` (original 2 tests, unchanged)

## Notes

- This page keeps its own **local** invoice-status and credit-request-status
  label maps rather than importing/translating the shared
  `frontend/src/features/agencies/agency-labels.ts` module — that module is
  used by the staff-side `AgencyDetailPage.tsx`, which stays Persian-only
  per CLAUDE.md (staff/executive panels are not locale-switchable). Adding
  locale awareness there would risk changing behavior on a surface this
  phase has no business touching.
- The toman currency word stays `'تومان'`/`'Toman'`/`'تومان'` in every
  locale, consistent with the pricing-honesty rule from earlier phases.

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. The remaining
agency-portal pages (Sales, Inbox, Profile, Seats, Webservice) remain
separate future work.
