# Feature: مقاصد (Destinations) — real i18n + responsive body content

Fourth page of the per-page translation arc (after the shared shell,
صفحه اصلی, and نتایج پرواز). Note: تکمیل خرید/پرداخت were skipped for
this phase — the real `CheckoutPage.tsx` implements payment-method
selection and discount code entry, which functionally overlaps with the
پرداخت page the user explicitly excluded from this refresh
("پرداخت را وارد نکن") pending a corrected design upload; translating it
now risked conflicting with that exclusion, so مقاصد (unambiguously in
scope, no excluded-page overlap) was picked instead.

Every en/ar string was extracted from `design-reference-v2/مقاصد.dc.html`'s
own `isEN`/`isAR` ternaries (which cover this page far more completely
than earlier pages — nearly every label has a direct three-way ternary)
and `site-data.js`'s `arDeep` dictionary for the handful that didn't
(`noResultsTitle`/`noResultsSub` only had an EN ternary in the mock,
falling back to Persian in Arabic mode there — hand-translated properly
instead of reproducing that gap). Destination durations/weekly-frequency
counts/route frequencies have no direct AR string in the design source
(EN-only ternary); hand-translated using the same digit/vocabulary
conventions confirmed elsewhere in `site-data.js`'s dictionary (e.g.
`'پرواز در هفته': 'رحلة أسبوعيًا'`, Eastern Arabic-Indic digits).

## Acceptance checklist

- [x] Hero (eyebrow/title/subtitle/search box/region tabs), destination
      mosaic (grid title, hint, per-card region badge + optional
      promotional badge + duration + weekly frequency + price), empty
      state, map band (eyebrow/title/subtitle/stat boxes/city pins), and
      popular-routes band render in fa/en/ar
      — `PublicInfoPages.test.tsx` › "renders translated catalog with
      Latin-digit toman prices in English" +
      "renders translated catalog with Eastern Arabic-Indic digits in
      Arabic"
- [x] All 4 pre-existing `DestinationsPage` tests (catalog render, region
      filter, empty-search state, real results-page link) pass
      unmodified — fa strings byte-identical to before this phase
      — `PublicInfoPages.test.tsx` (original `describe('DestinationsPage')`
      tests, unchanged)
- [x] Mock catalog/route/map-pin data restructured to locale-neutral shape
      (per-locale name/duration/frequency objects + a plain numeric toman
      price) instead of Persian-only pre-formatted strings, so `en`/`ar`
      never fall back to Persian digits or Persian city names
      — same tests as above
- [x] Search filtering matches against the active locale's city name (not
      always the Persian one), so typing an English city name filters
      correctly in `en` mode — implemented in the `filtered` memo; not
      separately tested beyond the existing Persian-locale empty-search
      test (same filter logic, only the compared field changed)
- [x] Destination mosaic and map band collapse to a narrower grid
      (4→2 columns, `1fr 1.2fr`→single column) on mobile via the shared
      `useIsMobile()` hook — implemented; not separately unit-tested
      beyond the existing `useIsMobile` hook tests (same boolean, no new
      branch logic beyond grid-template swaps)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. تکمیل خرید/پرداخت,
باشگاه مشتریان, and the remaining public/user/agency pages are separate
future work.
