# Guest checkout and site-admin workflow recovery

## Acceptance checklist

- [x] A guest opening a legacy `/book/:flightInstanceId` link reaches the
  passenger step instead of being redirected to the standalone sign-in page.
  Proven by `BookPage.test.tsx` — `sends unauthenticated users to the
  passenger-first checkout wizard`.
- [x] The checkout primary action stays disabled until every passenger field,
  document checksum, birth date, and passenger-age rule is valid. Proven by
  `CheckoutPage.test.tsx` — `shows passenger form for guests and opens OTP
  after confirm`.
- [x] After a guest starts entering data, missing/invalid fields remain red and
  show their localized field-level messages. Proven by `CheckoutPage.test.tsx`
  — `keeps a guest on the passenger step and shows field errors before OTP`.
- [x] Completing a valid guest manifest opens the inline OTP login dialog and
  does not discard the passenger step. Proven by `CheckoutPage.test.tsx` —
  `shows passenger form for guests and opens OTP after confirm`.
- [x] The site-admin pending-action KPI routes to the first real non-empty
  queue instead of opening an empty personal cartable. Proven by
  `SiteAdminDashboardPage.test.tsx` — `routes pending actions to tickets when
  the personal cartable and other queues are empty`.
- [x] SITE_ADMIN may send organizational messages from the cartable compose
  dialog. Proven by `cartable.e2e-spec.ts` — `allows the site admin to send an
  organizational message from cartable`.
- [x] A public support ticket is persisted, appears in the SITE_ADMIN ticket
  list, can be forwarded to a valid employee, and can change status. Proven by
  `phase20-contact-support-tickets.e2e-spec.ts` — `SITE_ADMIN lists, views
  detail, forwards, and changes status`.
- [x] High-traffic route creation remains available and submits the real CMS
  API payload. Proven by `MediaAdminPage.test.tsx` — `keeps route creation
  available from site management`.
- [x] A career image is uploaded through `/files` and its returned file id is
  linked to the created posting. Proven by `CareersAdminPage.test.tsx` —
  `uploads an image and links it to the new job posting`.

No schema change or migration is required.
