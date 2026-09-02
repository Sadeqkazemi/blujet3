# Feature: فراموشی رمز — real email password-reset path + i18n

Eleventh page of the per-page translation arc, but unlike Phases 42–50
this one needed real new backend work first, per CLAUDE.md workflow rule
1: a second identity-proof path for password reset via a customer's
VERIFIED email (Phase 17), alongside the existing phone+SMS OTP path
(Phase 21). Offered in **every** locale — restricting a security recovery
method by the page's display language would be an arbitrary, fragile
restriction unrelated to which identifier an account actually has
verified; some fa-locale customers may lack a reachable phone at reset
time, and some en/ar-locale customers may have one.

## Acceptance checklist

- [x] `POST /auth/password-reset/email/request` issues a challenge for a
      `USER`-role account with that exact, verified email; 401 if no such
      account exists; 403 if suspended; 400 on a malformed email
      — `backend/test/phase51-password-reset-email.e2e-spec.ts`
- [x] The request step never creates an account for an arbitrary
      submitted email (unlike phone OTP's find-or-create) — proven by the
      "no account has that verified email" 401 test creating nothing
      — same spec file
- [x] `POST /auth/password-reset/email/verify` accepts only
      `PASSWORD_RESET_EMAIL`-purpose challenges (a `CUSTOMER_OTP_LOGIN`
      challenge id is rejected), enforces the same expiry/attempts/
      already-used rules as `otp/verify`, and on success issues real
      tokens usable against the existing `POST /auth/set-password`
      — same spec file, "verifies the emailed code..." +
      "401s reusing a customer OTP challenge id" tests
- [x] `GET /auth/_test/last-password-reset-email-code/:email` — E2E-only,
      404s when nothing was issued, always 404s in production
      — same spec file
- [x] `ForgotPasswordPage` gains a phone/email identifier toggle at its
      first step; every visible string (heading, subtitles, both method
      labels, both field labels, both send-code error fallbacks, code
      step, password step, done step, back link) renders in fa/en/ar
      — `ForgotPasswordPage.test.tsx` › "renders translated labels and
      the method toggle in English" + "renders translated labels in
      Arabic"
- [x] All 4 pre-existing tests (phone→OTP→password happy path, short
      password, mismatched password, wrong-OTP error) pass unmodified —
      every byte-critical fa string they assert
      (`'رمز عبور باید حداقل ۸ کاراکتر باشد.'`,
      `'تکرار رمز با رمز جدید یکسان نیست.'`, the `'ورود به حساب'` link)
      stays byte-identical
      — `ForgotPasswordPage.test.tsx` (original tests, unchanged)
- [x] The email path drives the exact same `set-password` hand-off as the
      phone path (verify logs the customer in, frontend calls
      `apiSetPassword`, then signs out so they log back in fresh)
      — `ForgotPasswordPage.test.tsx` › "walks the email path..." +
      `phase51-password-reset-email.e2e-spec.ts`'s full-flow test

## Notes

- `useAuth()` gains optional `requestPasswordResetEmail`/
  `verifyPasswordResetEmail`, mirroring the existing optional
  `requestOtp`/`verifyOtp` pattern so every pre-existing mocked
  `AuthContextValue` literal in other test files keeps type-checking
  without change.
- Test emails in the new e2e spec use a `uniqueEmail()` helper
  (`crypto.randomUUID().slice(0, 8)` suffix), matching the existing
  convention in `club.e2e-spec.ts`/`cartable.e2e-spec.ts` — a first pass
  using fixed literal emails hit real `Unique constraint failed` errors
  the second time the suite ran against the persistent test database,
  since (unlike phone OTP's upsert) the email path's `User.create` is not
  idempotent by design.

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. پنل کاربر, پنل آژانس, and
تکمیل خرید/پرداخت remain separate future work.
