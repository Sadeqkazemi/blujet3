# Feature: صفحه تعمیر و نگهداری real i18n

Twenty-second page-set of the arc. `MaintenancePage.tsx` is a small,
standalone static page (badge, heading, body copy, ETA notice,
support-contact footer) served manually during planned downtime — not
part of the excluded checkout/payment flow.

`design-reference/در حال تعمیر و نگهداری.dc.html` has no `isEN`/`isAR`
sample data for this page, so all English and Arabic text is
hand-translated. The phone number keeps its Persian-digit literal in
every locale, matching the convention already established on
`SupportPage.tsx`'s direct-contact card (Phase 46).

This page had no test file before this phase — one was created from
scratch.

## Acceptance checklist

- [x] Badge, heading, body copy, and ETA notice render in fa/en/ar —
      `MaintenancePage.test.tsx` › "renders the Persian maintenance
      notice by default" + "renders translated maintenance notice in
      English" + "...in Arabic"
- [x] The wrapping `dir` attribute is locale-aware (`ltr` for en, `rtl`
      otherwise), matching the pattern from Phase 53/Phase 61
- [x] The support phone number and email stay unchanged (Persian-digit
      literal, LTR span) in every locale — unchanged from the original
      implementation

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
