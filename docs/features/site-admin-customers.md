# SITE_ADMIN — مشتریان (Customers)

Acceptance checklist for the site-admin «مشتریان» tab, matching
`design-reference/پنل ادمین سایت.dc.html` + approved screenshots.

## Nav

- [x] SITE_ADMIN sidebar includes `customers` / «مشتریان» after `reports`, before `club`
- [x] Incomplete-profile badge count on the nav item when `incompleteCount > 0`
- [x] Proven by: `backend/test/panels.e2e-spec.ts`, `backend/test/customers.e2e-spec.ts`

## List (`/panel/customers`)

- [x] Title/subtitle match design («مشتریان» / mobile search + detail copy)
- [x] «مشتریان ثبت‌نام‌شده» card with total count badge
- [x] Search by mobile digits (Persian/Latin)
- [x] Columns: نام، موبایل، کد ملی، وضعیت (کامل|ناقص)
- [x] Warning icon on incomplete rows; empty name shows «— بدون نام —»
- [x] Click row → customer detail
- [x] Pagination (10 per page)
- [x] Proven by: `frontend/src/features/customers/SiteAdminCustomersPage.test.tsx`, `backend/test/customers.e2e-spec.ts`

## Detail

- [x] Back link to list
- [x] Header: avatar initial, name, warn pill, phone · email, club pill
- [x] Tabs: اطلاعات و مدارک / تاریخچه خرید / تاریخچه استرداد / تماس‌ها و تیکت‌ها / باشگاه مشتریان
- [x] Info: personal fields in labeled boxes + uploaded ID docs (or empty state)
- [x] Purchases: route, date, PNR, amount تومان, status badge
- [x] Refunds: route, PNR, tracking, penalty/refundable amounts, status
- [x] Contacts: channel, subject, date, status
- [x] Club: level + current points
- [x] Proven by: `frontend/src/features/customers/SiteAdminCustomersPage.test.tsx`, `backend/test/customers.e2e-spec.ts`

## API

- [x] `GET /customers?q=` — SITE_ADMIN only; list + `incompleteCount`
- [x] `GET /customers/:id` — SITE_ADMIN only; detail payload for all tabs
- [x] 401/403 for unauthenticated / non–site-admin
- [x] Proven by: `backend/test/customers.e2e-spec.ts`
