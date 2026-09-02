# SITE_ADMIN panel dark-align (design-reference-v2)

Acceptance checklist for پنل ادمین سایت parity with
`design-reference-v2/پنل ادمین سایت.dc.html` and product screenshots.

## Nav
- [x] Sidebar order: داشبورد → آژانس‌ها → پرواز → گزارش مسافران → باشگاه مشتریان → استرداد بلیط → کارتابل → تیکت‌ها → مدیریت سایت → درخواست‌های استخدام — `backend/test/panels.e2e-spec.ts` «confirmed tab set for SITE_ADMIN» (blog / kyc / settings removed from sidebar)
- [x] Labels match design sidebar (آژانس‌ها / پرواز / تیکت‌ها / درخواست‌های استخدام) — `panel-nav.config.ts`

## Shell
- [x] Brand subtitle «پنل مدیریت» (logo line in design HTML / screenshots) — `PanelShell.tsx`
- [x] Avatar initial «اس» in footer chrome — `PanelShell.tsx`
- [x] Nav badges: refund awaiting review + open tickets for SITE_ADMIN — `PanelShell.tsx`
- [x] Cartable uses dark theme for SITE_ADMIN — `CartablePage.tsx`

## Dashboard
- [x] Four KPI cards: آژانس فعال / مسافر این ماه / بلیط فروخته‌شده / درخواست در انتظار اقدام — `SiteAdminDashboardPage.test.tsx`
- [x] Real MoM trend % on passenger/ticket KPIs when previous month has data
- [x] Widgets: درخواست‌های آژانس‌ها، استرداد (با بج وضعیت)، کارتابل، اعلان‌های جدید — same test
- [x] Backend `GET /reporting/site-admin-overview` (SITE_ADMIN) — docs/API.md + controller

## Agencies («مدیریت آژانس‌ها»)
- [x] Dark membership-request queue with «بررسی درخواست» — `SiteAdminAgenciesPage.test.tsx`
- [x] KPIs: آژانس‌های فعال + درخواست‌های در انتظار عضویت — same test
- [x] Tabs: آژانس‌های همکار / درخواست وب‌سرویس (+ pending badge) — same test
- [x] Partner list search + active/suspended badges — same test
- [x] 10 records per page on membership / partner / webservice lists — same test
- [x] `GET /agencies/webservice-requests` cross-agency queue — `AgenciesService.listAllWebserviceRequests`

## Flights («پروازها» / flightops)
- [x] Dark layout: Nira info banner, 4 KPIs, table columns (مسیر city labels / شماره / تاریخ / فروش·ظرفیت / وضعیت / نیرا) — `FlightOpsPage.test.tsx`
- [x] Status + Nira color coding (open green / closed grey / pending amber) — same test
- [x] 10 records per page on flight list (+ passenger manifest) — same test

## Club («باشگاه مشتریان»)
- [x] Dark 3 KPIs: اعضای باشگاه / درخواست‌های در انتظار / کارت‌های صادرشده — `SiteAdminClubPage.test.tsx`
- [x] Card-request queue (all statuses) + refer modal — same test
- [x] Member profiles click-to-open — same test
- [x] VIP ready-for-card list + «دانلود اکسل» — same test
- [x] 10/page on requests, members, VIP lists — same test
- [x] SITE_ADMIN members list includes decrypted `nationalId` for profiles/Excel

## Refunds («استرداد بلیط»)
- [x] SITE_ADMIN copy/KPIs: در انتظار بررسی / ارجاع‌شده به مالی / پرداخت‌شده — `RefundsPage.test.tsx`
- [x] Row action «مشاهده و ارجاع ←» (no pay on admin surface) — same test
- [x] Dedicated search box above the list — same test
- [x] 10 records per page — same test

## Cartable («کارتابل»)
- [x] Dark SITE_ADMIN layout: 3 category KPIs, «کارتابل من», date filter, ایجاد پیام, بررسی — `CartablePage.tsx` (`dark` includes SITE_ADMIN)
- [x] 10/page — `usePagination`

## Tickets («تیکت‌ها»)
- [x] Dark 5 KPIs + status tabs + dept chips + search + table — `SupportTicketsPage.test.tsx`
- [x] Create-ticket modal + `POST /support-tickets/admin` — same test
- [x] 10/page — same test

## Site Management («مدیریت سایت»)
- [x] Dark banners + destinations + routes + app links + social + support + library — `MediaAdminPage.test.tsx`
- [x] 10/page on destinations, routes, library — `usePagination`

## Employment panel («استخدام» / jobapps)
- [x] Three tabs: ایجاد فرصت شغلی (عکس+متن) / آگهی‌ها / درخواست‌های استخدام — `CareersAdminPage.test.tsx`
- [x] Footer visibility toggle «نمایش آگهی در فوتر» → `CareersSettings.enabled` — same test + `PublicFooter.test.tsx`
- [x] Applications show form fields + uploaded resume docs — same test
- [x] Job posting `description` + `imageFileId` — migration + API

## Global panel pagination rule
- [x] Default `PANEL_PAGE_SIZE = 10` via `usePagination` — `Pagination.test.tsx`
- [x] Overrides removed: refunds + commercial pricing now 10/page — `RefundsPage.test.tsx`, `PricingPage.test.tsx`
- [x] Employee agencies table paginated — `EmployeeAgenciesPage.tsx`

## Login
- Username `site.admin` / password `Blujet@1404`
