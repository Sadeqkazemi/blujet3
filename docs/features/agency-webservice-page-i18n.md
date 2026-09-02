# Feature: پنل آژانس — Web Service (B2B API) tab real i18n

Twentieth page-set of the arc, eighth and final agency-portal page.
`AgencyWebservicePage.tsx` renders the real webservice purchase flow
(scope + duration plan selection, request submission, pending/rejected
states, and the active-connection summary) — all from real
`agency-portal` endpoints (no mock data). This completes the
agency-portal i18n arc started in Phase 53.

Several strings — the info banner, pending-request title/badge, new-
purchase title/subtitle, type/duration/payable labels, submit label, and
active-connection title/badge/base-URL label — match
`design-reference-v2/پنل آژانس.dc.html`'s own `isEN` vocabulary for this
exact tab (`wsInfoBanner`, `wsPendingTitle`, `wsPendingBadge`,
`wsNewPurchaseTitle`, `wsNewPurchaseSub`, `wsTypeLabel`,
`wsDurationLabel`, `wsPayableLabel`, `wsSubmitLabel`, `wsActiveTitle`,
`wsActiveBadge`, `wsBaseUrlLabel2`), several with an exact 1:1 fa string
match. The real scope names (`SEARCH_BOOK`/`FULL`/`SEARCH_ONLY`), the
1/3/12-month plan durations, and the "access key sent via correspondence"
wording have no design counterpart (the design mock uses different
sample scopes/durations and shows the raw key, which this real
implementation never does per its own code comment), so those and all
AR text are hand-translated.

## Acceptance checklist

- [x] Info banner, pending-request card (title/subtitle/badge), and error
      fallbacks render in fa/en/ar — pre-existing fa tests pass
      unmodified + `AgencyWebservicePage.test.tsx` › "renders translated
      pending state and rejected notice in Arabic"
- [x] New-purchase card (title/subtitle, scope toggle, duration plans,
      payable amount, submit button) renders in fa/en/ar —
      `AgencyWebservicePage.test.tsx` › "renders translated headings,
      scope labels, and active connection info in English"
- [x] Rejected-request notice renders in fa/en/ar — same English test +
      pre-existing fa test "shows a rejected notice and still allows a
      new request" (unmodified)
- [x] Active-connection card (title, badge, base URL, access-scope label,
      key notice, activated-at) renders in fa/en/ar, and the scope label
      correctly covers the legacy `SEARCH_ONLY` key scope in addition to
      `SEARCH_BOOK`/`FULL` — same two new tests
- [x] Toman amounts keep Persian-digit formatting in every locale, only
      the currency word ("تومان"/"Toman"/"تومان") changes, matching the
      established money-display convention from `AgencyCreditPage.tsx` —
      unchanged plan/price strings, verified by the pre-existing fa tests
      still passing
- [x] All 4 pre-existing tests pass unmodified — byte-critical fa strings
      (`'آخرین درخواست شما رد شد'` substring match, `'فروش کامل (صدور
      بلیط)'` scope label) stay byte-identical —
      `AgencyWebservicePage.test.tsx` (all 4 original tests, unchanged)

## Notes

This is the last page of the 8-page agency-portal i18n arc (Shell+Login,
Dashboard, Credit, Sales, Inbox, Profile, Seats, Webservice — Phases
53–60). The scope label map (`SCOPE_LABEL`) is page-local, same pattern
as every other agency-portal page in this arc.

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
