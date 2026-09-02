# Feature: پنل آژانس — Allocated Seats tab real i18n

Nineteenth page-set of the arc, seventh agency-portal page.
`AgencySeatsPage.tsx` renders the real per-flight seat allotments from
`GET /agency-portal/allotments` (no mock data): an info banner explaining
where the capacity comes from, and one card per flight showing
Allocated/Sold/Remaining seat counts and an Active/Released badge.

The info banner and the Allocated/Sold/Remaining labels reuse
`design-reference-v2/پنل آژانس.dc.html`'s own `isEN` vocabulary for this
exact tab (`seatsInfoBanner`, `allocatedLabel`, `soldLabel`,
`remainingLabel`); AR has no counterpart there and is hand-translated.

This page previously had no test file at all — one was added from
scratch, covering both the pre-existing (fa) rendering behavior and the
two new locales.

## Acceptance checklist

- [x] The info banner, per-card Active/Released badge, and
      Allocated/Sold/Remaining metric labels render in fa/en/ar —
      `AgencySeatsPage.test.tsx` › "renders real per-flight allotment
      cards with allocated/sold/remaining counts" (fa) + "renders
      translated info banner and labels in English" + "renders
      translated labels in Arabic"
- [x] The empty state (no allotments recorded for the agency) renders in
      fa — `AgencySeatsPage.test.tsx` › "shows the empty state when the
      agency has no allotments"
- [x] The error fallback message is locale-aware (implemented via
      `t.errorFallback` in the fetch `.catch()`)
- [x] Seat counts and flight numbers keep Persian digits / LTR flight-code
      spans regardless of locale — unchanged from the original
      implementation, verified by the fa test still asserting `'۸'`
      (faDigits output) in all locales

## Notes

No shared label map is touched — the Active/Released badge wording is
page-local, matching the pattern already applied to the other
agency-portal pages (Credit, Profile) whose local labels intentionally
duplicate the shared `agency-labels.ts` module rather than translating it,
since that module also backs the still-Persian-only staff-side
`AgencyDetailPage.tsx`.

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. The remaining
agency-portal page (Webservice) remains separate future work.
