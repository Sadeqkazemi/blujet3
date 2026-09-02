# Customer identity verification (احراز هویت)

Design: `design-reference-v2/پنل کاربر.dc.html` → `isIdentity` tab.

**Scope cut (CLAUDE.md):** no selfie step — only profile identity fields + national ID card upload.

## Acceptance checklist

- [x] `GET /my/identity` — USER only; steps reflect profile fields + id card file — `customer-identity.e2e-spec.ts`
- [x] `POST /my/identity/id-card` — stores PDF/PNG/JPG via FilesService — `customer-identity.e2e-spec.ts`
- [x] `POST /my/identity/submit` — requires both steps; sets SUBMITTED — `customer-identity.e2e-spec.ts`
- [x] 400 submit without id card; 403 for staff — `customer-identity.e2e-spec.ts`
- [x] No selfie upload anywhere — UI has exactly 2 steps — `AccountIdentityTab.tsx`
- [x] Frontend: identity tab with banner, steps, upload, submit — `AccountPage.test.tsx`

## Admin review queue (SITE_ADMIN — API remains; no sidebar tab)

No design tab exists for staff KYC review — the `APPROVED`/`REJECTED`
transitions are reachable via API (`/identity-verifications*`). The `kyc`
sidebar item was **removed from `PANEL_NAV.SITE_ADMIN`** (2026-08 product
request); direct `/panel/.../kyc` shows ComingSoon via TabGate.

- [x] `GET /identity-verifications` — SITE_ADMIN only; lists submitted/decided rows with customer info + id-card file name — `identity-admin.e2e-spec.ts`
- [x] `GET /identity-verifications/:id/id-card` — streams the id-card file to staff — `identity-admin.e2e-spec.ts`
- [x] `PATCH /identity-verifications/:id/approve` — SUBMITTED → APPROVED, customer sees APPROVED, second approve 409 — `identity-admin.e2e-spec.ts`
- [x] `PATCH /identity-verifications/:id/reject` — requires `rejectReason` (400 without), customer sees reason + can re-submit — `identity-admin.e2e-spec.ts`
- [x] 403 for non-SITE_ADMIN staff and customers; 404 unknown id — `identity-admin.e2e-spec.ts`
- [x] `kyc` **not** in SITE_ADMIN sidebar — `panels.e2e-spec.ts` (explicit `not.toContain('kyc')`)
- [x] Frontend queue UI exists (`IdentityAdminPage`) for when tab is re-enabled — `IdentityAdminPage.test.tsx`
