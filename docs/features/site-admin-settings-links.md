# SITE_ADMIN settings — app links + support contact (Phase F)

Completes Phase E deferrals moved to the settings tab: app download links
and public support phone/email (social links already shipped).

## Admin (`SettingsPage`, tab `settings`, SITE_ADMIN)

- [x] SITE_ADMIN can PATCH `socialLinks`, `supportEmail`, `supportPhone`, `appDownloadLinks` — `phase12.e2e-spec.ts`
- [x] SITE_ADMIN still forbidden from `maintenance` etc. — `phase12.e2e-spec.ts`
- [x] Settings UI shows support contact + app link fields — `SettingsPage.test.tsx`

## Public API

- [x] `GET /settings/app-links` returns links with non-empty URLs — `phase12.e2e-spec.ts`
- [x] `GET /settings/support-contact` returns phone + email — `phase12.e2e-spec.ts`

## Home page wiring

- [x] App band buttons link to configured store URLs when present — `HomeSearchPage.test.tsx`

## Explicit deferrals

- Static site pages CMS list (design media tab)
- Full destinations page CMS (only home highlights in Phase E)
