# Employee access and site-content completion

## Scope

Complete the IT-managed employee access flow so each employee can open the
real read/write surfaces granted from the owning manager panel, and complete
the SITE_ADMIN content-management flow for public banners, destinations,
support details, blog posts and job advertisements.

## Acceptance checklist

- [x] A commercial employee granted `fl_manage` can load flight overview and
  reference data while flight mutations remain unavailable to `fl_view` only.
- [x] An employee with only agency membership-request access does not call the
  partner-agency list endpoint and can still see the request queue.
- [x] An employee with agency profile access can load the partner list and open
  agency details; list-only access does not expose detail navigation.
- [x] Missing employee permissions continue to return HTTP 403 from the API;
  frontend navigation is not used as authorization.
- [x] SITE_ADMIN can select, replace, or clear an uploaded library image for
  the hero, announcement, and promotional content blocks.
- [x] SITE_ADMIN can select, replace, or clear an uploaded library image for a
  popular destination.
- [x] SITE_ADMIN navigation exposes the existing blog and career-management
  surfaces while system-only KYC and settings routes remain hidden.
- [x] Public support contact details are loaded from the SITE_ADMIN settings
  contract, with safe defaults when the public endpoint is unavailable.
- [x] The contact page editor includes both address and office-hours fields.
- [x] Regression tests cover implied flight read access, conditional agency
  loading, and assigning library images to public content.
- [x] Frontend typecheck/build, backend build, lint and targeted
  frontend/backend tests pass.

## Existing API contract used

- `GET /panels/employee-context`
- `GET /flights/overview` and flight reference-data GET endpoints
- `GET /agencies`, `GET /agencies/requests`, `GET /agencies/:id`
- `GET/PATCH /site-content/admin/blocks/:key`
- `GET/POST/PATCH/DELETE /site-content/admin/destinations`
- `GET/POST/DELETE /site-content/admin/library`
- Existing blog administration endpoints used by `/panel/blog`
- Existing job-post and application endpoints used by `/panel/jobapps`
- `GET/PATCH /admins/settings`
- Public support-contact settings endpoint consumed by the support page

No new endpoint or database table is required for this phase; the fixes make
the documented grant and media relationships reachable from the UI.
