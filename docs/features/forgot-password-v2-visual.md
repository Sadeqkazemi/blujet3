# Forgot-password v2 visual parity

Scope: visual redesign of `/forgot-password` to match
`design-reference-v2/فراموشی رمز.dc.html`. **No backend changes** — Phase 51
(phone + email reset paths) remains the functional source of truth.

## Product constraints (unchanged)

- Phone **and** email recovery toggles are offered in **every locale** (fa/en/ar).
  The design bundle splits EN=email-only vs FA=phone-only; we deliberately keep
  both paths everywhere because account recovery must not depend on UI language.
- OTP is **6 digits** (backend `TwoFactorChallenge`), not the design mock's 5.

## Acceptance checklist

| # | Behavior | Test |
|---|----------|------|
| 1 | Two-column 960px card with gradient visual panel on desktop | `ForgotPasswordPage.test.tsx` — visual panel + stepper present |
| 2 | Visual panel hidden below 768px (`matchMedia`) | Manual / responsive — deferred to Playwright visual pass |
| 3 | Header: logo, locale switcher (fa→en→ar cycle), back-to-login chip | `fp-lang-switch`, `fp-back-login` testids |
| 4 | Three-step progress stepper with labels | `fp-stepper`, `fp-step-bar-*` |
| 5 | Phone input with +98 prefix and validation hint | send disabled until `09xxxxxxxxx` valid |
| 6 | Email path with method toggle in all locales | email walkthrough test |
| 7 | Six OTP cells, LTR, auto-advance | `typeOtp` helper + verify calls |
| 8 | Edit identifier link on code step | `fp-edit-id` |
| 9 | Resend countdown (120s) | existing timer logic |
| 10 | Password strength meter (3 bars) + inline mismatch on confirm | strength label test |
| 11 | Secure footer note (green dot) | `fp-secure-note` |
| 12 | Done state with sign-in CTA | phone + email walkthrough tests |
| 13 | Full phone flow: OTP verify → set-password → sign-out | phone walkthrough test |
| 14 | Error surfaces from API (wrong OTP) | wrong OTP test |
| 15 | fa/en/ar string coverage | English + Arabic label tests |

## Deferred (explicit)

- Toast modal notifications from the design prototype (we use inline error
  banners + existing API messages instead).
- `Picture1.png` aircraft asset — replaced with inline SVG + float animation
  because the asset is not in `frontend/public/`.
- Playwright pixel-diff against the exported HTML (follow-up with customer
  login v2 track).

## Files touched

- `frontend/src/features/auth/ForgotPasswordPage.tsx`
- `frontend/src/features/auth/ForgotPasswordPage.test.tsx`
- `docs/features/forgot-password-v2-visual.md`
- `PLAN.md`
