# SITE_ADMIN media CMS — acceptance checklist

Design source: `design-reference-v2/پنل ادمین سایت.dc.html` (media tab ~L1521+)
+ product screenshots (2026-08 dark-align).

**Scope:** image library, hero/announcement/promo banners, popular destinations,
popular routes, social links, app download links, support contact, job postings
block, static site pages. Application forms queue lives on `jobapps` tab.

## Admin panel (`MediaAdminPage`, tab `media`)

- [x] Image library: list, upload, soft-delete — `site-content.e2e-spec.ts` library
- [x] Hero banner edit (title, subtitle, button, cover) — e2e + `MediaAdminPage.test.tsx`
- [x] Announcement bar toggle («غیرفعال کردن») + text — e2e + MediaAdminPage.test
- [x] Promo banner edit (badge, title, button, cover) — e2e
- [x] Popular destinations CRUD — e2e
- [x] Popular routes CRUD (+ 10/page) — e2e / MediaAdminPage
- [x] Social networks toggles + URLs — `MediaAdminPage.test.tsx`
- [x] App download links — same test
- [x] Support contact edit — same test
- [x] Job opportunities cards (create / deactivate / footer publish) — MediaAdminPage.test
- [x] `media` tab in SITE_ADMIN nav — `panels.e2e-spec.ts`

## Public API

- [x] `GET /site-content/home` returns blocks, destinations, routes — e2e
- [x] `GET /site-content/media/:fileId` serves library/block images — e2e

## Home page wiring

- [x] `HomeSearchPage` reads CMS hero/announcement/promo/routes/destinations — `HomeSearchPage.test.tsx`

## Explicit deferrals

- Social links, app store links, support phone/email on media tab
- Job postings live on `jobapps` tab (create / ads / applications)
- Per-locale structured static page CMS beyond text keys
