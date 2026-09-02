# Service-page localized step digits

Scope: the numbered instruction cards on the public seat-selection, extra-
baggage, ticket-refund, pet-travel, and wheelchair service pages.

## Acceptance checklist

- [x] Step ordinals are stored as locale-neutral numbers rather than Persian
  display strings.
- [x] English renders `1`, `2`, and `3`.
- [x] Arabic renders `١`, `٢`, and `٣`, with no Persian `۱`, `۲`, or `۳`.
- [x] Persian continues to render `۱`, `۲`, and `۳` through the shared locale
  formatter.
- [x] Regression tests cover English and Arabic on all five service pages.
- [x] Eleven focused tests, the full 815-test frontend suite, frontend lint,
  and the production build pass.
