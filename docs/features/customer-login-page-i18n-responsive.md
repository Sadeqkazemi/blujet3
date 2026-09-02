# Feature: ورود و ثبت‌نام مشتریان (CustomerLoginPage) — design card

Customer-only sign-in/sign-up rebuilt to match the uploaded
`ورود و ثبتنام.html` / screenshot (split card, visual panel, header pills).
Agency entry is a header link to `/agency/login` (not an in-page segment).
Staff login stays at `/login`.

Real auth remains phone + **6-digit** OTP (API). Design mock uses 5-digit
OTP / Google on EN — Google is out of scope; digit count follows the API.

## Acceptance checklist

- [x] Standalone centered card (no public header/footer shell), split
      form + visual panel on desktop; visual hidden on mobile
      — visual QA screenshot `customer-signin-design.png`
- [x] Header: logo → `/`, locale cycle, «فراموشی رمز» → `/forgot-password`,
      «ورود آژانس همکار» → `/agency/login`
      — `PublicMockPages.test.tsx`
- [x] Login / Sign-up tabs only (no کاربر/آژانس segment)
      — `PublicMockPages.test.tsx` asserts `signin-acct-agency` absent
- [x] Phone field with `+98` prefix, validation hint, send-code CTA
- [x] OTP phase: 6 cells, resend countdown, edit number, confirm
      — `PublicMockPages.test.tsx` › OTP flow
- [x] Signup requires name + terms before send
      — `PublicMockPages.test.tsx` › signup tab test
- [x] fa / en / ar strings for tabs, titles, agency/forgot pills
      — English + Arabic tests in `PublicMockPages.test.tsx`
- [x] Secure note + visual title/sub from design bundle
