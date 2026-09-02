# Site-admin rules and loan design sync

## Scope

Bring the uploaded site-admin handoff into the production panel without
re-introducing its browser-local mock data. The new rules editor uses the
existing `system_settings` JSONB store and the public terms page consumes the
same server-owned value. The loans screen keeps the bank integration
read-only while exposing the real customer identity already related to each
application.

## Acceptance checklist

- [x] `SITE_ADMIN` navigation exposes a real `rules` destination and keeps the existing blog/content tools.
- [x] The rules page loads exactly the seven approved categories from an authenticated API, supports editing title/text, and reports loading/save failures.
- [x] Saving rules validates the fixed category identifiers server-side, persists one `system_settings` value, and writes an audit event.
- [x] The public Persian terms page renders the saved category titles and lines; English/Arabic keep their existing translated static copy until localized editing is approved.
- [x] The site-admin loan queue remains read-only and shows the related real customer name/phone when available, with safe identifier fallbacks.
- [x] The panel keeps the secure sign-out confirmation and presents the site-admin sign-out action using the approved warning/red treatment.
- [x] Backend and frontend regression tests cover authorization, validation, persistence contract, public projection, navigation, and page behavior.

## Automated proof

- `phase12.e2e-spec.ts` — 14 tests, including role authorization, exact-id validation, JSONB persistence, and public projection.
- `panels.e2e-spec.ts` — 15 tests, including the exact site-admin navigation order.
- `bank-loans.e2e-spec.ts` — 13 tests, including the real customer projection on admin list/detail reads.
- Focused frontend suite — 30 tests across the rules editor, public terms page, loan queue, and panel shell.
- Backend/frontend production builds and both linters complete without errors (repository baseline warnings remain).

## Non-goals

- Cabin-class toggles are not added to the site-admin panel because system
  settings are explicitly denied to that role.
- Existing customer, refund, blog, media, and careers implementations are not
  replaced by the handoff's local arrays.
- Loan approval/rejection remains bank-owned; this change adds no admin
  mutation endpoint.
