# Feature: صفحه اصلی (Home) — real i18n + responsive body content

Covers `docs/features/i18n-responsive-foundation.md`'s explicitly-deferred
"per-page body translation" work — first page, matching
`design-reference-v2/صفحه اصلی.dc.html`. Every translated string was
extracted from that file's own `isEN`/`isAR` ternaries and `site-data.js`'s
`arDeep` dictionary (`ARDict`), not invented — see the string-by-string
cross-reference in the PR/commit. One deliberate deviation from the mock:
the design's EN mode shows fake USD prices; the real backend only ever
charges IRR/toman, so all three locales show the same toman amount,
formatted with locale-appropriate digits/separators via the new
`formatToman`/`formatLocalePercent` helpers in `frontend/src/lib/fa-format.ts`.

## Acceptance checklist

- [x] Page uses `PublicPageShell` (locale-aware `dir`/font) instead of its
      own hardcoded `dir="rtl"` wrapper
      — `HomeSearchPage.test.tsx` (renders through the shell in every test)
- [x] Announcement banner, hero badge/title/subtitle, trip-type radios,
      origin/destination/date labels, search button, popular-routes
      header, quick links, special-offers section, mid-banner sale,
      popular-destinations section, loyalty-club band, and app band all
      render in fa/en/ar
      — `HomeSearchPage.test.tsx` › "renders translated marketing sections
      and Latin-digit toman prices in English" +
      "renders Arabic marketing sections with Eastern Arabic-Indic digits"
- [x] Toman prices (routes, offers, destinations) render with
      locale-appropriate digits/separators (fa: Persian digits + ٬, en:
      Latin digits + `,`, ar: Eastern Arabic-Indic digits + ٬) — no
      invented USD conversion
      — `frontend/src/lib/fa-format.test.ts` › `formatToman` describe block;
      `HomeSearchPage.test.tsx` en/ar tests assert exact formatted strings
- [x] Discount percentages render with locale-appropriate digits and the
      correct percent sign placement (fa/ar: `٪` suffix, en: `%` suffix)
      — `fa-format.test.ts` › `formatLocalePercent`; `HomeSearchPage.test.tsx`
      en/ar tests assert `'19% OFF'` / `'١٩٪ خصم'`
- [x] Known city names used in marketing cards (Tehran, Mashhad, Istanbul,
      Dubai, Kish, Shiraz) translate per locale; the real airport
      `<select>` dropdown falls back to the API's `cityFa` for any other
      airport, since `Airport` has no `cityEn`/`cityAr` column yet — **known
      limitation, not silently hidden**: flagged here and in `PLAN.md` as
      future schema work needing `docs/DB_SCHEMA.md` coverage + approval
      before it's built
- [x] Responsive: hero height/title size, search-card fields (row → 2-col
      grid), services + special-offers horizontal scroll (2 cards visible,
      `.hscroll`, no visible scrollbar), popular-destinations + loyalty/app
      carousel hidden on mobile, mid-banner (row → column) all switch at
      the shared `useIsMobile()` breakpoint (767px), matching
      `design-reference-v2/صفحه اصلی.dc.html` — **layout frozen**; do not
      change without explicit user approval
      — `HomeSearchPage.test.tsx` › "responsive layout (frozen)" describe
      block (desktop grid vs mobile hscroll + hidden sections)
- [x] Error messages (airport-list load failure, missing
      origin/dest/date, same-city validation) are locale-aware; fa text
      unchanged from before this phase so all 4 pre-existing tests still
      pass untouched
      — `HomeSearchPage.test.tsx` (original 4 tests, unmodified)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. Every other public page's
body content (نتایج پرواز, تکمیل خرید, مقاصد, باشگاه مشتریان, …) is
separate future work, not started this phase.
