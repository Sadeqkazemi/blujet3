# A6.16 — Compatible executive card-request reads

Preserve `GET /api/v1/club/card-requests` and its CEO, BOARD_CHAIR and
SENIOR_MANAGER guards. An independent default-off
`LOYALTY_CARD_REQUESTS_READ_ENABLED` selects a service-authenticated internal
`GET /internal/v1/loyalty/card-requests` projection, separately gated by
`LOYALTY_CARD_REQUESTS_PROJECTION_ENABLED`.

The existing REFERRED/APPROVED/REJECTED filter, newest-first order, request
decision/history fields and limited member fields are unchanged. SUBMITTED
and the SITE_ADMIN queue remain in Core. All referral/decision/issuance writers
remain in Core, with their existing authorization and audit behavior.

Only the existing loyalty schema is read, in a read-only transaction. Additional
column grants are conditional; no national-ID, Identity or writer permissions.
At most 1000 rows, 32 history steps per row and 512 KiB; over-limit results return
409 to trigger full Core fallback, never partial/truncated results. The client
uses a 2-second deadline and 512-KiB response bound. Network/404/409/5xx failures
fall back; malformed successes, redirects and other 4xx fail closed with 503.

Acceptance:

- [x] Service route authentication, status filter, fields/order and bounds are tested (`test/loyalty.e2e-spec.ts` — executive card-request contract).
- [x] Client disabled/success/fallback/malformed behavior is tested (`backend/src/modules/club/loyalty-card-requests.client.spec.ts`).
- [x] Public guards and response contract stay unchanged; writers stay local (`backend/src/modules/club/club.controller.ts` and `club.service.ts`).
- [x] Readiness and reader verification enforce only conditional exact grants (`test/reader-verification.e2e-spec.ts` — executive card-request grants).
- [x] Typechecks, builds, lint and relevant real-PostgreSQL tests pass locally (Loyalty E2E 49/49; Backend client 10/10).

No migration or server deployment. Rollback disables the Backend flag before
the service flag and optional grants. Production activation requires parity
evidence and a separate rollout decision.
