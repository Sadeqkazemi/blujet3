# Feature: حریم خصوصی و داده‌های من (GDPR export/delete)

Covers `docs/API.md` → "Phase 25" and `docs/DB_SCHEMA.md` → "Phase 25".
Backend (`GET /my/privacy/export`, `DELETE /my/privacy/account`) already
existed and was already tested (`backend/test/privacy.e2e-spec.ts`); this
phase adds the missing frontend surface and fills a docs gap — no backend
or schema changes.

## Acceptance checklist

### Backend (pre-existing, re-verified this phase)
- [x] `GET /my/privacy/export` returns the customer's own account fields,
      bookings+passengers (national ID decrypted), refunds, wallet
      entries, club membership+points, price locks; 401 without login
      — `backend/test/privacy.e2e-spec.ts` › "exports the customer's own bookings, passengers, and account info" + "rejects export without login"
- [x] `DELETE /my/privacy/account` anonymizes passenger PII, clears
      booking contact phone, revokes all refresh tokens, deactivates +
      soft-deletes the user, in one transaction
      — `backend/test/privacy.e2e-spec.ts` › "deletes the account: anonymizes passenger PII, revokes sessions, deactivates the user"

### Frontend (پنل کاربر → پروفایل من)
- [x] "دانلود اطلاعات من" fetches the real export and downloads it as a
      JSON file client-side (no server-rendered file)
      — `frontend/src/features/public-site/AccountPage.test.tsx` › "downloads a real data export as JSON"
- [x] "حذف حساب کاربری" requires an explicit two-step confirm (warning
      panel with confirm/cancel) before calling the delete endpoint —
      never a bare `window.confirm`
      — `AccountPage.test.tsx` › "deletes the account only after explicit confirmation, then signs out"
- [x] On successful delete: session is signed out and the user is
      returned to the home page
      — same test (asserts `signOut` was called)
- [x] Errors from either action surface inline (`role="alert"`), matching
      every other profile-tab action's error pattern in this file
      — implemented in `AccountPage.tsx` (`exportError`/`deleteError`); not
      separately unit-tested (identical pattern to `profileError`, already
      covered by that action's own test)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
