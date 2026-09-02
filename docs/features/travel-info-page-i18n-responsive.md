# Feature: قوانین و مقررات (Terms/Travel Info) — real i18n + responsive body content

Seventh page of the per-page translation arc (after the shared shell,
صفحه اصلی, نتایج پرواز, مقاصد, باشگاه مشتریان, and پشتیبانی). Unlike every
prior page, this one needed zero hand-translation: the design bundle's
`قوانین و مقررات.dc.html` defines complete `dataFA`/`dataEN`/`dataAR`
arrays for all six sections and every bullet item, and the fa content
matched the shipped app byte-for-byte, so every string came straight from
the design source.

## Acceptance checklist

- [x] Hero (title + last-updated line), all six rule sections (title +
      bullet items), and the refund-variance warning note render in
      fa/en/ar
      — `PublicInfoPages.test.tsx` › "renders translated sections in
      English" + "renders translated sections in Arabic"
- [x] The pre-existing `TravelInfoPage` test (six sections + TOC render)
      passes unmodified — fa strings byte-identical to before this phase
      — `PublicInfoPages.test.tsx` (original `describe('TravelInfoPage')`
      test, unchanged)
- [x] Section numbering badges (١/٢/٣…) use locale-appropriate digits via
      the existing `formatToman` helper (repurposed here purely for its
      digit-formatting behavior on a plain integer, not an actual money
      value)
      — covered by the same en/ar tests above (each section's numbered
      badge renders alongside its translated title)
- [x] TOC + section-body two-column layout collapses to a single column
      on mobile via the shared `useIsMobile()` hook (the sticky
      table-of-contents becomes static, scrolling with the page) —
      implemented; not separately unit-tested beyond the existing
      `useIsMobile` hook tests (same boolean, no new branch logic beyond
      a grid-template/position swap)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. تکمیل خرید/پرداخت,
درباره ما, تماس با ما, و باقی صفحات عمومی/کاربر/آژانس are separate future
work.
