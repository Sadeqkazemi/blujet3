# Feature: پنل آژانس — Profile & Documents tab real i18n

Eighteenth page-set of the arc, sixth agency-portal page.
`AgencyProfilePage.tsx` renders the agency's registered info fields, a
document-upload form, and the uploaded-documents list — all from real
`agency-portal` endpoints (no mock data).

Field labels and document-status wording match
`design-reference-v2/پنل آژانس.dc.html`'s own `isEN` `profileFields`/
`documents` sample data for this exact tab (CEO, License number, City,
Phone, Email, Partnership type; Approved/Pending/Rejected); AR has no
counterpart there and is hand-translated.

## Acceptance checklist

- [x] Heading, subtitle, loading/error states, and all 6 agency-info
      field labels render in fa/en/ar — `AgencyProfilePage.test.tsx` ›
      "renders translated headings, field labels, and document status in
      English" + "...in Arabic"
- [x] The partnership-type value (`"{tier} Partner Agency"` in en vs.
      `"آژانس همکار {tier}"` in fa, reflecting each language's natural
      word order) renders correctly per locale — same two new tests
- [x] The document-upload form (type select options, upload button/busy
      state, no-file-selected/error fallback) translates per locale
      — implemented
- [x] The submitted-documents list (document-type labels, status badges,
      empty state) translates per locale — same two new tests
- [x] The pre-existing test passes unmodified — the byte-critical fa
      status string `'در انتظار بررسی'` stays byte-identical
      — `AgencyProfilePage.test.tsx` (original test, unchanged)

## Notes

This page keeps its own local tier/document-type/status label maps
rather than translating the shared
`frontend/src/features/agencies/agency-labels.ts` module, which the
staff-side `AgencyDetailPage.tsx` depends on and which stays
Persian-only (staff panels aren't locale-switchable per CLAUDE.md) —
same reasoning already applied in Phase 55's `AgencyCreditPage`.

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. The remaining
agency-portal pages (Seats, Webservice) remain separate future work.
