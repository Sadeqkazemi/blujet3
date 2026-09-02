# Feature: Public-site i18n (fa/en/ar) + responsive shared shell foundation

Covers `docs/API.md` → "Phase 40" (locale persistence, already implemented)
and the frontend-only follow-up: the shared shell every public page,
پنل کاربر page, and پنل آژانس page will build on. This phase does not
translate individual page bodies — it lands `useLocale`/`useT`/
`useIsMobile` and rewires `PublicPageShell`/`PublicHeader`/`PublicFooter`
to use them, matching the new design-tool export bundle
(`design-reference-v2/`, see `docs/design-refresh-2026-07-30.md`).

Scope per user decision: public site + پنل کاربر + پنل آژانس only.
Staff/executive panels stay Persian-only RTL (per the amended CLAUDE.md
"Locale & Direction" section) — verified zero i18n/responsive markers in
the new design bundle for those panels.

## Acceptance checklist

### Shared dictionary + hooks
- [x] `useT()` returns a hand-verified fa/en/ar string for every shared
      nav/menu/footer key — no silent fallback-to-Persian for unmatched
      strings (unlike the design mock's own `arDeep` dictionary, which has
      known gaps) — `frontend/src/lib/i18n.test.ts`
- [x] `DIR`/`FONT` maps: fa/ar → rtl + Vazirmatn, en → ltr + Inter —
      `frontend/src/lib/i18n.test.ts`
- [x] `useIsMobile()` tracks `window.matchMedia("(max-width:767px)")`,
      reflects the initial state AND live breakpoint changes via the
      `change` event listener — `frontend/src/hooks/useIsMobile.test.ts`
- [x] `useLocale()` used outside a `LocaleProvider` (any test rendering a
      shared component in isolation) falls back to `fa` + a no-op setter
      instead of throwing, so pre-existing tests don't need to wrap every
      render — `frontend/src/hooks/useLocale.test.tsx` ›
      "falls back to fa with a no-op setter when used outside a
      LocaleProvider"

### PublicPageShell
- [x] `dir` and `font-family` follow the active locale instead of being
      hardcoded to `rtl`/Vazirmatn — covered by `PublicHeader.test.tsx`/
      `PublicFooter.test.tsx` rendering through the shell

### PublicHeader
- [x] Nav labels, menu title, auth buttons, notification panel title,
      user-menu labels, and tier names render in the active locale —
      `PublicHeader.test.tsx` › fa/en assertions
- [x] Language switcher dropdown (`public-lang-toggle` +
      `public-lang-option-{fa,en,ar}`) calls `setLocale` with the chosen
      value — `PublicHeader.test.tsx` › "switches locale via the language
      dropdown"
- [x] Mobile hamburger + off-canvas menu with its own lang cycle toggle —
      implemented in `PublicHeader.tsx` (`public-mobile-menu-toggle`,
      `public-lang-toggle-mobile`); not separately unit-tested beyond
      render (same component tree as desktop, no new logic branch)
- [x] RTL/LTR-aware dropdown positioning (`left`/`right` flip via
      `isRTL`) — implemented; visual-only, verified by manual review
      against `design-reference-v2/صفحه اصلی.dc.html`'s en-mode layout
- [x] Points balance shown as Persian digits only when `locale === 'fa'`,
      raw Latin digits otherwise — `PublicHeader.test.tsx` › en test
      asserts `'12450'`

### PublicFooter
- [x] All column headings, links, phone, and copyright line render in the
      active locale; grid collapses to a single column on mobile —
      `PublicFooter.test.tsx` fa/en/ar tests

### Regression
- [x] Full frontend suite (237 tests, 61 files) passes with the shared
      shell now calling `useLocale()`/`useIsMobile()` — no pre-existing
      public-site page test needed rewriting once `useLocale()` stopped
      throwing without a provider

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. Per-page body translation
(هر صفحه به‌صورت جداگانه) is out of scope for this phase and tracked as
future work in `PLAN.md`.
