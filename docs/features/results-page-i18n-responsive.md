# Feature: نتایج پرواز (Results) — real i18n + responsive body content

Second page of the per-page translation arc (after صفحه اصلی in Phase 42).
Every en/ar string was extracted from `design-reference-v2/نتایج پرواز.dc.html`'s
own `isEN`/`isAR` ternaries and `site-data.js`'s `arDeep` dictionary where the
design's key names or values matched (`aiRadarTitle`, `sortCheapLabel`,
`changeSearchLabel`, `صندلی باقی‌مانده`, `یک توقف`, time-of-day buckets,
etc.); the small remainder with no direct design equivalent (filter/sort
labels the design implements differently, modal copy, the AI-radar
narrative sentence) was hand-translated, same quality bar as Phase 42 — a
real, deliberate string per locale, no silent fallback.

## Acceptance checklist

- [x] Search summary bar, calendar strip, filter sidebar (stops/time/
      airline), AI price radar, sort tabs, empty/searching/mock-notice
      states, mock flight cards, real result cards, and both price-lock
      modals (mock-gated + real, all three `RealLockResult` kinds) render
      in fa/en/ar
      — `ResultsPage.test.tsx` › "renders translated result cards with
      Latin-digit toman prices in English" +
      "renders translated mock schedule with Eastern Arabic-Indic digits
      in Arabic"
- [x] All 8 pre-existing tests (real result cards, sold-out cabin, mock
      fallback on empty/error search, and all 4 real-price-lock flows)
      pass unmodified — fa strings are byte-identical to before this
      phase
      — `ResultsPage.test.tsx` (original tests, unchanged)
- [x] Real cabin prices (`c.priceIrr`, straight from the API) and price-lock
      amounts (`lockedPriceIrr`/`feeIrr`) render with locale-appropriate
      digits/separators via the new `localeMoney` helper — the
      rial→toman division still happens in exactly one place
      — `frontend/src/lib/fa-format.test.ts` › `localeMoney` describe block
- [x] Mock schedule prices/seat counts/calendar prices (page-local
      placeholder numbers, not from the API) use `formatToman`/`faDigits`
      per locale
      — covered by the same en/ar tests above (calendar + mock cards
      render through the shared shell in every test)
- [x] Layout goes single-column (filters above results) on mobile via the
      shared `useIsMobile()` hook, matching the design bundle's own
      `isMobile` stacking — implemented; not separately unit-tested beyond
      the existing `useIsMobile` hook tests (same boolean, no new branch
      logic beyond a flex-direction swap)
- [x] Server-provided error messages (e.g. "already locked" 409 from the
      real price-lock endpoint) are passed through unmodified — never
      routed through the page's translation dictionary, since they're
      real backend text, not UI chrome
      — `ResultsPage.test.tsx` › "shows the server error message when
      locking fails" (unchanged, still asserts the exact server string)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. Remaining public pages
(تکمیل خرید, مقاصد, باشگاه مشتریان, …) are separate future work.
