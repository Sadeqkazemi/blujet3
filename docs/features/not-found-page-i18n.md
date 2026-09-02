# Feature: صفحه 404 real i18n

Twenty-first page-set of the arc, first non-agency-portal page since the
agency-portal arc (Phases 53–60) completed. `NotFoundPage.tsx` is a
small, standalone static page (heading, body copy, two links, error-code
footer) with no dependency on the excluded checkout/payment flow, so it's
a safe next target for translation.

`design-reference/صفحه 404.dc.html` has no `isEN`/`isAR` sample data at
all for this page (it's fa-only in the design bundle), so all English
and Arabic text here is hand-translated fresh.

This page had no test file before this phase — one was created from
scratch.

## Acceptance checklist

- [x] Heading, body copy, both links (home/search), and the error-code
      footer render in fa/en/ar — `NotFoundPage.test.tsx` › "renders the
      Persian 404 heading and links by default" + "renders translated
      heading and links in English" + "...in Arabic"
- [x] The wrapping `dir` attribute is locale-aware (`ltr` for en, `rtl`
      otherwise), matching the pattern established in
      `AgencyPortalShell.tsx`/`AgencyLoginLayout.tsx` (Phase 53)
- [x] The `404` digits stay Persian-digit (`faDigits`) in every locale —
      unchanged from the original implementation, verified by all three
      new tests still asserting `'۴۰۴'`/rendering without error across
      locales

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
