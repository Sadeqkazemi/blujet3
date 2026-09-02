# Feature: مدیریت رزرو real i18n

Twenty-fourth page-set of the arc. `ManageBookingPage.tsx` is the real
anonymous PNR + last-name self-service page (Phase 19): lookup a booking,
view its details, and submit a real IBAN-based refund. Standalone and
unrelated to the excluded checkout/payment flow (تغییر صندلی/دانلود بلیط
stay disabled per the existing Phase 19 deferral, unaffected by this
phase).

Most labels reuse `design-reference-v2/مدیریت رزرو.dc.html`'s own `isEN`
vocabulary for this exact page: `heroTitle`, `lblPnr`, `lblLastName`,
`lookupBtn`, `noteEmailSms` (fa matches ours verbatim), `hdrPassengers`,
`lblSeat`, `btnRefundTicket`/`btnChangeSeat`/`btnDownloadTicket`,
`hdrRefundSubmitted`, `lblPenalty`/`lblRefundAmount`,
`btnConfirmRefund`/`btnCancel`, `linkSearchAnother`. That design file only
has an `isEN` toggle (no Arabic sample data anywhere), so all Arabic text
on this page is hand-translated fresh. The cabin label reuses the
`CABIN_LABEL` map convention already established in `ResultsPage.tsx`
(Phase 43), duplicated locally per this arc's page-local-map convention.

The raw `booking.status` value (e.g. `'TICKETED'`) is displayed verbatim
in the three-column summary in every locale, same as the pre-existing fa
behavior — this is a pre-existing gap unrelated to i18n scope, not
something this phase introduces or fixes.

## Acceptance checklist

- [x] Hero title/subtitle, lookup form (labels, placeholders, button,
      note, validation/error messages) render in fa/en/ar — pre-existing
      4 fa tests pass unmodified + `ManageBookingPage.test.tsx` ›
      "renders translated heading, labels, and result in English"
- [x] Booking card (cabin label via `CABIN_LABEL`, passengers heading,
      seat label, action buttons with "(coming soon)" suffix) renders in
      fa/en/ar — same English test
- [x] Refund modal (title, subtitle, IBAN label, confirm/cancel buttons)
      and the refund-done summary (heading, subtitle, penalty/refundable
      labels) render in fa/en/ar — same English test (submits a refund
      end-to-end and asserts the translated "Refund request submitted"
      heading)
- [x] Lookup-error and refund-submit-error fallbacks render in fa/en/ar —
      `ManageBookingPage.test.tsx` › "renders translated heading and
      lookup-error message in Arabic"
- [x] All 4 pre-existing tests pass unmodified — byte-critical fa strings
      (`تغییر صندلی`, `دانلود بلیط` button names, `'درخواست استرداد ثبت
      شد'`) stay byte-identical — `ManageBookingPage.test.tsx` (all 4
      original tests, unchanged)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
