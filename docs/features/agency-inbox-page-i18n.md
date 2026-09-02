# Feature: پنل آژانس — Inbox & Messages tab real i18n

Seventeenth page-set of the arc, fifth agency-portal page.
`AgencyInboxPage.tsx` renders a real message thread and a compose form —
backed by the real `agency-portal` inbox endpoints (no mock data). Most
strings reuse `design-reference-v2/پنل آژانس.dc.html`'s own `isEN`
vocabulary for this exact tab (`inboxTitle`, `replyPlaceholder`,
`sendReplyLabel`, `noMessagesLabel`); AR has no counterpart there and is
hand-translated.

## Acceptance checklist

- [x] Heading, subtitle, loading/error states, empty-thread state, and
      the "You"/"blujet" sender labels render in fa/en/ar —
      `AgencyInboxPage.test.tsx` › "renders translated heading,
      placeholder, and send button in English" + "...empty state in
      Arabic"
- [x] The compose form's placeholder and send button translate per
      locale — same two new tests
- [x] The pre-existing test passes unmodified — the byte-critical fa
      strings it asserts stay byte-identical: the
      `'پیام خود را بنویسید…'` placeholder and the `'ارسال'` button
      — `AgencyInboxPage.test.tsx` (original test, unchanged)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. The remaining
agency-portal pages (Profile, Seats, Webservice) remain separate future
work.
