# Active sessions (نشست‌های فعال) — acceptance checklist

Design: `design-reference-v2/پنل کاربر.dc.html` → security tab `sessions`.

## Backend
- [x] `GET /my/sessions` — USER only; lists non-revoked/non-expired own `RefreshToken` rows with `{ id, deviceLabel, ip, createdAt, isCurrent }`; `isCurrent` derived from refresh cookie — `my-sessions.e2e-spec.ts`
- [x] `DELETE /my/sessions/:id` — revokes other device; 403 for current session; 404 for others' rows — `my-sessions.e2e-spec.ts`
- [x] Staff roles get 403 on `/my/sessions` — `my-sessions.e2e-spec.ts`

## Frontend
- [x] `AccountPage` security tab lists devices with current badge + end-session for others — `AccountPage.test.tsx`
- [x] End session calls API and removes row from list — `AccountPage.test.tsx`

## Explicitly deferred
- 2FA toggle on security tab (staff-only pattern today; no customer 2FA backend).
- Geo-IP city labels (design shows «تهران» — we show IP until a geo provider exists).
