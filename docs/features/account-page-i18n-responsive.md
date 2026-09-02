# Feature: پنل کاربر (AccountPage) — real i18n

Twelfth page of the per-page translation arc. `AccountPage` is the
largest page translated so far: 7 tabs, all backed by real endpoints
(none of this is mock) — پروفایل من, سفرها, کیف پول, امتیاز باشگاه, قفل
قیمت, مسافران, استرداد‌ها. EN strings came from
`design-reference-v2/پنل کاربر.dc.html`'s own `isEN` ternaries, which have
rich coverage for this page; AR is a mix of the design's own `isAR`
branches (partial coverage) and fresh hand-translation elsewhere, same
quality bar as every phase. The «قفل قیمت» (price lock) tab has **no
counterpart at all** in the design bundle — it's a real feature unique to
this app's implementation — so every one of its strings was hand-translated
to match the real feature, not adapted from any mock source.

## Acceptance checklist

- [x] All 7 tab labels (پروفایل من, سفرها, کیف پول, امتیاز باشگاه, قفل
      قیمت, مسافران, استرداد‌ها) render in fa/en/ar
      — `AccountPage.test.tsx` › "renders translated tab labels and the
      points tier in English" + "...in Arabic"
- [x] The points tab's tier line (`★ سطح طلایی` / `★ Tier Gold` /
      `★ المستوى ذهبية`) renders correctly per locale
      — same two new tests
- [x] All 12 pre-existing tests pass unmodified — every byte-critical fa
      string they assert stays byte-identical: `'در حال بررسی'` (refund
      status), `'★ سطح طلایی'` (points tier), `'اطلاعات پروفایل ذخیره شد
      ✓'` (save notice), the `'کد ملی'` field label, the `'ذخیره
      اطلاعات'` button name, and `'لغو شده'` (price-lock status after
      cancel)
      — `AccountPage.test.tsx` (original tests, unchanged)
- [x] Trip status badges, refund status badges, and price-lock status
      badges (`STATUS_LABEL`/`REFUND_STATUS_LABEL`/`LOCK_STATUS_LABEL`,
      each restructured from a flat fa string to a
      `Record<StoredLocale, string>`) translate per locale — implemented;
      covered indirectly by the unchanged fa-default tests plus the new
      en/ar tests exercising the same lookup pattern
- [x] Cabin labels on price-lock rows reuse the exact `CABIN_LABEL`
      mapping already established in `ResultsPage.tsx` (Economy/Business)
      — implemented, same map literal
- [x] The currency word stays `'تومان'`/`'Toman'`/`'تومان'` in every
      locale (Arabic keeps the transliterated word, matching the existing
      convention from `ResultsPage.tsx`) — real toman amounts are never
      converted to a fake currency, per the standing pricing-honesty rule
      from earlier phases
- [x] Every error-fallback string (profile save, email verify
      request/confirm, wallet top-up, price-lock cancel, data export,
      account deletion) is locale-aware instead of hardcoded fa text
      — implemented in `AccountPage.tsx`'s catch blocks

## Notes

- No `useIsMobile()` wiring this phase — the page's layout (single-column
  tab content, a wrapping tab-button row) has no breakpoint-dependent
  grid to collapse, same as Phase 50's `CustomerLoginPage`.
- Test file previously had no locale-mock leak risk (single `describe`
  block, not bundled with other pages) but still gained a scoped
  `afterEach(() => vi.restoreAllMocks())` for consistency with the rest of
  the arc's tests — safe here since every `publicSiteApi` mock is already
  freshly re-established in `beforeEach` on every test.

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done. پنل آژانس and تکمیل
خرید/پرداخت remain separate future work.
