# Feature: Flight approval workflow (operations → CEO → publish)

Acceptance checklist for Phase 1 (evolve-in-place on `FlightInstance.definitionStatus`).

## Status machine

| Status | Meaning |
|--------|---------|
| `DRAFT` | Commercial draft (not submitted) |
| `PENDING_OPERATIONS` | Awaiting operations manager review |
| `OPERATIONS_REJECTED` | Ops rejected; commercial can edit + resubmit |
| `PENDING_CEO` | Ops approved; awaiting CEO price/definition register |
| `REJECTED` | CEO rejected |
| `PENDING_REVISION` | Live published flight has pending commercial edit |
| `PUBLISHED` | Sellable (was `APPROVED`) |

### Allowed transitions

- `DRAFT` → `PENDING_OPERATIONS` (submit-operations)
- `PENDING_OPERATIONS` → `OPERATIONS_REJECTED` | `PENDING_CEO` (ops-decision)
- `OPERATIONS_REJECTED` | `REJECTED` → `PENDING_OPERATIONS` (resubmit)
- `PENDING_CEO` → `PUBLISHED` (CEO register/approve pricing)
- `PENDING_CEO` → `REJECTED` (CEO reject)
- `PUBLISHED` → `PENDING_REVISION` (commercial edit of live flight)
- `PENDING_REVISION` → `PENDING_OPERATIONS` (submit revision through ops again)

Invalid transition → HTTP `409 CONFLICT`.

## FE presentation mapping (`publishStatus` / ui)

| definitionStatus | publishStatus / ui |
|------------------|--------------------|
| `PENDING_OPERATIONS` | `PENDING_APPROVAL` / `pending_ops` |
| `OPERATIONS_REJECTED` | `REJECTED` / `ops_rejected` |
| `PENDING_CEO` \| `PENDING_REVISION` | `PENDING_APPROVAL` / `pending_ceo` |
| `PUBLISHED` | `PUBLISHED` / `registered` |
| `REJECTED` | `REJECTED` |
| `DRAFT` | `DRAFT` |

## Endpoints

- [x] `POST /flights` creates `DRAFT` (not `PENDING_CEO`) — `flight-definition.e2e-spec.ts` / `flight-approval-workflow.e2e-spec.ts` #1
- [x] `POST /flights/:id/submit-operations` — `flight-approval-workflow.e2e-spec.ts` #1
- [x] `GET /flights/operations-queue` — covered via ops decision path + controller RBAC
- [x] `GET /flights/operations-overview` — dashboard counters + enriched live rows; e2e #1
- [x] `POST /flights/:id/operations-decision` (comment required, `expectedVersion`) — e2e #3/#4/#5/#9
- [x] `GET /flights/:id/history` — e2e #8
- [x] CEO queue is gated by operations approval — `flight-approval-workflow.e2e-spec.ts` (CEO queue test)
- [x] CEO `PATCH /pricing/proposals/:id/register` (and `/approve`) → `PUBLISHED` — e2e #6 + `flight-definition.e2e-spec.ts`
- [x] Commercial `PATCH /pricing/flights/:id/price` changes published sale price and appends audit history — `flight-approval-workflow.e2e-spec.ts` (published-price test)
- [x] Public search only returns sellable (`PUBLISHED` or `PENDING_REVISION`+snapshot) — e2e #6/#7 + `definition-sellability.spec.ts`
- [x] Optimistic lock: stale `expectedVersion` → 409 — e2e #9
- [x] Migration maps legacy `APPROVED` → `PUBLISHED` without deleting rows — migration + e2e #10 (legacy sellable)
- [x] RBAC: ops role cannot publish; commercial cannot ops-decide; non-ops 403 — e2e #2 + ops-cannot-register
- [x] React operations panel — dashboard, decision cartable and flight-history detail
- [x] Commercial create/edit submits to operations before CEO; rejected comments are shown on edit
- [x] Commercial published-price adjustment is wired to the backend and recorded in history

## Unit

- [x] Transition matrix — `flight-workflow.service.spec.ts`
- [x] Sellability / ui mapping — `definition-sellability.spec.ts`

## Deferred (stubs only)

- Pricing alerts / AI recommendation job — `backend/src/modules/flights/pricing-alert.types.ts`
- Loan applications — `backend/src/modules/loans/`
- Transactional outbox for domain events — noted in `docs/API.md` Phase 71
