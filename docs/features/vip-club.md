# Feature: VIP club — members & card-request approval (Phase 5)

Covers `docs/API.md` → "Phase 5" and `docs/DB_SCHEMA.md` → "Phase 5".
Scope: the مشتریان VIP tab in CEO/Board Chair (rich, byte-identical
layouts) and Senior Manager (simpler two-card layout). Site-admin referral
and passenger self-request stay in their own tracks.

## Acceptance checklist

Backend items proven by `backend/test/club.e2e-spec.ts` (9 tests) +
`backend/src/common/pii-crypto.spec.ts` (4 unit tests); frontend by
`frontend/src/features/club/ClubPage.test.tsx` (4 tests); E2E by
`frontend/e2e/club-journey.spec.ts` (4 journeys).

### Members
- [x] `GET /club/members` returns members + reconciling KPI counts — `'GET /club/members returns members + reconciling KPI counts; non-club roles get 403'`
- [x] `level=`/`q=` search incl. exact national-ID via hash; PII never returned or stored in plaintext — `'national-ID search matches exactly via the hash; plaintext never stored'` (+ the PII-column absence assertion in the list test; crypto round-trip in `pii-crypto.spec.ts`)
- [x] `POST /club/members`: SENIOR 403, bad checksum 400, duplicate 409, stored encrypted — `'POST /club/members: SENIOR 403; bad checksum 400; duplicate 409; stored encrypted'` (checksum algorithm itself unit-tested incl. Persian digits)
- [x] `PATCH level` Senior-only + audited — `'PATCH level is Senior-only and audited'`
- [x] Direct issuance: label, 409 double-issue, audited — `'direct issuance sets the card + issuedBy label, 409 when already issued, audited'`
- [x] Non-club role 403 — asserted in the list test (FINANCE_MANAGER)

### Card requests
- [x] Never returns SUBMITTED — `'GET /club/card-requests never returns SUBMITTED rows'`
- [x] CEO/Chair approve any REFERRED regardless of assignedTo (⚑) — `'CEO/Chair approve any REFERRED request regardless of assignedTo (⚑ design override)'`
- [x] Senior scoped to senior-assigned (CHAIR→403, SENIOR→200) — `'Senior can approve only senior-assigned requests...'`
- [x] Transactional approval (card, member state, history, audit) — asserted in the CEO-approve test
- [x] Reject → member NONE + history; already-decided → 409 — `'reject sets the member back to NONE; deciding an already-decided request → 409'`

### Frontend
- [x] CEO/Chair rich layout (4 KPI cards, requests + timeline modal, directory with filters/search/issue, add-VIP form) — `ClubPage.test.tsx: 'CEO sees the 4 KPI cards...'` + `'CEO request modal shows the روند درخواست timeline...'` + `'the add-VIP form validates required fields'`
- [x] CEO/Chair dark design parity (KPI icons, request rows, member cards, accordion «تعریف مشتری VIP جدید», design subtitle) — same ClubPage tests + subtitle assertion in CEO layout test
- [x] Senior simple layout (no KPIs/search/add-form; inline approve; chair-assigned read-only note) — `'Senior Manager sees the simple layout...'`
- [x] Tier labels + Persian ٬-separated points — asserted in the CEO layout test
- [x] Role isolation — `club-journey.spec.ts: 'Finance Manager has no مشتریان VIP nav entry (role isolation)'`

### E2E
- [x] Senior approves senior-assigned; Chair approves chair-assigned via modal+timeline — `'Senior approves a senior-assigned card request...'` + `'Chair approves a chair-assigned request via the modal...'`
- [x] Senior sees chair-assigned read-only — asserted inside the Senior journey
- [x] CEO adds a VIP member and finds them in the directory — `'CEO adds a new VIP member and finds them in the directory'`

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
