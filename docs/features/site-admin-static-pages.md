# SITE_ADMIN static site pages CMS (Phase I)

Completes the Phase E deferral for the static site pages list in the
media tab. Reuses existing `SystemSetting` text keys — no new tables.

## Admin (`MediaAdminPage`, tab `media`)

- [x] «صفحات سایت» list matches design page inventory — `MediaAdminPage.test.tsx`
- [x] SITE_ADMIN can edit page text fields via modal + PATCH `/settings` —
      `MediaAdminPage.test.tsx` › "lists site pages and saves edited about text"
- [x] SITE_ADMIN may PATCH content keys (`aboutUsText`, `contactAddress`,
      `termsText`, `homeHeroTitle`, `homeHeroSubtitle`) — `phase12.e2e-spec.ts`

## Public API

- [x] `GET /settings/site-content` returns editable text fields —
      `phase12.e2e-spec.ts`

## Public page wiring

- [x] `AboutPage` hero description (fa) reads `aboutUsText` — manual / implicit
- [x] `ContactPage` office address (fa) reads `contactAddress` — `ContactPage.test.tsx`
- [x] `TravelInfoPage` intro paragraph (fa) reads `termsText` — implicit

## Explicit deferrals

- Per-locale CMS (settings store Persian copy only; en/ar keep static bundles)
- Full structured page CMS (sections, TOC items) for travel-info/support
- Job postings block in media tab (lives in `jobapps` tab)
