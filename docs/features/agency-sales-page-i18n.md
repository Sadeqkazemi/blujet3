# Feature: پنل آژانس — Sales & Reports tab real i18n

Sixteenth page-set of the arc, fourth agency-portal page.
`AgencySalesPage.tsx` renders 4 real sales KPIs, a per-flight sales
breakdown table, and an issued-tickets table — all from the real
`GET /agency-portal/sales` endpoint (no mock data).

Heading and KPI labels reuse `design-reference-v2/پنل آژانس.dc.html`'s
own `isEN` vocabulary for this exact tab (`reportKpis`'s "Total sales",
"Tickets issued", "Average fare", "Refund rate", and the "Sales per
flight" section label match our real KPIs/section 1:1); AR has no
counterpart there and is hand-translated. The booking-status labels on
the tickets table are this page's own local map (compact wording distinct
from `AccountPage.tsx`'s `STATUS_LABEL` — e.g. `'رزرو موقت'` here vs
`'در انتظار پرداخت'` there for the same `HELD` status), translated
separately to preserve that distinction rather than force a shared map.

## Acceptance checklist

- [x] Heading, subtitle, loading/error states, and all 4 KPI labels
      render in fa/en/ar — `AgencySalesPage.test.tsx` › "renders
      translated headings, KPI labels, and ticket status in English" +
      "...in Arabic"
- [x] The per-flight table (column headers, empty state) translates per
      locale; the toman currency word stays
      `'تومان'`/`'Toman'`/`'تومان'` — same two new tests
- [x] The issued-tickets table (column headers, empty state, and all 7
      booking-status labels) translates per locale — same two new tests
- [x] The pre-existing test passes unmodified — no byte-critical fa
      assertions beyond the unchanged numeric formatting (`'۷۶٬۰۰۰٬۰۰۰'`)
      — `AgencySalesPage.test.tsx` (original test, unchanged)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. The remaining
agency-portal pages (Inbox, Profile, Seats, Webservice) remain separate
future work.
