# Feature: باشگاه مشتریان (Club) — real i18n + responsive body content

Fifth page of the per-page translation arc (after the shared shell,
صفحه اصلی, نتایج پرواز, and مقاصد). Every en/ar string was extracted from
`design-reference-v2/باشگاه مشتریان.dc.html`'s own `isEN` ternaries and
`site-data.js`'s `arDeep` dictionary — this page's mock has near-complete
EN coverage (almost every label has a direct ternary) and unusually good
AR coverage in the `arDeep` dictionary too (tier perks, card-issuance
steps, earn/services cards all had exact-match entries). A few of this
app's own fa strings (not present in the design bundle, since the real
membership-card flow was built independently) were aligned to the
design's exact wording where it didn't change any tested behavior — e.g.
"چطور امتیاز جمع کنم؟" → "چطور امتیاز بگیرم؟", "خدمات اختصاصی اعضا" →
"خدمات ویژه‌ی اعضا" — so the shipped Persian and its new translations stay
consistent with the same source.

## Acceptance checklist

- [x] Hero (badge/title/description/CTA buttons), stats strip, the three
      membership tiers (name/range/perks), the four card-issuance steps,
      the four earn-points cards, and the three member-services cards
      render in fa/en/ar
      — `PublicInfoPages.test.tsx` › "renders translated tiers and CTA in
      English" + "renders translated tiers in Arabic"
- [x] Both pre-existing `PublicClubPage` tests (tiers/stats/card-issuance
      render, join-button href) pass unmodified — fa strings byte-identical
      to before this phase
      — `PublicInfoPages.test.tsx` (original `describe('PublicClubPage')`
      tests, unchanged)
- [x] The logged-in member banner (real data: name, tier, points balance)
      translates its tier label and "Club points" caption, and shows the
      balance with locale-appropriate digits via `formatToman`
      — implemented in `PublicClubPage.tsx`; not separately unit-tested
      this phase (the banner's real-data rendering was already covered by
      the pre-existing member-banner behavior, unchanged here beyond
      adding the locale-aware label/formatting)
- [x] Stats strip, card-issuance steps, and earn/services grids collapse
      from 3–4 columns to 1–2 on mobile via the shared `useIsMobile()`
      hook — implemented; not separately unit-tested beyond the existing
      `useIsMobile` hook tests (same boolean, no new branch logic beyond
      grid-template swaps)

## Bug fixed this phase

`PublicInfoPages.test.tsx` bundles four pages' tests in one file
(`DestinationsPage`, `PublicClubPage`, `SupportPage`, `TravelInfoPage`).
Phase 44 added `mockLocale('en')`/`mockLocale('ar')` calls to the
`DestinationsPage` tests via `vi.spyOn` without ever restoring the spy —
since Vitest doesn't reset spies between tests unless told to, the last
`DestinationsPage` test's Arabic mock leaked into every subsequent test in
the file, including the (until-now-passing) `PublicClubPage` tests, once
this phase added a `useLocale()` call to `PublicClubPage` too. Fixed by
adding `vi.restoreAllMocks()` to the shared `beforeEach`, before the
`useAuth` mock is (re-)applied — the true, durable fix, not a workaround
scoped to one test.

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. تکمیل خرید/پرداخت and the
remaining public/user/agency pages are separate future work.
