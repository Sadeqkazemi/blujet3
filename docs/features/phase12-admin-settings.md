# Feature: Phase 12 — مدیران و ادمین‌ها، امنیت و رمز عبور، تنظیمات سامانه، لاگ مدیر عامل، دسترسی پنل‌های IT

Covers `docs/API.md` → "Phase 12" and `docs/DB_SCHEMA.md` → "Phase 12".
Tabs unlocked: `admins` (CEO/Chair/Senior), `security` (CEO/Senior — IT
already had its own), `logs` (CEO — IT already had its own), `settings`
(Chair/IT), `panels` (IT read-only — CEO/Senior already had it).

## Acceptance checklist

Backend items proven by `backend/test/phase12.e2e-spec.ts` (9 tests, 178
total); frontend by the new `*.test.tsx` files (7 tests, 95 total); E2E by
`frontend/e2e/phase12-journey.spec.ts` (5 journeys).

### Frontend — admins (CEO design alignment)
- [x] Dark list card matching `پنل مدیر عامل`: title/sub, avatar rows, role pills, status dots, empty copy `هنوز اطلاعاتی وارد نشده است.` — `AdminsPage.test.tsx`
- [x] Add button lives in the card header; add modal uses dark chrome + generate-password — `AdminsPage.test.tsx`

### Backend — admins
- [x] `GET /admins`: hierarchy scoping + real online derivation + 403 — `'GET /admins: hierarchy scoping — Senior never gets a manageable SENIOR_MANAGER row; roles without the tab get 403'`
- [x] `POST /admins`: real staff account that can actually log in; 409 duplicate — `'POST /admins creates a real staff account that can log in; duplicate username → 409'`
- [x] `PATCH /admins/:id/block|unblock`: really flips `User.isActive` (blocked login 403s); never self/CEO — `'block really disables staff login; unblock restores it; blocking a CEO/self is forbidden'`
- [x] `POST /admins/:id/reset-password`: temp password logs in; hierarchy enforced — `'POST /admins/:id/reset-password returns a temp password once that actually logs in; Senior cannot reset a SENIOR_MANAGER'`

### Backend — own password, CEO logs, settings
- [x] `POST /auth/change-password` — `'POST /auth/change-password: wrong current password → 401; success rotates the hash both ways'`
- [x] `GET /audit/system-events` — `'GET /audit/system-events: CEO gets real rows with the level mapping; others 403'`
- [x] `GET /settings` + `PATCH /settings` round-trip, unknown keys rejected, finance 403 — `'settings round-trip: defaults come back, a patch persists, unknown keys are rejected; finance 403'`
- [x] `PATCH /settings/refund-rules` writes the REAL Phase 7 rows (verified in the DB table the engine reads), IT-only — `'PATCH /settings/refund-rules writes the REAL Phase 7 engine rows (IT only; chair 403)'`
- [x] `GET /panels/access` readable by IT, PATCH still 403 — `'IT_MANAGER can read /panels/access but PATCH stays 403'`

### Frontend
- [x] AdminsPage: list + real status + detail with block/reset + validated add-admin modal — `AdminsPage.test.tsx` (2 tests)
- [x] SecurityRouter → OwnSecurityPage: confirm-mismatch validation, real change call, managed reset with one-time temp password — `OwnSecurityPage.test.tsx` (2 tests); IT keeps its Phase 8 page (router branch)
- [x] LogsRouter → CeoLogsPage: real rows + level chips — `CeoLogsPage.test.tsx`
- [x] SettingsPage: IT owns company/gateway/refund + global toggles; SITE_ADMIN site chrome — `SettingsPage.test.tsx`
- [x] PanelsAccessPage read-only for IT — `'IT_MANAGER gets the read-only view: informational copy + disabled switches'`
- [x] nav flags flipped — **every tab in every panel now reads `implemented: true`; the «به‌زودی» placeholder no longer appears anywhere in any sidebar**

### Tests
- [x] Backend e2e — the 9 tests above
- [x] Frontend unit — the 7 tests above
- [x] Playwright — `'CEO admins journey: list with real status → open detail → block → unblock'`, `'Senior changes their own password and reverts it'`, `'CEO opens لاگ و رویدادها…'`, `'IT saves تنظیمات سامانه (toggle round-trip persists across reload)'`, `'IT opens دسترسی به پنل‌ها read-only'`

## Deferred (scoped out with reasons, not silently dropped)
- Per-admin permission toggle matrix — would be stored-but-unenforced (violates «never by hiding UI alone») or requires a dynamic-authorization redesign; open item.
- «نقش سفارشی…» free-text role — no enum/authorization backing.
- Site-logo upload (IT settings) — public-site asset with no public site in this track to render it.
- Chair panel's PROFILE & SECURITY section — orphaned (no nav entry reaches it).
- SMS/email delivery of credentials — goes through the existing mocked provider path in dev, same as OTP.
