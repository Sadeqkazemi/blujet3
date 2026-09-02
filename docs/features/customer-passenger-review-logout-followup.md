# Customer passenger, review, and logout follow-up

## Acceptance checklist

- [x] The add/edit saved-passenger dialog stays inside the viewport.
- [x] Passenger fields reflow into a responsive two-column layout on desktop
  and a single column on narrow screens.
- [x] The field area scrolls independently while the modal header and action
  bar stay visible.
- [x] National ID/passport content is centered directly under the Document
  heading and remains separate from birth date.
- [x] Confirming customer logout closes the alert immediately.
- [x] A failed server-side logout/revocation call cannot leave the alert open
  or keep the local browser session authenticated.

## Regression coverage

- `frontend/src/features/public-site/AccountPage.test.tsx`
- `frontend/src/features/public-site/checkout/ReviewStep.test.tsx`
- `frontend/src/components/public/PublicHeader.test.tsx`
- `frontend/src/features/public-site/account/AccountSidebar.test.tsx`

This change is intentionally local and must not be committed, pushed, merged,
or deployed until the user explicitly approves it after local review.
