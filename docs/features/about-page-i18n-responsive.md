# Feature: درباره ما (About) — real i18n + responsive body content

Eighth page of the per-page translation arc (after the shared shell,
صفحه اصلی, نتایج پرواز, مقاصد, باشگاه مشتریان, پشتیبانی, and قوانین و
مقررات). Every en/ar string came straight from `design-reference-v2/
درباره ما.dc.html`'s own `isEN` ternaries and `site-data.js`'s `arDeep`
dictionary — both had complete coverage matching the shipped app's fa
content byte-for-byte, so nothing needed hand-translation.

## Acceptance checklist

- [x] Hero (eyebrow/title/description), the stats strip, mission/vision
      cards, and the three values cards render in fa/en/ar
      — `PublicMockPages.test.tsx` › "renders translated mission, vision,
      and values in English" + "... in Arabic"
- [x] The pre-existing `AboutPage` test passes unmodified — fa strings
      byte-identical to before this phase
      — `PublicMockPages.test.tsx` (original `describe('AboutPage')`
      test, unchanged)
- [x] Stats strip (4→2 cols), mission/vision cards (2 cols → 1), and
      values cards (3 cols → 1) collapse on mobile via the shared
      `useIsMobile()` hook — implemented; not separately unit-tested
      beyond the existing `useIsMobile` hook tests (same boolean, no new
      branch logic beyond grid-template swaps)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. تماس با ما, ورود و
ثبت‌نام, فراموشی رمز, تکمیل خرید/پرداخت, پنل کاربر, پنل آژانس are
separate future work.
