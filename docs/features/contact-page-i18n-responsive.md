# Feature: تماس با ما (Contact) — real i18n + responsive body content

Ninth page of the per-page translation arc (after the shared shell,
صفحه اصلی, نتایج پرواز, مقاصد, باشگاه مشتریان, پشتیبانی, قوانین و مقررات,
and درباره ما). EN strings came from `design-reference-v2/تماس با ما.dc.html`'s
own `isEN` ternaries — complete and matching the shipped app's fa content
exactly. Unlike most prior pages, this page's design source has **no**
`isAR` branch for its own content, and `site-data.js`'s `arDeep`
dictionary only covers a couple of generic words here (`ارسال پیام`,
`موضوع`, `متن پیام`) — not the hero, channel labels, or form copy. Every
Arabic string for this page was therefore hand-translated fresh, the same
quality bar as every other phase: real, deliberate, and complete — not a
silent fallback to Persian like the design mock's own Arabic mode would
produce here.

## Acceptance checklist

- [x] Hero (title + subtitle), all four contact-channel cards (phone,
      email, office address, office hours), and the message form (labels,
      placeholders, sent-confirmation state) render in fa/en/ar
      — `ContactPage.test.tsx` › "renders translated hero, channels, and
      form in English" + "renders translated hero and channels in Arabic"
- [x] All 3 pre-existing tests (required-fields gating, real submission
      with the exact payload, real server error message) pass unmodified
      — fa strings byte-identical to before this phase
      — `ContactPage.test.tsx` (original tests, unchanged)
- [x] Hero title assertions use `getByRole('heading', ...)` rather than
      `getByText`, since the shared `PublicFooter`'s "Contact Us"/"اتصل
      بنا" link would otherwise collide with the page's own `<h1>` text
      — `ContactPage.test.tsx` (both new tests)
- [x] Contact channels + form two-column layout collapses to a single
      column on mobile via the shared `useIsMobile()` hook — implemented;
      not separately unit-tested beyond the existing `useIsMobile` hook
      tests (same boolean, no new branch logic beyond a grid-template
      swap)

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. ورود و ثبت‌نام, فراموشی
رمز, پنل کاربر, پنل آژانس, تکمیل خرید/پرداخت are separate future work.
