# Design Refresh Analysis — 2026-07-30

Source: `design-reference-v2/` (redesign export, 33 `.dc.html` files uploaded with
hash-prefixed/garbled filenames) compared against `design-reference/` (old bundle,
proper Persian filenames — source of truth for anything not covered by the new
bundle). All 33 uploaded files were identified and (except one confirmed duplicate)
renamed to their proper Persian filenames. One duplicate (`09b79c29-ReservationSystem.dc.html`)
was byte-for-byte identical to `878cdd42-ReservationSystem.dc.html` (verified with `diff`)
and was deleted, leaving 32 files in `design-reference-v2/`.

Identification method: grepped each file for distinguishing markers — role-identifying
JS literals (`role: "commercial"`, `role: "super"`, `roleKey: "finance"`, etc.), unique
page content strings (city/route data for مقاصد, flight-status fields for وضعیت پرواز,
the `#bj-ticket` print CSS for تکمیل خرید, the `ANNOUNCEMENT BANNER`/`hero-bg` markers
for صفحه اصلی, the user/agency login tabs for ورود و ثبتنام, etc.) rather than reading
full 300–450 KB files end to end.

Classification legend: `UNCHANGED`, `I18N_ADDED`, `RESPONSIVE_ADDED`,
`I18N_AND_RESPONSIVE_ADDED`, `CONTENT_CHANGED`, `NEW_PAGE`.

---

## پشتیبانی (Support)
- File: `design-reference-v2/پشتیبانی.dc.html`
- Old counterpart: `design-reference/پشتیبانی.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: Gained `{{ pageDir }}`/`localStorage`-based fa/en/ar switcher and `window.matchMedia`-driven responsive header/nav. No new SiteData calls; content otherwise equivalent to the old page.

## تماس با ما (Contact Us)
- File: `design-reference-v2/تماس با ما.dc.html`
- Old counterpart: `design-reference/تماس با ما.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: Same treatment as other public pages — i18n switcher + matchMedia responsive layout, no new backend calls or content changes.

## در حال تعمیر و نگهداری (Maintenance page)
- File: `design-reference-v2/در حال تعمیر و نگهداری.dc.html`
- Old counterpart: `design-reference/در حال تعمیر و نگهداری.dc.html`
- Status: UNCHANGED
- Notes: No `pageDir`/`localStorage`/`matchMedia` markers at all. Only diff is a handful of CSS `clamp()` fluid-sizing tweaks (icon size, heading size, padding) — cosmetic polish, not the JS-driven responsive/i18n pattern the rest of the site got. This is a standalone page with no header/nav so i18n wasn't relevant here anyway.

## صفحه 404 (404 page)
- File: `design-reference-v2/صفحه 404.dc.html`
- Old counterpart: `design-reference/صفحه 404.dc.html`
- Status: UNCHANGED
- Notes: Same as maintenance page — only `clamp()`-based fluid sizing added to the "404" heading and its SVG illustration, no i18n/matchMedia.

## درباره ما (About Us)
- File: `design-reference-v2/درباره ما.dc.html`
- Old counterpart: `design-reference/درباره ما.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: i18n switcher + matchMedia responsive layout added; no content/backend changes detected.

## فراموشی رمز (Forgot password)
- File: `design-reference-v2/فراموشی رمز.dc.html`
- Old counterpart: `design-reference/فراموشی رمز.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: Gained language switcher and matchMedia responsive layout; grew from ~9.7 KB to ~32.6 KB largely from the templated i18n strings/branching markup. No new SiteData/backend calls.

## فرصت‌های شغلی (Careers — listing page)
- File: `design-reference-v2/فرصت‌های شغلی.dc.html`
- Old counterpart: none — new page
- Status: NEW_PAGE
- Notes: Brand-new public careers listing page. Calls `SiteData.getActiveJobs()`. Has full i18n (`pageDir`/lang switcher) and `matchMedia` responsive markers, consistent with public-site scope. Backend will need a Jobs domain (list/detail) to back this.

## فرصت‌های شغلی-فرم درخواست (Careers — job application form) — NEWLY DISCOVERED, name uncertain
- File: `design-reference-v2/فرصت‌های شغلی-فرم درخواست.dc.html`
- Old counterpart: none — new page
- Status: NEW_PAGE
- Notes: **Not on the task's pre-identified list.** This was originally `7f523100-_______.dc.html` and turned out to be a second, distinct new page: a per-job application/detail form (personal info fields, national ID, general/specialized requirements lists, a submitted-confirmation state) reached via "بازگشت به فرصت‌های شغلی" links from the careers listing. It calls `SiteData.addJobApplication(...)`. Since there is no old-bundle naming convention to match against and no explicit link target filename was found pointing at it, the filename `فرصت‌های شغلی-فرم درخواست.dc.html` was chosen descriptively — **flag this filename as unconfirmed**; a human should verify the intended name with the design-tool author. Has i18n + matchMedia markers like the rest of the public site.

## قوانین و مقررات (Terms & Conditions)
- File: `design-reference-v2/قوانین و مقررات.dc.html`
- Old counterpart: `design-reference/قوانین و مقررات.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: i18n switcher + matchMedia responsive header/nav added; no content/backend changes detected.

## مدیریت رزرو (Booking management / PNR lookup)
- File: `design-reference-v2/مدیریت رزرو.dc.html`
- Old counterpart: `design-reference/مدیریت رزرو.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: i18n + responsive added (refund tracking code pattern `RF-{{ pnrShow }}` used as the identifying marker). No new SiteData calls versus the old version.

## مقاصد (Destinations)
- File: `design-reference-v2/مقاصد.dc.html`
- Old counterpart: `design-reference/مقاصد.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: i18n + responsive added; destination/route data (Kish, Mashhad, Dubai, Istanbul, etc.) unchanged in substance from old version.

## نتایج پرواز (Flight search results)
- File: `design-reference-v2/نتایج پرواز.dc.html`
- Old counterpart: `design-reference/نتایج پرواز.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: Largest public-page diff (~1,600 normalized lines) but entirely i18n/responsive templating — no new SiteData methods found. Still contains the existing `رادار هوشمند قیمت` (AI price radar, via `window.claude.complete`) and `قفل قیمت` (price lock) features unchanged in capability.

## ورود مدیران و کارمندان (Staff/Admin login)
- File: `design-reference-v2/ورود مدیران و کارمندان.dc.html`
- Old counterpart: `design-reference/ورود مدیران و کارمندان.dc.html`
- Status: UNCHANGED
- Notes: Byte-for-byte size match (14,468 bytes) and 0 normalized diff lines. Correctly excluded from i18n/responsive — staff login is out of scope per the amended rule, and this file confirms that exclusion was respected.

## ورود و ثبتنام (Customer login/signup)
- File: `design-reference-v2/ورود و ثبتنام.dc.html`
- Old counterpart: `design-reference/ورود و ثبتنام.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: i18n + responsive added. The کاربر عادی/آژانس همکار (user/agency) account-type tabs already existed in the old version — not new. No new backend calls.

## وضعیت پرواز (Flight status) — CORRECTED 2026-07-30 (later same day)
- File: `design-reference-v2/وضعیت پرواز.dc.html`
- Old counterpart: `design-reference/وضعیت پرواز.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED (was misclassified as RESPONSIVE_ADDED-only above — the extraction agent's copy of this file was an incomplete/stale upload; the user supplied the correct, complete version directly, which has full `lang` state, `toggleLang()`, `isEN`/`isAR` branches throughout every string, and `pageDir` switching, matching every other public page). **Not a rollout gap — false alarm, retracted.**
- Notes: Search-by-flight-number or by-route+date, live status card (on-time/delayed/landed/cancelled with color coding), Jalali/Gregorian date picker localized per language (`MONTHS`/`MONTHS_EN`/`MONTHS_AR`), Persian/Latin/Eastern-Arabic digit formatting per language (`toFa`/`toAr`). No new backend-relevant capability beyond what Phase 22 already built — this is a pure frontend i18n/responsive pass over the existing real flight-status lookup.

## پرداخت (Payment gateway) — EXCLUDED FROM THIS ROUND (user instruction 2026-07-30)
- File: `design-reference-v2/پرداخت.dc.html`
- Old counterpart: `design-reference/پرداخت.dc.html`
- Status: **DO NOT TREAT AS FINAL** — the user explicitly said not to bring this page into scope yet ("پرداخت را وارد نکن"), following the وضعیت پرواز correction above. The previously-recorded `RESPONSIVE_ADDED`-only classification is suspect for the same reason (likely an incomplete/stale upload, not a real rollout gap) but is UNCONFIRMED — do not act on it, and do not build/redesign this page until the user provides a corrected version or explicit direction.

## صفحه اصلی (Home page)
- File: `design-reference-v2/صفحه اصلی.dc.html`
- Old counterpart: `design-reference/صفحه اصلی.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: i18n + responsive added (identified via the `ANNOUNCEMENT BANNER` comment and `#hero-bg` element unique to this page). Grew from ~98.8 KB to ~156 KB.

## صفحه اصلی-print-x4xf3z (Home page — print/export variant)
- File: `design-reference-v2/صفحه اصلی-print-x4xf3z.dc.html`
- Old counterpart: `design-reference/صفحه اصلی-print-x4xf3z.dc.html`
- Status: UNCHANGED
- Notes: Essentially unchanged (only 4 normalized diff lines): the loyalty-points footer badge ("۱۲٬۴۵۰ امتیاز") and a `data-site-phone` support-phone span were dropped from the footer, and one blank-line whitespace change. No i18n/matchMedia markers — this print/export snapshot was not updated for the redesign, matching the identically-unchanged commercial-manager print variant below. The two missing footer elements look like incidental export artifacts rather than an intentional change; worth a quick visual confirmation.

## باشگاه مشتریان (Customer club / loyalty)
- File: `design-reference-v2/باشگاه مشتریان.dc.html`
- Old counterpart: `design-reference/باشگاه مشتریان.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: i18n + responsive added (identified via heavy density of tier/points vocabulary: طلایی/نقره‌ای/امتیاز). No new backend calls; tier/points model unchanged.

## تکمیل خرید (Checkout)
- File: `design-reference-v2/تکمیل خرید.dc.html`
- Old counterpart: `design-reference/تکمیل خرید.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: i18n + responsive added (identified via the shared `#bj-ticket` boarding-pass print CSS block, unique to this page in the old bundle). No new SiteData methods found — passenger form/services/payment/e-ticket flow unchanged in substance.

## پنل آژانس (Agency portal)
- File: `design-reference-v2/پنل آژانس.dc.html`
- Old counterpart: `design-reference/پنل آژانس.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: In-scope per the amended rule (public + user + agency) and correctly received both i18n and matchMedia responsive treatment. No new SiteData calls — credit/settlement/inbox model unchanged.

## پنل کاربر (User panel)
- File: `design-reference-v2/پنل کاربر.dc.html`
- Old counterpart: `design-reference/پنل کاربر.dc.html`
- Status: I18N_AND_RESPONSIVE_ADDED
- Notes: In-scope and correctly received i18n + responsive (largest growth of the three in-scope authenticated areas, ~124 KB → ~184 KB). No new SiteData calls — trips/wallet/points/passengers sections unchanged in substance.

## ReservationSystem (internal reservation/lock component)
- File: `design-reference-v2/ReservationSystem.dc.html`
- Old counterpart: `design-reference/ReservationSystem.dc.html`
- Status: CONTENT_CHANGED
- Notes: **Notable shrink and functional change**, not i18n/responsive (0 markers of either, correctly — this is an internal component embedded in staff panels). File size dropped from ~105.8 KB to ~22.3 KB. The `goNew` tab (new-reservation creation UI) was removed, along with its backing calls `SiteData.addReservation` and `SiteData.getReservations`. Meanwhile `SiteData.getReservations` now appears as a *new* call inside `پنل مدیر بازرگانی` (see below) — it looks like reservation listing/creation responsibility moved out of this shared component and into the Commercial Manager panel's own new fare-rules/reservations section. **This should be confirmed with the design/product owner** before backend work assumes where reservation creation now lives.

## پنل مدیر بازرگانی (Commercial Manager panel)
- File: `design-reference-v2/پنل مدیر بازرگانی.dc.html`
- Old counterpart: `design-reference/پنل مدیر بازرگانی.dc.html`
- Status: CONTENT_CHANGED
- Notes: Correctly has **zero** i18n/matchMedia markers (staff panel, out of scope — good). Confirmed new capabilities beyond the already-known fare-rules CRUD (`کلاس‌های نرخی پرواز`, `SiteData.getFareRules/addFareRule/updateFareRule/deleteFareRule`, `afSaveFareRule`): also gained `SiteData.addCity`/`getCities` (route/city management), `SiteData.getClubRules`/`saveClubRules` (loyalty-tier rules configuration), `SiteData.getWebServicePricing`/`saveWebServicePricing` (external web-service pricing config), and `SiteData.getReservations` (see ReservationSystem note above). This is a substantial new backend surface for the Commercial Manager role that needs `docs/API.md`/`docs/DB_SCHEMA.md` coverage before implementation, per Workflow Rule #1.

## پنل مدیر بازرگانی-print-va3k0g (Commercial Manager — print/export variant)
- File: `design-reference-v2/پنل مدیر بازرگانی-print-va3k0g.dc.html`
- Old counterpart: `design-reference/پنل مدیر بازرگانی-print-va3k0g.dc.html`
- Status: UNCHANGED
- Notes: Byte-identical (0 normalized diff lines, exact size match 264,799 bytes). This print/export snapshot was not regenerated for the new fare-rules CRUD feature — it still reflects the pre-redesign Commercial Manager panel.

## پنل مدیر IT (IT Manager panel)
- File: `design-reference-v2/پنل مدیر IT.dc.html`
- Old counterpart: `design-reference/پنل مدیر IT.dc.html`
- Status: CONTENT_CHANGED
- Notes: Correctly zero i18n/matchMedia markers. New capabilities: full CRUD for the new passenger-survey feature (`SiteData.getSurveySettings/saveSurveySettings/getSurveyFlights/getSurveyResponses`, enable/disable toggle, add/remove survey questions) — IT Manager owns survey *configuration* while other exec roles only view results (see below). Also the "add external service" form (CDN/services tab) changed from a static mockup to a functional form with input bindings, validation and a `createExtService` handler, plus new empty-state messages for the events/active-sessions lists.

## پنل مدیر ارشد (Senior Manager panel)
- File: `design-reference-v2/پنل مدیر ارشد.dc.html`
- Old counterpart: `design-reference/پنل مدیر ارشد.dc.html`
- Status: CONTENT_CHANGED
- Notes: Correctly zero i18n/matchMedia markers. Gained a read-only "نظرسنجی مسافران" (passenger survey) tab (`SiteData.getSurveyFlights/getSurveySettings`) with an AI-assisted `analyzeSurvey(flightNo, comments)` helper. Remaining diff is mostly the same design-tool-only `SETUP`/empty-state prop pattern seen in the other executive panels (renders `۰`/empty placeholders when `props.setupMode !== false`) — not a functional product change.

## پنل مدیر عامل (CEO panel)
- File: `design-reference-v2/پنل مدیر عامل.dc.html`
- Old counterpart: `design-reference/پنل مدیر عامل.dc.html`
- Status: CONTENT_CHANGED
- Notes: Correctly zero i18n/matchMedia markers. Same read-only passenger-survey tab + `analyzeSurvey` helper as Senior Manager, plus the same `SETUP`-mode empty-state prop noise accounting for most of the remaining diff.

## پنل رئیس هیئت مدیره (Board Chair panel)
- File: `design-reference-v2/پنل رئیس هیئت مدیره.dc.html`
- Old counterpart: `design-reference/پنل رئیس هیئت مدیره.dc.html`
- Status: CONTENT_CHANGED
- Notes: Correctly zero i18n/matchMedia markers. Same read-only passenger-survey feature (`getSurveyFlights`/`getSurveySettings`) added as CEO/Senior Manager; remaining diff is minor styling plus `SETUP`-mode noise.

## پنل مدیر مالی (Finance Manager panel)
- File: `design-reference-v2/پنل مدیر مالی.dc.html`
- Old counterpart: `design-reference/پنل مدیر مالی.dc.html`
- Status: CONTENT_CHANGED
- Notes: Correctly zero i18n/matchMedia markers, and no new SiteData methods at all — the entire 65-line diff is the design-tool `SETUP`/empty-state prop (`data-props="setupMode"`, KPI tiles and cartable become `۰`/empty-state text in setup mode) plus a couple of localized "no data"/"no tasks" string variables replacing hardcoded Persian text. No functional or feature change for Finance Manager.

## پنل ادمین سایت (Site Admin panel)
- File: `design-reference-v2/پنل ادمین سایت.dc.html`
- Old counterpart: `design-reference/پنل ادمین سایت.dc.html`
- Status: CONTENT_CHANGED
- Notes: Correctly zero i18n/matchMedia markers. Gained a full Careers admin surface: `SiteData.addJob`, `getJobs`, `updateJob`, `toggleJob`, `getJobApplications`, `updateJobApplication`, `getCareersSettings`, `toggleCareers` — this is the backend-management counterpart of the new public فرصت‌های شغلی pages (job postings + applicant review), and will need a Jobs/JobApplications domain added to `docs/API.md`/`docs/DB_SCHEMA.md`/Prisma schema before implementation, per Workflow Rule #1. Remainder of the diff is the same `SETUP`-mode empty-state pattern.

## پنل کارمند (Employee panel)
- File: `design-reference-v2/پنل کارمند.dc.html`
- Old counterpart: `design-reference/پنل کارمند.dc.html`
- Status: CONTENT_CHANGED
- Notes: Correctly zero i18n/matchMedia markers (staff, out of scope). No new SiteData methods — the diff is a pure visual re-skin of the employee login screen (dark centered card → light two-panel layout with a side illustration/animation), same username/password fields and `doLogin` handler. No functional change.

---

## Summary

**Total pages/files found in `design-reference-v2/`: 32** (33 uploaded `.dc.html` files minus 1 confirmed byte-identical `ReservationSystem.dc.html` duplicate, which was deleted).

| Classification | Count | Pages |
|---|---|---|
| UNCHANGED | 5 | در حال تعمیر و نگهداری، صفحه 404، صفحه اصلی-print-x4xf3z، ورود مدیران و کارمندان، پنل مدیر بازرگانی-va3k0g |
| I18N_ADDED (i18n only, no responsive) | 0 | — |
| RESPONSIVE_ADDED (responsive only, no i18n) | 0 (پرداخت pending, see below) | — |
| I18N_AND_RESPONSIVE_ADDED | 15 | پشتیبانی، تماس با ما، درباره ما، فراموشی رمز، قوانین و مقررات، مدیریت رزرو، مقاصد، نتایج پرواز، ورود و ثبتنام، صفحه اصلی، باشگاه مشتریان، تکمیل خرید، پنل آژانس، پنل کاربر، **وضعیت پرواز (corrected)** |
| CONTENT_CHANGED | 9 | ReservationSystem، پنل مدیر بازرگانی، پنل مدیر IT، پنل مدیر ارشد، پنل مدیر عامل، پنل رئیس هیئت مدیره، پنل مدیر مالی، پنل ادمین سایت، پنل کارمند |
| NEW_PAGE | 2 | فرصت‌های شغلی، فرصت‌های شغلی-فرم درخواست |
| PENDING (excluded, unconfirmed) | 1 | پرداخت |
| **Total** | **32** | |

### Discrepancies / notable findings flagged

- ~~وضعیت پرواز and پرداخت are missing the i18n treatment~~ — **retracted for وضعیت پرواز**: the user supplied the correct, complete file directly (2026-07-30, later same day), which has full fa/en/ar support — the original upload the extraction agent classified was stale/incomplete, not a real rollout gap. **پرداخت remains unconfirmed and is explicitly excluded from this round** per the user's instruction ("پرداخت را وارد نکن") — do not treat its `RESPONSIVE_ADDED`-only classification as final.
- **Staff/executive panels correctly excluded from i18n + responsive** — verified zero `pageDir`/`blujet_lang`/`matchMedia` hits across all 8 staff/executive panel files (ادمین سایت، رئیس هیئت مدیره، IT، ارشد، عامل، بازرگانی، مالی، کارمند) and the shared `ReservationSystem` component. No scope violation found here.
- **وایرفریم سایت ایرلاین (old internal wireframe/sitemap page) has no counterpart anywhere in the new bundle.** File-count arithmetic (31 old + 2 new career pages + 1 duplicate ReservationSystem − 1 dropped wireframe = 33 uploaded) only balances if this page was dropped from the export; no `WIREFRAME` marker text was found in any of the 33 uploaded files. Worth confirming with the design-tool owner whether this was an intentional retirement of the internal wireframe/sitemap artifact.
- **A second, previously-unidentified new page exists**: a Careers job-application form/detail page (`design-reference-v2/فرصت‌های شغلی-فرم درخواست.dc.html`, calls `SiteData.addJobApplication`). Its filename is a best-effort guess (no old-bundle convention to match and no explicit self-referencing link found) — flag for confirmation.
- **ReservationSystem shrank from ~106 KB to ~22 KB and lost its "new reservation" (`goNew`) tab** along with `SiteData.addReservation`/`getReservations` calls; `getReservations` reappears as a new call inside `پنل مدیر بازرگانی` instead. Reservation-creation/listing responsibility may have moved to the Commercial Manager panel — needs product confirmation before backend design assumes this.
- **New backend-relevant capabilities surfaced in mock state/handlers, needing `docs/API.md`/`docs/DB_SCHEMA.md` coverage before implementation (Workflow Rule #1):**
  - Site Admin: full Careers admin CRUD (jobs + job applications + careers-page settings).
  - CEO / Board Chair / Senior Manager: read-only "نظرسنجی مسافران" (passenger satisfaction survey) results view with AI-assisted comment analysis.
  - IT Manager: full survey configuration (enable/disable, manage questions) — the only role with write access to survey settings.
  - Commercial Manager: fare-rules CRUD (already known), plus city/route management, club/loyalty-tier rules configuration, and web-service/API pricing configuration — a much larger new surface than just fare rules.
- **Design-tool-only `SETUP`/empty-state prop** (`data-props="setupMode"`) was added to most executive/finance panels (CEO, Board Chair, Senior Manager, Finance Manager, Site Admin) to let the design tool preview an all-zero/empty state. This accounts for a large fraction of each panel's line-level diff but is not a functional or business-logic change and needs no backend follow-up.
- **پنل کارمند (Employee) login screen was purely re-skinned visually** (dark centered card → light two-panel layout with imagery/animation); no functional, i18n, or backend change.
- **Print/export variant snapshots were not regenerated**: both `صفحه اصلی-print-x4xf3z.dc.html` and `پنل مدیر بازرگانی-print-va3k0g.dc.html` are effectively/exactly unchanged from the old bundle despite their live counterparts changing significantly — these snapshots will need to be re-exported once the redesign is finalized.
