# Guest checkout, ten-row pagination, and cartable lifecycle

## Acceptance checklist

- [x] The passenger step remains available to a signed-out visitor and renders
      exactly the passenger mix selected during flight search.
- [x] A signed-out visitor cannot use the checkout primary «تأیید و ادامه»
      action. A separate localized sign-in action opens the inline OTP flow,
      while all entered passenger values remain intact.
- [x] After OTP authentication, the primary action becomes available. For a
      newly-created/incomplete USER profile, the first adult passenger becomes
      the account's primary profile identity without overwriting already stored
      profile fields, and is saved once in the passenger address book.
- [x] Checkout profile synchronization failures are surfaced and never create a
      booking with a partially validated passenger manifest.
- [x] Customer trips and every list touched in this phase render at most ten
      rows per page, with accessible previous/next controls for further rows.
- [x] The mobile checkout sticky total/action bar clears the public footer and
      safe-area inset; it does not cover footer content at the end of the page.
- [x] Entering a wallet top-up amount does not move the submit button when the
      amount-in-words helper appears.
- [x] Replying to an internal cartable message handles the incoming row without
      closing the conversation. A separate
      close action archives the complete conversation without deleting history.
- [x] An internal conversation with no activity for four days closes
      automatically and remains visible through the archive/status filter.
- [x] The pricing rejection-dialog submit label is «ثبت درخواست» while the
      underlying audited rejection decision remains unchanged.

## Proof

Automated proof:

- `CheckoutPage.test.tsx`: guest primary action disabled, dedicated OTP action,
  deferred validation, and non-fixed mobile action bar.
- `checkout-guest-profile.test.ts`: fill-only-missing profile synchronization
  and duplicate-safe saved passenger creation.
- `AccountPage.test.tsx`: ten-row trip pagination and stable wallet submit cell.
- `EmployeeCartablePage.test.tsx`: reply and explicit close are separate actions.
- `cartable.e2e-spec.ts`: IT → finance → IT reply loop, explicit conversation
  close with retained history, and four-day automatic archival.
- `PricingPage.test.tsx`: rejection request label and unchanged confirmation.

Verification: 944 frontend tests, 341 backend unit tests, 36 cartable E2E tests,
both production builds, frontend lint, targeted backend lint, `git diff --check`,
and responsive local-browser inspection.
