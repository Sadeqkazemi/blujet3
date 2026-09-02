# Feature: IT Manager panel — accounts, permissions, services, security, logs, backups (Phase 8+)

Covers `docs/API.md` → "Phase 8" and `docs/DB_SCHEMA.md` → "Phase 8".
Scope includes the eleven implemented IT tabs: داشبورد فنی، کاربران و
دسترسی‌ها، رمزها و امنیت، سرویس‌های سایت، وب‌سرویس‌ها و API، سامانه
رزرواسیون، دسترسی به پنل‌ها، لاگ و رویدادها، نظرسنجی مسافران، پشتیبان‌گیری و
تنظیمات سامانه. Employee delegation is intentionally narrower: only the
operation-level catalog keys that have an endpoint `@RequiresPermission`
guard are delegable; IT_MANAGER itself retains the full role-scoped panel.

## Acceptance checklist

Backend items proven by `backend/test/it-manager.e2e-spec.ts` (15 tests,
107 total); frontend by `frontend/src/features/it-manager/*.test.tsx` (7
tests, 51 total); E2E by `frontend/e2e/it-manager-journey.spec.ts` (4
journeys) + the updated `staff-login-journey.spec.ts` itadmin case.

### Permission catalog & employees
- [x] `GET /it/permissions` returns the unit/action catalog for commercial,
  finance and IT (sales reuses commercial); legacy umbrella keys remain for
  compatibility; non-IT role → 403 — `'GET /it/permissions returns the catalog; non-IT role gets 403'`
- [x] `GET /it/employees` lists only `role=EMPLOYEE` rows, `dept=`/`q=` filters work — exercised via `createEmployee` helper + list assertions across tests
- [x] `POST /it/employees`: creates an operational staff account with normalized unique mobile + mandatory 2FA, argon2 hash and selected permissions (design's implicit `dashboard`/`cartable` tags intentionally not carried over — see docs/API.md note); duplicate username/mobile → 409, invalid mobile or password &lt;6 chars → 400, audited (ACCOUNT) — covered by `it-manager.e2e-spec.ts`
- [x] `GET /it/employees/:id` returns granted + available permissions; non-IT role → 403 — `'GET/PATCH /it/employees/:id and non-IT role gets 403 everywhere'`
- [x] `PATCH /it/employees/:id/status` suspends/reactivates, audited (ACCOUNT) — `'PATCH /it/employees/:id/status suspends and reactivates, audited'`
- [x] `PATCH /it/employees/:id/permissions` grants/revokes one key idempotently, wrong-dept key → 400, audited (ACCESS) — `'PATCH /it/employees/:id/permissions grants/revokes idempotently, unknown key for dept -> 400, audited'`
- [x] `POST /it/employees/:id/reset-password` returns the temp password once, sets `mustChangePassword`, records `PasswordResetEvent`, audited (ACCOUNT); hash actually replaced — `'POST /it/employees/:id/reset-password returns a temp password once, replaces the hash, sets mustChangePassword, audited'`
- [x] All employee endpoints: non-`IT_MANAGER` role → 403 — `'a non-IT_MANAGER role gets 403 on every /it/* endpoint'`

### Security
- [x] `GET /it/security/policy` auto-creates the singleton with design defaults on first read — `'GET /it/security/policy auto-creates the singleton; PATCH updates a subset, audited'`
- [x] `PATCH /it/security/policy` updates a subset of fields, audited (SECURITY) — same test
- [x] `GET /it/security/sessions` lists only non-revoked/non-expired `RefreshToken`s with user+device+ip — `'GET /it/security/sessions lists active sessions; logout-all revokes them and breaks refresh'`
- [x] `POST /it/security/sessions/logout-all` revokes every active session, audited (SECURITY); no active session survives — same test

### Services
- [x] `GET /it/services` returns seeded internal+external lists; `apiKeyEncrypted` never returned in plaintext — `'GET /it/services returns seeded lists; apiKey never returned in plaintext'`
- [x] `PATCH /it/services/internal/:key` toggles enabled, audited (SYSTEM); unknown key → 404 — `'PATCH /it/services/internal/:key toggles; unknown key -> 404; audited'`
- [x] `GET /it/services/internal/:key/report` and `GET /it/services/external/:id/report` return only real persisted audit events for the selected service with server-side pagination (five rows requested by the UI) — `'GET /it/services/internal/:key/report returns real audit events in pages of five'` + `ServicesPage.test.tsx`
- [x] `POST /it/services/external` creates with encrypted API key; `PATCH`/`DELETE` update/remove — `'external service CRUD: create with encrypted key, update, delete'`
- [x] `POST /it/services/external/:id/test` performs a real HTTP check and persists `lastTestAt/lastTestOk/lastTestMessage` — proven against an unreachable endpoint (no fabricated success) — `'POST /it/services/external/:id/test performs a real check and never fabricates success'`

### Backups
- [x] `POST /it/backups` creates a `BackupRecord`, invokes real `pg_dump`, ends in `SUCCESS` or `FAILED` (never left `RUNNING`) — `'POST /it/backups creates a record ending in a terminal status (never left RUNNING)'`
- [x] `GET /it/backups` lists newest-first — same test
- [x] `GET /it/backups/schedule` returns the static cron description — same test
- [x] All backups endpoints: non-`IT_MANAGER` → 403 — covered by the blanket 403 test

### Dashboard
- [x] `GET /it/dashboard` KPIs reconcile with employees/services counts; `resources` are real `os.*` values, not random — `'GET /it/dashboard reconciles KPIs with employees/services and uses real host metrics'`
- [x] `recentEvents` pulls real `AuditLog` rows — same test

### Logs & Panel access
- [x] IT panel's لاگ و رویدادها tab renders real `GET /audit/logs` records in the five-column dark table and fixes the UI page size at exactly five records — `LogsPage.test.tsx: 'renders exactly five log records per page'`; endpoint remains covered by `audit.e2e-spec.ts`
- [x] دسترسی به پنل‌ها renders the design-aligned dark, read-only access-card grid for `IT_MANAGER`; authority to enable/disable panels remains with CEO — `PanelsAccessPage.test.tsx: 'IT_MANAGER gets the read-only card grid view'`

### Frontend
- [x] داشبورد فنی: KPI cards, service-health list, resource bars, recent events — `ItDashboardPage.test.tsx`
- [x] کاربران و دسترسی‌ها: the complete create-employee form is inline in the page (identity, username/password, rank, referral scope, organizational unit and permission catalogue), followed by the account list and password/access controls; successful creation still reveals the generated credentials once — `EmployeesPage.test.tsx`
- [x] رمزها و امنیت: policy toggles, params card, active-sessions list, «خروج همه» confirmation dialog — `SecurityPage.test.tsx` (2 tests)
- [x] سرویس‌های سایت: internal toggle grid, external create/delete/test + result banner; reports are opened explicitly per service and show real persisted audit events with exactly five records per page — `ServicesPage.test.tsx: 'loads the selected service report with exactly five real records per page'`
- [x] Role isolation: no other role sees these nav entries; direct API calls from another role → 403 — `it-manager-journey.spec.ts: 'Non-IT role has no IT-panel nav entries'` + backend blanket-403 test

### Phase 28 — external-service «تنظیمات» edit modal
- [x] سرویس‌های سایت: each external service card's «تنظیمات» button opens a modal pre-filled with its current نام سرویس/Endpoint/متد/مهلت اتصال, editable and saved via the already-tested `PATCH /it/services/external/:id`; leaving کلید احراز blank keeps the existing key (never re-sent), typing a new one replaces it; empty نام سرویس/Endpoint is rejected client-side without calling the API — `ServicesPage.test.tsx: 'تنظیمات modal pre-fills current values and saves without an apiKey field when left blank'` + `'تنظیمات modal sends a new apiKey only when the operator typed one'` + `'تنظیمات modal rejects an empty required field without calling the API'`

### Phase 31 — EMPLOYEE narrow access to the IT-dept permission keys

Backend-only (no design page body exists for any of the 4 EMPLOYEE-facing
IT tabs — see docs/API.md's Phase 31 section for the full reasoning and
narrow-scope decisions). Proven by
`backend/test/phase31-employee-it-dept-permissions.e2e-spec.ts` (11 tests).

- [x] `us_manage`: EMPLOYEE can list/view employees of their OWN dept only (query-string dept spoofing is ignored server-side) — `'an employee freshly granted us_manage can list/view employees of their OWN dept only, and cannot list without it'`
- [x] Without `us_manage`, `GET /it/employees` is 403 — `'without us_manage, GET /it/employees is 403'`
- [x] `us_manage` never unlocks create/suspend/grant-permissions — those stay `IT_MANAGER`-only — `'us_manage never unlocks create/suspend/grant-permissions — only IT_MANAGER can'`
- [x] `us_manage` can reset a same-dept colleague's password, but never their own, and never another dept's — `'us_manage can reset a same-dept colleague's password, but never their own, and never another dept's'`
- [x] `sv_control`: EMPLOYEE can view `GET /it/services` but not toggle/create/delete/test — `'an employee freshly granted sv_control can view services but not toggle/create/delete/test them'`
- [x] Without `sv_control`, `GET /it/services` is 403 — `'without sv_control, GET /it/services is 403'`
- [x] `sc_manage`: EMPLOYEE can view `GET /it/security/policy` but not `/sessions`, cannot update the policy, cannot force-logout everyone — `'an employee freshly granted sc_manage can view the security policy but not sessions, update the policy, or force-logout everyone'`
- [x] Without `sc_manage`, `GET /it/security/policy` is 403 — `'without sc_manage, GET /it/security/policy is 403'`
- [x] `lg_view`: EMPLOYEE can read `GET /audit/logs` — `'an employee freshly granted lg_view can read the system event log'`
- [x] Without `lg_view`, `GET /audit/logs` is 403 — `'without lg_view, GET /audit/logs is 403'`
- [x] `IT_MANAGER` access is unaffected by these narrow EMPLOYEE grants — `"doesn't affect IT_MANAGER: still has full access despite EMPLOYEE now holding narrow grants"`

### Phase 37 — سامانه پیامک (SMS) log frontend closure

`GET /it/services/sms-log` (Phase 14, `IT_MANAGER`) shipped fully
implemented and e2e-tested — `{ enabled, todaySuccessCount,
todayFailedCount, recent: [...] }`, phone numbers already masked at the
service layer — but `ServicesPage.tsx` never rendered it, found via the
same endpoint-vs-frontend-caller audit as Phases 35/36. The design
reference's IT panel only shows the "sms" row in the internal-services
toggle grid (already built since Phase 8) — it has no separate delivery-
log screen — so this is a new card below that grid, not a redesign.

- [x] «سرویس‌های سایت» shows a «سامانه پیامک (SMS)» card: enabled state,
      today's success/fail counts, and the 50 most recent messages
      (masked phone, message-type label, status, failure reason when
      failed, Jalali timestamp) — `ServicesPage.test.tsx: 'shows the real
      SMS log: today counts, enabled state, and recent messages'`
- [x] The section simply doesn't render if the fetch fails, rather than
      breaking the rest of the page — `ServicesPage.test.tsx: 'does not
      render the SMS log section when it fails to load'`

### Phase IT-panel gaps (design alignment — 2026-07-31)
- [x] Nav order: survey before backup — `panel-nav.config.ts`
- [x] Sidebar badge on «لاگ و رویدادها» (7-day count) — `PanelShell.tsx` + `GET /audit/logs/badge-count`
- [x] داشبورد فنی: design KPIs, clickable cards, health badge, CPU/RAM/disk bars — `ItDashboardPage.test.tsx`
- [x] کاربران: 6-col table, referral scope, rank picker, perm matrix, pw quick-reset, IT scope — `EmployeesPage.test.tsx`
- [x] دسترسی پنل‌ها: IT card grid (read-only) — `PanelsAccessPage.test.tsx`
- [x] لاگ: 5-column table with actor/unit/level — `LogsPage.test.tsx` + `audit.e2e-spec.ts`
- [x] سرویس‌ها: confirm dialog on toggle, external enable switch, summary cards — `ServicesPage.test.tsx`

### Phase IT-panel low-priority gaps (design alignment — 2026-07-31)
- [x] Suspend confirmation dialog before deactivating an employee — `EmployeesPage.test.tsx: 'shows suspend confirmation before deactivating an employee'` + `it-manager-journey.spec.ts`
- [x] Custom organizational unit in add-user form («+ ایجاد واحد سازمانی جدید») — `EmployeesPage.test.tsx: 'creates a custom organizational unit in the add-user form'`
- [x] Dashboard bandwidth resource bar (Linux `/proc/net/dev` sampling) — `ItDashboardPage.test.tsx` + `dashboard.service.ts`
- [x] Survey config two-column layout with star ratings and route labels on recent responses — `SurveyConfigPage.test.tsx` + `survey.service.ts`

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
