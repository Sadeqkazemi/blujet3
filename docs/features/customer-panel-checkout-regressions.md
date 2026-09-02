# Customer panel and checkout regressions

## Acceptance checklist

- [x] Expanding one agency seat-route card renders its inquiry/request controls inside that card only; sibling flight cards remain independent.
- [x] The Saman customer-number field in the loans tab has a full-size labelled control and remains accessible on narrow screens.
- [x] Selecting "Saman Bank customer" in the club tab reveals the customer-number form, submits eligibility through the loans API, and shows a localized success/pending message.
- [x] A signed-in customer can upload one PDF/PNG/JPG attachment (maximum 5 MB) while creating a support ticket; the attachment is persisted and returned with the ticket.
- [x] The account security/password view uses a responsive full-width card, clear password requirements, and preserves the existing password/session/privacy actions.
- [x] Both USER and AGENCY identities can create, read, and pay their own checkout bookings; ownership checks continue to prevent cross-account access.

## Regression coverage

- [x] Frontend component tests cover selected-card containment, loan feedback, ticket attachment upload, and the redesigned security form.
- [x] Backend tests cover support-ticket attachment ownership and USER/AGENCY booking authorization.
- [x] Targeted tests, lint/type checks, and production builds pass.
- [ ] The corrected flows are verified locally in the browser.
