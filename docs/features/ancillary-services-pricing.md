# Commercial panel — خدمات (ancillary services pricing)

**Status: backend implemented on `cursor/backend-commercial-overhaul-20260818`.**
Production pages call `frontend/src/api/ancillary-services.ts`. The
localStorage mock (`frontend/src/api/ancillary-services-mock.ts`) is not
imported by feature pages.

Source: uploaded design handoff, section "SERVICES (per-service
pricing)" — a top-level «خدمات» nav tab.

## Acceptance checklist

- [x] "قیمت انواع صندلی" card: 3 seat-type rows (عادی / پای بلندتر /
  کنار پنجره یا راهرو) — `AncillaryServicesPage.test.tsx` › "renders
  seat-type pricing and other services"
- [x] "سایر خدمات جانبی" card: 8 built-in rows — same test
- [x] «افزودن خدمت جدید» creates `isCustom=true` OTHER rows; built-ins
  cannot be deleted — `AncillaryServicesPage.test.tsx` › "adding a
  custom service submits title/description/price";
  `backend/test/commercial-overhaul.e2e-spec.ts` delete-built-in case
- [x] Saving a price shows a Persian success toast —
  `AncillaryServicesPage.test.tsx` › "saving a price calls the adapter
  and shows a confirmation toast"
- [x] Page is reachable at `/panel/ancillary-services` behind
  `<TabGate tabKey="ancillary-services">`.
  `GET /panels/nav` for `COMMERCIAL_MANAGER` includes
  `{ key: 'ancillary-services', labelFa: 'خدمات', implemented: true }`.
  Non-commercial roles still see `ComingSoonPage` —
  `AncillaryServicesPage.test.tsx` › "shows the coming-soon placeholder
  for a non-Commercial role"
- [x] No client-side nav append in `PanelShell.tsx`
- [x] No in-page “not connected to backend / localStorage” notice
- [x] Manager CRUD: `GET/POST /ancillary-services`,
  `PATCH /ancillary-services/:key/price`,
  `PATCH /ancillary-services/:key/enabled`,
  `DELETE /ancillary-services/:key` — e2e commercial-overhaul
- [x] Public `GET /public/ancillary-services` returns only enabled OTHER
  customer-visible fields
- [x] Checkout extras overlay mapped codes from this table onto
  `GET /public/travel-costs` and booking extra pricing (baggage, meal,
  insurance, CIP, refund-fee, seat-selection). Pet, wheelchair, custom,
  and seat-type rows are not added to the closed `TravelExtraCode`
  catalog.
- [x] Adapter tests: `frontend/src/api/commercial-adapters.test.ts`

### Explicitly NOT done this phase

- [ ] No merge to `main`, no deploy
- [ ] Pet / wheelchair / custom OTHER rows are listed on the public
  ancillary endpoint but are not purchasable checkout extras until
  `TravelExtraCode` is extended
