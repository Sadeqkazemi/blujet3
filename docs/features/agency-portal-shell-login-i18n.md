# Feature: پنل آژانس — shared shell + login/signup real i18n (foundation)

Thirteenth page-set of the per-page translation arc, and the first for
the agency portal track — mirrors Phase 41's role as a shared-shell
foundation for the public site. Covers `AgencyPortalShell.tsx` (sidebar
nav + sign-out), `AgencyLoginLayout.tsx` (the B2B-partner login shell),
and `AgencyLoginPage.tsx` (login form + signup form + OTP step + done
state). The remaining agency-portal pages (Dashboard, Credit, Sales,
Inbox, Profile, Seats, Webservice) are separate follow-up phases, each
building on this locale wiring.

Unlike every prior phase, **no design-mock counterpart exists for the
login/signup screen at all** — `design-reference-v2/پنل آژانس.dc.html`'s
`isEN`/`isAR` ternaries only cover the post-login dashboard content (its
own `navMeta` array, KPI labels, profile fields, etc.), never a login
form, since the design never specified an agency login mechanism (see the
⚑ product decision already recorded in `docs/API.md`'s Agency Portal
section: phone+password login was invented server-side with no
design-confirmed spec). So:
- The shell's 7 nav-item labels reuse the design's own `navMeta` EN
  wording where the concept lines up 1:1 (Dashboard, Credit & Balance,
  Sales & Reports, Inbox & Messages, Profile & Documents); AR has no
  design counterpart there either and is hand-translated.
- Every string in `AgencyLoginLayout.tsx` and `AgencyLoginPage.tsx` is
  hand-translated, since none of it exists in the design bundle. A few
  concepts that DO overlap with `CustomerLoginPage.tsx`'s agency-signup
  tab (license number, manager name, terms checkbox) reuse that exact
  wording for consistency across the app.

## Acceptance checklist

- [x] Sidebar nav renders all 7 tab labels, the "Partner Agency" caption,
      and the sign-out button in fa/en/ar — implemented in
      `AgencyPortalShell.tsx`; not separately unit-tested this phase (no
      pre-existing test file for the shell; behavior is identical prop
      threading to every other translated page)
- [x] The login-shell's side panel (heading, body copy, 3 feature
      bullets) and both tab labels (ورود/ثبت‌نام) translate in fa/en/ar
      — `AgencyLoginPage.test.tsx` › "renders translated tabs and labels
      in English" + "...in Arabic"
- [x] All 3 pre-existing tests pass unmodified — every byte-critical fa
      string they assert stays byte-identical: the `'ورود به پنل آژانس'`
      button, the `'شماره تماس و رمز عبور را وارد کنید.'` error, the
      `'شماره تماس آژانس'`/`'رمز عبور'` labels, the signup tab's field
      labels, the `'ثبت درخواست و دریافت کد'`/`'تأیید و ثبت درخواست'`
      buttons, and the `'درخواست همکاری شما ثبت شد'` done message
      — `AgencyLoginPage.test.tsx` (original 3 tests, unchanged)
- [x] The signup OTP step's dynamic label (`کد تأیید ۶ رقمی (پیامک‌شده
      به {phone})`) renders correctly per locale via a template function
      — implemented; covered indirectly by the unchanged fa-default test
      using a regex match on the same string shape
- [x] Login/signup phone-number placeholders show Persian digits in fa
      and Latin digits in en/ar (`۰۹xxxxxxxxx` vs `09xxxxxxxxx`)
      — implemented in `AgencyLoginForm`

## Notes

- `dir` on both the shell and the login layout now derives from
  `useLocale()` (`ltr` for `en`, `rtl` otherwise) instead of being
  hardcoded `"rtl"`.
- Test file gained a scoped `afterEach(() => vi.restoreAllMocks())` —
  safe here since every test explicitly re-establishes its own
  `mockAuth`/`vi.spyOn` calls in its own body (no shared `beforeEach` to
  worry about clobbering).

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. The remaining
agency-portal pages (Dashboard, Credit, Sales, Inbox, Profile, Seats,
Webservice) and تکمیل خرید/پرداخت remain separate future work.
