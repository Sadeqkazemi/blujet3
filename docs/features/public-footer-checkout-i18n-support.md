# Feature: public footer, checkout authentication gate, and public-page i18n

## Acceptance checklist

- [x] The desktop public footer matches the supplied reference in Persian,
      English, and Arabic: brand/contact/social content remains in the brand
      column, app-store buttons are retained, and app/trust badges form a
      lower tools group without an extra divider above it.
- [x] The mobile footer keeps the app-store buttons, contact details, social
      links, trust badges, and localized accordion links without overlap.
- [x] An unauthenticated customer can search and select a flight but cannot
      see or edit passenger information. Opening `/checkout/new` shows the
      phone/OTP sign-in dialog immediately; closing it returns to the previous
      page. After authentication the wizard stays on the passenger step.
- [x] The checkout phone and OTP states are localized for fa/en/ar and expose
      the phone edit/resend controls shown in the reference.
- [x] Popular-route and destination city names never fall back to Persian in
      English or Arabic. Known IATA codes use the shared localized airport
      catalog; unknown codes remain IATA codes.
- [x] Support and destinations pages use the full mobile-width hero/search
      treatment and readable one-column content in fa/en/ar without horizontal
      overflow.
- [x] Focused frontend tests, lint, and production build pass.

---

Each item must be backed by a regression test before this checklist is marked
complete. Unchecked items mean the feature is not complete.
