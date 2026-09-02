# Public blog pages — acceptance checklist

Completes the Phase D deferral: public marketing-site blog UI wired to
existing `/blog/posts*` API (no new backend endpoints).

## `/blog` listing

- [x] Hero + category chips (fa/en/ar) — `BlogPage.test.tsx` "renders blog cards"
- [x] Fetches `GET /blog/posts` with optional category — `BlogPage.test.tsx` "filters by category"
- [x] Card grid: title, category, excerpt, author, date, views, link to detail
- [x] Empty + loading + error states
- [x] Cover image via `/blog/covers/:id` or category gradient fallback

## `/blog/:slug` detail

- [x] Fetches `GET /blog/posts/:slug`, renders title/body/meta — `BlogPage.test.tsx` "renders article body"
- [x] 404-style message when post missing — `BlogPage.test.tsx` "shows not found"
- [x] Back link to `/blog`

## Shell / navigation

- [x] Uses `PublicPageShell` (header locale switcher, footer)
- [x] Footer link «بلاگ» in company column — `PublicFooter` (manual)

## Locale

- [x] fa/ar RTL + Jalali dates; en LTR + Gregorian dates (`blog-shared.ts`)
- [x] Category labels translated on frontend (API returns fa labels only)

## Explicit deferrals

- No dedicated exported design file for public blog (follows CareersPage shell pattern)
- Blog comments
