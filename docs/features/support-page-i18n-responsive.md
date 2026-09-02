# Feature: پشتیبانی (Support) — real i18n + responsive body content

Sixth page of the per-page translation arc (after the shared shell,
صفحه اصلی, نتایج پرواز, مقاصد, and باشگاه مشتریان). Every en/ar string was
extracted from `design-reference-v2/پشتیبانی.dc.html`'s own `isEN`
ternaries — this page's mock fa strings matched the real app's shipped
content exactly, word for word, so nothing needed realigning — and
`site-data.js`'s `arDeep` dictionary, which had complete coverage for
every FAQ question/answer, category card, and UI label on this page.

## Acceptance checklist

- [x] Hero (title/description/search box), the four category cards, all
      five FAQ question/answers, the ticket form (labels, placeholders,
      subject dropdown, sent-confirmation state), and the three
      direct-contact cards render in fa/en/ar
      — `PublicInfoPages.test.tsx` › "renders translated FAQ and category
      cards in English, and submits the canonical Persian subject
      regardless of locale" + "renders translated FAQ and category cards
      in Arabic"
- [x] Both pre-existing `SupportPage` tests (FAQ accordion toggle, real
      ticket submission with tracking code) pass unmodified — fa strings
      byte-identical to before this phase
      — `PublicInfoPages.test.tsx` (original `describe('SupportPage')`
      tests, unchanged)
- [x] The ticket `subject` field submitted to the real backend always
      stays the canonical Persian string (`SUBJECTS`), regardless of the
      active display locale — only the dropdown's visible label
      translates via a separate `SUBJECT_LABELS` map. Staff view tickets
      in the Persian-only admin queue, so introducing English/Arabic
      subject text into stored tickets would be a real regression, not
      just a display nicety
      — `PublicInfoPages.test.tsx` › the English test asserts
      `submit` was called with `subject: 'استرداد و تغییر بلیط'` even
      though the page is rendered in `en`
- [x] FAQ search matches against the active locale's question/answer text
      (not always Persian) — implemented in the `visibleFaqs` filter;
      not separately tested beyond the existing Persian-locale FAQ-toggle
      test (same filter logic, only the compared field changed)
- [x] Category-card grid (4→2 cols) and the two-column FAQ/contact layout
      (side-by-side → stacked) collapse on mobile via the shared
      `useIsMobile()` hook — implemented; not separately unit-tested
      beyond the existing `useIsMobile` hook tests (same boolean, no new
      branch logic beyond grid-template/flex-direction swaps)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. تکمیل خرید/پرداخت and the
remaining public/user/agency pages are separate future work.
