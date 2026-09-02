# Feature: Ticket pricing — proposals, AI analysis, CEO registration (Phase 6)

Covers `docs/API.md` → "Phase 6" and `docs/DB_SCHEMA.md` → "Phase 6".
Scope: Commercial Manager's pricing section (inside its flights tab), the
CEO «تعیین قیمت بلیط» tab, and the first real ml-service implementation
(advisory price suggestion behind the NestJS ai module).

## Acceptance checklist

Backend items proven by `backend/test/pricing.e2e-spec.ts` (8 tests, with a
fake provider standing in for the ml-service); ml-service by
`ml-service/tests/test_pricing.py` (11 pytest); frontend by
`frontend/src/features/pricing/PricingPage.test.tsx` (5 tests); E2E by
`frontend/e2e/pricing-journey.spec.ts` (3 journeys — the full-loop one runs
against the REAL uvicorn ml-service, spawned/killed by the spec).

### Proposals (Commercial Manager)
- [x] PUT creates PENDING + re-PUT edits — `'Commercial proposes a price for a scheduled flight; re-PUT while PENDING edits it'`
- [x] PUT on REGISTERED → 409 — `'CEO registers with source=PROPOSED; proposal locks; further edits/registers → 409'`
- [x] PUT as CEO 403 / unknown flight 404 / missing price 400 — `'PUT as CEO → 403; unknown flight → 404; missing price → 400'`
- [x] Commercial GET rows joined to real instances with the three states — `'role-shaped GET: CEO gets pending/registered lists, Commercial gets flight rows joined with proposals'` + UI states in `PricingPage.test.tsx: 'Commercial sees the three row states...'`
- [x] Upsert is atomic with `definitionStatus → PENDING_CEO` (pessimistic instance lock) — `pricing.service.ts` upsert transaction + flight-definition e2e propose/register path
- [x] `competitorPriceIrr` is nullable; never fabricated as base+3% — migration `1786348800000-…`, register/upsert use definition value or null; UI shows «—»

### Registration (CEO)
- [x] source=PROPOSED registers + locks + audits — `'CEO registers with source=PROPOSED...'`
- [x] source=AI uses persisted suggestion; 409 without one — `'register with source=AI without a stored suggestion → 409...'` + the AI test below
- [x] Re-register 409; Commercial register 403 — covered in the lock test + role test
- [x] legal-rate PATCH stores + audits — `'CEO legal-rate PATCH stores + audits; Finance/Board Chair get 403 everywhere'`
- [x] Register + `applyCeoApproval` and reject + `applyCeoRejection` run in one transaction with row locks — `pricing.service.ts` register/reject; e2e `'CEO reject requires reason…'` + `'GET/PUT definition; APPROVED edit…'`
- [x] Reject keeps live APPROVED inventory under `PENDING_REVISION` when a prior approval exists; first-cycle → `REJECTED` — same e2e

### AI analysis (ML service + ai module)
- [x] Persists aiSuggestion with modelVersion on PENDING proposals — `'AI analysis persists suggestions with modelVersion, mutates nothing else, and register {source:AI} uses it'`
- [x] Advisory-only (no price/status mutation on generation) — asserted in the same test
- [x] Graceful degradation (available:false, no 500; flows keep working) — `'ml-service down: ai-analysis degrades gracefully...'` + Playwright outage journey
- [x] Internal-token enforcement — `test_pricing.py: test_rejects_missing_or_wrong_token`
- [x] pytest schema/edge/version coverage — `test_validation_rejects_bad_payloads`, `test_extreme_low_prices_stay_positive`, `test_never_more_than_5pct_above_competitors`, `test_suggestion_response_shape_and_model_version`, `test_deterministic_for_same_input`, `test_season_mapping`
- [x] Usage audit-logged — asserted via the PRICING audit row in the analysis test

### Frontend
- [x] CEO tab (banner, AI button + loading, three price columns + delta line, register buttons, legal-rate row, analysis panel with chips/factors, registered list with «قفل‌شده») — `'CEO sees the workflow banner, AI button, pending cards...'` + `'CEO registering with AI calls the API with source=AI'`
- [x] Commercial list + modal (three states, base/competitor tiles, note, validation, toman→rial) — `'Commercial sees the three row states...'` + `'Commercial set-price modal validates the proposed price and submits toman→rial'`
- [x] Persian money/Jalali dates — asserted in the CEO layout test (۳٬۸۵۰٬۰۰۰ تومان)
- [x] Role isolation — Finance 403s in `pricing.e2e-spec.ts` + no nav links in `pricing-journey.spec.ts: 'Finance Manager gets no pricing surfaces (role isolation)'`

### E2E
- [x] Full loop against the real ml-service — `'full loop: propose → AI analysis → «ثبت با AI» → Commercial sees the locked price'`
- [x] Register without AI — inside the outage journey («تأیید بازرگانی» after degradation)
- [x] ml-service down degradation — `'ml-service down: CEO AI button degrades gracefully; register-by-proposed still works'`

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
