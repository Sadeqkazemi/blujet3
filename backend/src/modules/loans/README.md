# Loans module — bank adapter only

Blujet does **not** underwrite, score, or approve loans. All decisions come
from the configured bank HTTP API (`BANK_LOAN_API_BASE_URL` +
`BANK_LOAN_API_KEY`). Webhooks are verified with
`BANK_LOAN_WEBHOOK_SECRET` (HMAC-SHA256, header `X-Bank-Signature`).

Endpoints:

- `POST/GET /me/loan-applications` (+ `:id`, `:id/sync`) — customer
- `GET /admin/loan-applications` (+ `:id`) — SITE_ADMIN read-only
- `POST /webhooks/bank-loans` — signed bank callback

Wallet credit is applied **only** when the bank response/webhook includes
both `walletCreditIrr` and a unique `walletCreditReference`.
