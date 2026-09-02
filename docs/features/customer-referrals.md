# Customer invite-friends (معرفی دوستان)

Design: `design-reference-v2/پنل کاربر.dc.html` → `isReferral` tab.

## Acceptance checklist

- [x] `GET /my/referral` — USER only; returns code, sharePath, stats, invites — `customer-referrals.e2e-spec.ts`
- [x] Referral code lazily generated on first GET — `customer-referrals.e2e-spec.ts`
- [x] `POST /auth/otp/request` optional `referralCode` links new signups only — `customer-referrals.e2e-spec.ts`
- [x] Invalid/self/duplicate referral codes ignored at signup — service logic + e2e signup path
- [x] First ticketed booking awards 500 points to referrer club member — `booking.service.ts` hook
- [x] Staff roles get 403 on `/my/referral` — `customer-referrals.e2e-spec.ts`
- [x] Frontend: `AccountReferralTab` hero + KPI + invite list + copy/share — `AccountPage.test.tsx`
