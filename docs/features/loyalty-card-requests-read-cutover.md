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

Follow-up verification (same PR before merge):

- [x] Compare built Core with real Loyalty HTTP and a restricted PostgreSQL login, including decision timestamps/history and all executive statuses (`loyalty-service/test/card-requests-contract.e2e-spec.ts`).
- [x] Prove actual remote delivery and fallback for disabled flags, lost grants, oversized history/results and a stopped listener (same contract suite, 6 cases).
- [x] Verify enabled public role guards and the SITE_ADMIN local queue (`backend/test/club.e2e-spec.ts`); immutable fixtures are checked after each real contract case.
- [x] Exercise empty, redirect/authentication errors and malformed nested fields (`backend/src/modules/club/loyalty-card-requests.client.spec.ts`, 20 cases). Exactly 1000 rows, byte overflow and malformed history are covered by `loyalty-service/src/loyalty/loyalty.service.spec.ts`.

Follow-up local evidence: 6 real HTTP/PostgreSQL contract cases, 26 Backend Club
E2E cases, 20 client unit cases and 16 Loyalty unit cases passed. Loyalty
typecheck and changed-file lint passed. The probe runs already-built Core and
is typechecked before transpile-only execution. CI validates the full suite.

- [x] Service route authentication, default-off behavior and selected member fields are tested (`test/loyalty.e2e-spec.ts`).
- [x] Client disabled/success/fallback/malformed behavior is tested (`backend/src/modules/club/loyalty-card-requests.client.spec.ts`).
- [x] Code review: public guards stay unchanged and writers stay local (`backend/src/modules/club/club.controller.ts` and `club.service.ts`). Enabled contract proof is tracked above.
- [x] Readiness and reader verification enforce only conditional exact grants (`test/reader-verification.e2e-spec.ts` — executive card-request grants).
- [x] Typechecks, builds, lint and relevant real-PostgreSQL tests pass locally (Loyalty E2E 49/49; Backend client 10/10).

No migration or server deployment. Rollback disables the Backend flag before
the service flag and optional grants. Production activation requires parity
evidence and a separate rollout decision.
