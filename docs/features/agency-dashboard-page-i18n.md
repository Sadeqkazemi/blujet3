# Feature: پنل آژانس — Dashboard tab real i18n

Fourteenth page-set of the arc, second agency-portal page (after Phase
53's shell/login foundation). `AgencyDashboardPage.tsx` renders 4 real
KPI cards, a 6-month sales bar chart, and a credit summary — all from
`GET /agency-portal/dashboard` (no mock data).

Most of this page's strings have no usable match in
`design-reference-v2/پنل آژانس.dc.html`'s `isEN`/`isAR` ternaries (which
cover the shell's nav labels but not this page's specific KPI/credit
copy), so they're hand-translated. The one exception is the Jalali month
labels on the sales chart: `design-reference-v2/وضعیت پرواز.dc.html`
already establishes real romanized month names for EN
(`MONTHS_EN: ["Farvardin", "Ordibehesht", ...]`) and, notably, its own
`MONTHS_AR` is identical to the Persian names verbatim — there is no
separate Arabic name for a Jalali month, the same reasoning already
applied to "تومان" staying the same word in Arabic elsewhere in this
app. Both are reused here for consistency.

## Acceptance checklist

- [x] Heading, subtitle, loading/error states, and all 4 KPI card labels
      render in fa/en/ar — `AgencyDashboardPage.test.tsx` › "renders
      translated headings and KPI labels in English" + "...in Arabic"
- [x] The 6-month sales chart's month labels and its `role="img"`
      aria-label translate per locale, including the Jalali month
      romanization (e.g. "Ordibehesht") — same two new tests
- [x] The credit summary card (limit/used/remaining) translates per
      locale; the toman currency word stays `'تومان'`/`'Toman'`/`'تومان'`
      in every locale, consistent with the pricing-honesty rule from
      earlier phases — implemented
- [x] The pre-existing test passes unmodified — the byte-critical fa
      heading `'داشبورد'` and chart aria-label
      `'نمودار فروش ۶ ماه اخیر'` stay byte-identical
      — `AgencyDashboardPage.test.tsx` (original test, unchanged)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. The remaining
agency-portal pages (Credit, Sales, Inbox, Profile, Seats, Webservice)
remain separate future work.
