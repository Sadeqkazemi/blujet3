# API Contract — for frontend PR #126 (Cursor)

Branch: `agent/commercial-operations-backend`. This document is the precise,
implementation-verified contract for every surface PR #126's own summary
flagged as missing or uncertain ("aircraft menu CRUD endpoints may 404",
"CEO approve/reject — backend may still require step-up", "published-flight
search filter"), plus every other surface task-listed for this backend PR:
notifications/badges, access-revoked handling, audit logs, cartable/
referrals, and career attachment delete.

All endpoints use the standard envelope from `CLAUDE.md`:
`{ success: boolean, data?: T, error?: { code: string, message: string } }`.
`error.code` is a stable English enum from `common/errors.ts`
(`ErrorCode`); `error.message` is always Persian. Every endpoint below
requires `Authorization: Bearer <accessToken>` unless marked **public**.

```
ErrorCode = VALIDATION_FAILED | UNAUTHORIZED | FORBIDDEN | NOT_FOUND |
  CONFLICT | RATE_LIMITED | INTERNAL_ERROR | PASSWORD_CHANGE_REQUIRED |
  TEMPORARY_ACCESS_EXPIRED | SALE_WINDOW_CLOSED | POOL_EXHAUSTED |
  CAPACITY_BELOW_CONFIRMED | LOCK_CAP_EXCEEDED | FLIGHT_NOT_DEPARTED |
  SURVEY_ALREADY_SUBMITTED | SURVEY_DISABLED |
  UAT_TEMPORARY_ACCOUNT_READ_ONLY | ACCESS_REVOKED
```

---

## 1. Aircraft definitions / detail / seat-map

Canonical contract path is `/flights/aircraft-definitions*`. The legacy
`/flights/aircraft*` path still works (same handlers) — use whichever, they
return identical payloads. **MD-80's seat map is unchanged** in this PR.

| Method | Path | Roles | Permission |
|---|---|---|---|
| GET | `/flights/aircraft-definitions` | SENIOR_MANAGER, COMMERCIAL_MANAGER, EMPLOYEE | `fl_view` (EMPLOYEE only) |
| POST | `/flights/aircraft-definitions` | SENIOR_MANAGER, COMMERCIAL_MANAGER, EMPLOYEE | `fl_manage` |
| GET | `/flights/aircraft-definitions/:id` | SENIOR_MANAGER, COMMERCIAL_MANAGER, EMPLOYEE | `fl_view` |
| PUT | `/flights/aircraft-definitions/:id` | SENIOR_MANAGER, COMMERCIAL_MANAGER, EMPLOYEE | `fl_manage` |
| PATCH | `/flights/aircraft-definitions/:id` | SENIOR_MANAGER, COMMERCIAL_MANAGER, EMPLOYEE | `fl_manage` |
| GET | `/flights/aircraft-definitions/:id/seat-map` | SENIOR_MANAGER, COMMERCIAL_MANAGER, EMPLOYEE | `fl_view` |
| *(legacy alias)* GET/POST | `/flights/aircraft` | same roles/permissions as above |
| *(legacy alias)* GET/PUT | `/flights/aircraft/:id` | same roles/permissions as above |
| GET | `/flights/aircraft-types` | SENIOR_MANAGER, COMMERCIAL_MANAGER, EMPLOYEE (`fl_view`) — **unchanged**, not part of this contract |

`@RequiresPermission` only gates the EMPLOYEE role (`EmployeePermissionGuard`
is a no-op for every other role — SENIOR_MANAGER/COMMERCIAL_MANAGER always
pass once `@Roles` admits them).

### `GET /flights/aircraft-definitions` → list

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "code": "B738",
      "model": "Boeing 737-800",
      "title": "بوئینگ ۷۳۷-۸۰۰",
      "status": "ACTIVE",            // AircraftStatus: ACTIVE | INACTIVE
      "totalCapacity": 189,
      "version": 3,
      "cabins": [
        { "cabinType": "BUSINESS", "capacity": 12 },
        { "cabinType": "ECONOMY", "capacity": 177 }
      ]
    }
  ]
}
```

### `GET /flights/aircraft-definitions/:id` → detail (includes cabins,
per-cabin capacity, totalCapacity, and the full seatMap embedded)

```jsonc
{
  "success": true,
  "data": {
    "id": "uuid",
    "code": "B738",
    "model": "Boeing 737-800",
    "title": "بوئینگ ۷۳۷-۸۰۰",
    "status": "ACTIVE",
    "totalCapacity": 189,
    "version": 3,
    "cabins": [
      { "cabinType": "BUSINESS", "capacity": 12 },
      { "cabinType": "ECONOMY", "capacity": 177 }
    ],
    "seats": [
      { "row": 1, "column": "A", "label": "1A", "cabinType": "BUSINESS", "side": "LEFT", "isBlocked": false }
      // ...one row per physical seat
    ],
    "seatMap": {
      "aircraftDefinitionId": "uuid",
      "cabinLayout": {
        "FIRST": null,
        "BUSINESS": { "colsLeft": ["A"], "colsRight": ["C","D"], "aisleAfterIndex": 1 },
        "COMFORT": null,
        "ECONOMY": { "colsLeft": ["A","B","C"], "colsRight": ["D","E","F"], "aisleAfterIndex": 3 }
      },
      "excludedSeatCodes": ["13A"],
      "seats": [ /* same shape as detail.seats above */ ]
    }
  }
}
```

`CabinType` enum: `FIRST | BUSINESS | COMFORT | ECONOMY`.
`AircraftSeatSide` enum: `LEFT | RIGHT`.

### `GET /flights/aircraft-definitions/:id/seat-map` → same `seatMap` object
shown nested above, returned standalone.

### `POST` / `PUT` / `PATCH` body (`UpsertAircraftDto`)

```jsonc
{
  "code": "B738",
  "model": "Boeing 737-800",
  "title": "بوئینگ ۷۳۷-۸۰۰",
  "totalCapacity": 189,               // must equal the sum of all derived cabin seat counts, else 400
  "businessRowStart": 1, "businessRowEnd": 2,
  "businessColsLeft": ["A"], "businessColsRight": ["C","D"],
  "comfortRowStart": null, "comfortRowEnd": null,          // optional cabin — omit/null if unused
  "comfortColsLeft": null, "comfortColsRight": null,
  "firstRowStart": null, "firstRowEnd": null,
  "firstColsLeft": null, "firstColsRight": null,
  "economyRowStart": 3, "economyRowEnd": 33,
  "economyColsLeft": ["A","B","C"], "economyColsRight": ["D","E","F"],
  "excludedSeatCodes": ["13A", "13B"]     // rows/labels to skip (superstition rows etc.)
}
```

**Errors**: `400 VALIDATION_FAILED` — derived cabin seat sum ≠
`totalCapacity`, or a duplicate seat code across overlapping bands.
`404 NOT_FOUND` — unknown `:id` on GET/PUT/PATCH.

---

## 2. Agency/charter commitments + capacity summary

All four: `SENIOR_MANAGER, COMMERCIAL_MANAGER, EMPLOYEE` (`fl_view` on the
two GETs, `fl_manage` on POST/DELETE — same permission split as the
aircraft endpoints above).

| Method | Path | Notes |
|---|---|---|
| GET | `/flights/:instanceId/commitments` | list, both charter+agency, newest first |
| GET | `/flights/:instanceId/commitments/summary` | capacity summary (below) |
| POST | `/flights/:instanceId/commitments` | unified create — see DTO |
| DELETE | `/flights/:instanceId/commitments/:id` | unified cancel — tries charter then agency |

The **old split allotment endpoints are untouched** and keep working
alongside these.

### `POST /flights/:instanceId/commitments` body (`CreateCommitmentDto`)

```jsonc
{
  "cabin": "ECONOMY",                 // CabinClass: FIRST | BUSINESS | COMFORT | ECONOMY
  "seats": 20,
  "contractPriceIrr": "500000000",    // string decimal IRR — see money rules in CLAUDE.md
  "startDate": "2026-09-01T00:00:00.000Z",   // optional, ISO 8601 UTC
  "releaseAt": "2026-09-30T00:00:00.000Z",   // optional — canonical end-of-period field
  "endDate": "2026-09-30T00:00:00.000Z",     // optional ALIAS for releaseAt; if both sent, releaseAt wins
  "agencyId": "user-uuid-of-agency",  // PRESENT → agency commitment; OMITTED → charter commitment
  "idempotencyKey": "client-generated-key"   // optional, prevents duplicate submission on retry
}
```

Response (`data`) — one row, `type` discriminates:

```jsonc
{
  "id": "uuid",
  "flightInstanceId": "uuid",
  "cabin": "ECONOMY",
  "seats": 20,
  "contractPriceIrr": "500000000",
  "startDate": "2026-09-01T00:00:00.000Z",
  "releaseAt": "2026-09-30T00:00:00.000Z",
  "status": "ACTIVE",                 // CommitmentStatus: ACTIVE | CANCELLED
  "idempotencyKey": null,
  "createdById": "uuid",
  "createdAt": "...",
  "cancelledById": null,
  "cancelledAt": null,
  "type": "CHARTER",                  // or "AGENCY"
  // AGENCY rows additionally carry:
  "agencyId": "uuid",
  "agencyName": "آژانس مسافرتی...",
  "agencyLicenseNo": "AG-1234"
}
```

**Errors**: `400 VALIDATION_FAILED` — cabin not defined on this instance,
or seats > cabin capacity. `409 CONFLICT` — projected total
(committed + already-sold + this request) exceeds physical/cabin capacity
(concurrency-safe: exactly one of two racing requests for the last seats
wins). `404 NOT_FOUND` — unknown `:instanceId` or, on DELETE, unknown
`:id`.

### `GET /flights/:instanceId/commitments/summary` → capacity summary

```jsonc
{
  "success": true,
  "data": {
    "cabins": [
      {
        "cabin": "ECONOMY",
        "totalCapacity": 150,
        "charterCommitted": 20,
        "agencyCommitted": 10,
        "sold": 45,
        "availableOnline": 75
      },
      { "cabin": "BUSINESS", "totalCapacity": 12, "charterCommitted": 0, "agencyCommitted": 0, "sold": 3, "availableOnline": 9 }
    ],
    "totalCapacity": 162,
    "charterCommitted": 20,
    "agencyCommitted": 10,
    "sold": 48,
    "availableOnline": 84
  }
}
```
`availableOnline = max(0, totalCapacity − charterCommitted − agencyCommitted − sold)`
per cabin, and the top-level fields are the sum across cabins.

### `DELETE /flights/:instanceId/commitments/:id` → cancels (charter or
agency, whichever the id resolves to) → returns the updated row
(`status: "CANCELLED"`, `cancelledById`, `cancelledAt` set).

---

## 3. CEO approve/reject — no OTP/step-up

**Confirmed: these three endpoints never require `stepUpChallengeId` /
`stepUpCode`, and never return a step-up-required error.** Only normal
`JwtAuthGuard` + `RolesGuard(CEO)` + the request body below. (OTP/step-up
is untouched everywhere else — customer OTP login, staff 2FA login,
admin-role-change step-up, API-key-rotate step-up, refund-payout step-up,
etc. all still require it.)

| Method | Path | Body |
|---|---|---|
| PATCH | `/pricing/proposals/:id/register` | `RegisterProposalDto` |
| PATCH | `/pricing/proposals/:id/approve` | **canonical alias** for `register` — identical behavior, identical body |
| PATCH | `/pricing/proposals/:id/reject` | `RejectProposalDto` |

```jsonc
// RegisterProposalDto — POST body for both /register and /approve
{ "source": "PROPOSED" }   // or "AI" — "commercial-approved" vs "AI-set" price origin

// RejectProposalDto
{ "rejectionReason": "نرخ پیشنهادی با نرخ قانونی سازگار نیست" }  // required, non-empty after trim
```

Both are idempotent: re-registering an already-registered proposal returns
the same result rather than erroring; approve/register on a
non-PENDING/illegal-state proposal → `409 CONFLICT`.

Same no-OTP contract also applies to `PATCH /flights/:id/definition/approve`
and `PATCH /flights/:id/definition/reject` (the full flight-definition
approval flow, not just the pricing proposal) — unaffected by this PR,
already shipped in an earlier phase.

---

## 4. Published search results

The DB's approval-workflow enum is **still `FlightDefinitionStatus`**
(`DRAFT | PENDING_CEO | APPROVED | REJECTED | PENDING_REVISION`) — it was
**not** renamed to `PUBLISHED`. Instead every search/definition response
row now also carries a derived, presentation-only `publishStatus` field
computed by `toPublishStatus()`:

```
PublishStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED'

APPROVED (+ has an approvedSnapshot, i.e. actually sellable) → PUBLISHED
REJECTED                                                      → REJECTED
PENDING_CEO | PENDING_REVISION                                → PENDING_APPROVAL
DRAFT (or anything else)                                       → DRAFT
```

Both fields are present side by side on every row so the frontend can use
either: `definitionStatus` (raw DB enum, 5 values above) and
`publishStatus` (derived, 4 values above, use this one for "is this
flight visible/bookable" UI logic).

### `GET /search/flights` (and the connection-builder path) — each result row

```jsonc
{
  "flightInstanceId": "uuid",
  "flightNo": "IR123",
  // ...existing fields (route, times, cabins, price, etc., unchanged)
  "definitionStatus": "APPROVED",
  "publishStatus": "PUBLISHED"
}
```
Only `APPROVED`-with-snapshot (⇒ `publishStatus: "PUBLISHED"`) instances
are ever returned by search at all — the two fields are informational, not
an additional filter the frontend needs to apply.

### `GET /flights/:id/definition` — detail response also carries both
fields at the top level, same values/semantics as above.

**Cache invalidation**: `SearchService.invalidateForInstance()` /
`invalidateForRouteDate()` are called on every CEO
approve/reject/revision-register action, for both the flight's route+date
key and any connection-search keys touching that instance — a client
re-querying search immediately after a CEO action always sees the fresh
`publishStatus`, no stale-cache window.

**Verified end-to-end** (THR→MHD): create draft → submit for approval →
CEO approve → `GET /search/flights?origin=THR&dest=MHD&date=...` returns
the flight with `definitionStatus: "APPROVED"`,
`publishStatus: "PUBLISHED"`; same fields also correct on
`GET /flights/:id/definition`.

---

## 5. Notifications + badges

New module, `JwtAuthGuard`-only (every authenticated role: staff, agency,
customer — each notification is scoped to `recipientId = actor.id`).

| Method | Path | Query / Body |
|---|---|---|
| GET | `/notifications` | `?category=&unreadOnly=true&limit=&offset=` |
| GET | `/notifications/unread-count` | — |
| PATCH | `/notifications/:id/read` | — (idempotent) |
| PATCH | `/notifications/read-all` | — |

```
NotificationCategory = CARTABLE | MESSAGE | REQUEST | APPROVAL | SYSTEM
```

### `GET /notifications` → row shape

```jsonc
{
  "id": "uuid",
  "recipientId": "uuid",
  "category": "APPROVAL",
  "action": "APPROVED",          // stable English code — CREATED/REFERRED/APPROVED/REJECTED/DELETED/ACCESS_REVOKED/SENT/...
  "title": "درخواست شما تأیید شد",
  "body": "توضیح اختیاری",
  "entityType": "AgencyMembershipRequest",
  "entityId": "uuid",
  "dedupeKey": "AgencyMembershipRequest:uuid:CREATED:uuid",
  "readAt": null,                // null = unread
  "createdAt": "..."
}
```

### `GET /notifications/unread-count` → per-category breakdown + total

```jsonc
{ "total": 7, "CARTABLE": 2, "MESSAGE": 0, "REQUEST": 3, "APPROVAL": 2, "SYSTEM": 0 }
```
Use this for every panel's sidebar/badge counters (cartable, messages,
requests, approvals are separate counters, matching CLAUDE.md's spec).

Idempotency: creation is deduped server-side by `dedupeKey` — retrying the
same logical event never creates a duplicate row. `PATCH .../read` on an
already-read notification is a no-op (still 200, same row back).

Notifications are currently emitted for: commitment create/cancel
(agency-side), pricing proposal approve/reject, access-revoked
(block/suspend across manager/employee/agency), cartable transfer
("refer"), and agency-membership-request refer + public submission
(fanned out to every active SITE_ADMIN).

---

## 6. Access revoked

When an account (or an agency) is blocked/suspended, or an employee's role
permission is revoked, **the very next authenticated request — even with
an already-issued, not-yet-expired access token — is rejected**:

```
HTTP 403
{ "success": false, "error": { "code": "ACCESS_REVOKED", "message": "دسترسی شما لغو شده است. لطفاً دوباره وارد شوید." } }
```

This is enforced inside `JwtAuthGuard` itself (not just at login/refresh):
every authenticated request re-checks the live `User.isActive` flag (and,
for role `AGENCY`, `AgencyProfile.suspendedAt`) straight from the DB.
Super-admin accounts (`user.isSuperAdmin`) are exempt by design. Refresh
tokens are also revoked immediately on block/suspend, so a refresh attempt
fails too — this isn't only an access-token check.

Wire this into the frontend as: on any `403` with
`error.code === "ACCESS_REVOKED"`, clear the session and redirect to the
appropriate login page, regardless of which endpoint returned it — it can
happen on any request, not just a dedicated "check session" call.
`GET /auth/me` is a convenient endpoint to proactively poll/verify session
liveness if the frontend wants an explicit check.

Covered/tested for: a manager blocked via `PATCH /admins/:id/block`
(and restored via `.../unblock`), an employee disabled via
`PATCH /it/employees/:id/status`, an agency suspended via
`PATCH /agencies/:id/suspend`, and the underlying `User.isActive` mechanism
generically (role-agnostic — the same guard code path covers a future
customer-block feature with no additional guard work).

Employee permission changes (`PATCH /it/employees/:id/permissions`) also
take effect immediately on the very next request — there is no permission
cache anywhere in this stack; `EmployeePermissionGuard` queries the grant
table live on every request.

---

## 7. Audit logs

All four endpoints now support pagination and filters. Filters:
`actor` (exact `actorId`), `action` (partial/ILIKE match), `resource`
(exact `entityType` match), `dateFrom`/`dateTo` (ISO 8601, bounds
`createdAt`), plus each endpoint's own pre-existing filters
(`category`/`actorRole`/`q` on manager-reports only). Pagination:
`page` (default 1), `limit` (default 100, max 100).

| Method | Path | Roles | Extra filters |
|---|---|---|---|
| GET | `/audit/manager-reports` | CEO, BOARD_CHAIR, SENIOR_MANAGER | `category`, `actorRole`, `q` |
| GET | `/audit/logs` | IT_MANAGER, EMPLOYEE(`lg_view`) | — (pre-scoped to SYSTEM/ACCOUNT categories) |
| GET | `/audit/logs/badge-count` | IT_MANAGER | — (unpaginated, 7-day rolling count) |
| GET | `/audit/system-events` | CEO | — |

Query example: `GET /audit/manager-reports?actor=<userId>&action=استرداد&dateFrom=2026-01-01T00:00:00.000Z&page=1&limit=20`

### Response envelope — `meta` is new, `data` stays the same array shape
every existing caller already expects (fully backward compatible):

```jsonc
{
  "success": true,
  "data": [ /* same row shape as before, per-endpoint */ ],
  "meta": { "total": 143, "page": 1, "limit": 20 }
}
```

Row shapes are unchanged from before this PR (`manager-reports`:
`{...AuditLog fields, actorName}`; `logs`: `{id, actorRole, category,
action, detail, createdAt, actorName, unit, level}`; `system-events`:
`{id, at, user, actorRole, action, detail, level}`).

Permission enforcement is real and live: `EmployeePermissionGuard` blocks
an EMPLOYEE lacking `lg_view` from `/audit/logs` even though `@Roles`
allows the `EMPLOYEE` role generically; granting/revoking `lg_view` via
`PATCH /it/employees/:id/permissions` changes access on the very next
request, no caching, no re-login needed.

---

## 8. Cartable / referrals (agency collaboration inbox)

### Agency membership request submission now creates a site-admin cartable item

`POST /agencies/requests` (the public, OTP-verified pre-registration
endpoint — unchanged request/response shape) now, as a side effect,
creates one `AGENCY`-category cartable task **for every active SITE_ADMIN**
(`sourceType: "AGENCY_REQUEST"`, `sourceId: <requestId>`) plus a
`REQUEST`/`CREATED` notification for each of them. No audit-log row is
written for this step specifically (an anonymous public applicant has no
real `actorId` to attribute it to — the cartable task + notifications are
the durable record of the submission).

### Cartable endpoints (all `JwtAuthGuard` + role/permission-scoped, all
self-scoped to `assigneeId = actor.id` — "کارتابل من")

| Method | Path | Notes |
|---|---|---|
| GET | `/cartable` | list — `?category=&date=&status=` (status defaults `OPEN`) + per-category OPEN counts |
| GET | `/cartable/unread-count` | `{ "count": number }` — never-viewed tasks, any status |
| GET | `/cartable/:id` | **new** — detail + `history` (this task's own AuditLog rows); first view sets `readAt` (idempotent — repeat views don't move it) |
| PATCH | `/cartable/:id/approve` | body `{ "note": string }`, note required |
| PATCH | `/cartable/:id/reject` | same body |
| PATCH | `/cartable/:id/transfer` | body `{ "toId": string, "note": string }` — "refer" — creates a new OPEN task for the target, marks the original TRANSFERRED, and now also sends the target a `CARTABLE`/`REFERRED` notification |

`GET /cartable/:id` response:
```jsonc
{
  "id": "uuid", "assigneeId": "uuid", "category": "AGENCY",
  "title": "...", "description": "...",
  "senderId": "uuid|null", "sender": { "id": "...", "fullName": "...", "role": "..." },
  "senderLabelFa": "متقاضی · ...",
  "sourceType": "AGENCY_REQUEST", "sourceId": "uuid",
  "status": "OPEN", "resolutionNote": null,
  "transferredToId": null, "transferredTo": null,
  "resolvedAt": null,
  "readAt": "2026-08-08T12:00:00.000Z",     // set on first GET
  "createdAt": "...",
  "history": [ /* AuditLog rows: {id, action, detail, createdAt, ...} for this task's own lifecycle */ ]
}
```

### Agency membership request referral (`PATCH /agencies/requests/:id/refer`)

Body: `{ "referredToId": "uuid", "note"?: "string" }`. Now
**concurrency-safe** (pessimistic row lock + status check inside one
transaction — previously a plain read-then-write, which could race a
simultaneous approve/reject/refer into a lost update). Also now sends the
referred-to manager a `REQUEST`/`REFERRED` notification in addition to the
existing cartable task + audit-log entry. `PATCH .../reject` got the same
concurrency-safety fix.

`DECIDABLE_STATUSES = ['PENDING', 'REFERRED']` — a request may legitimately
be re-referred while already `REFERRED` (chained referral is intentional,
not a bug); the only true mutually-exclusive race is between the terminal
transitions `REJECTED` and `APPROVED` (finance stage).

---

## 9. Career attachment delete

New, general-purpose **`DELETE /files/:id`** (added to the existing
`FilesModule` used for referral/message/careers-image attachments — not a
careers-only route, since job-posting cover images are ordinary
`StoredFile` rows uploaded via the existing `POST /files`).

- **Role gate**: any authenticated staff role (`STAFF_ROLES` — EMPLOYEE,
  IT_MANAGER, COMMERCIAL_MANAGER, FINANCE_MANAGER, SENIOR_MANAGER, CEO,
  BOARD_CHAIR, SITE_ADMIN), same as the existing `POST`/`GET` on this
  controller — customers/agencies never reach this route.
- **Auth**: owner-only (`stored.ownerId === actor.id`) — stricter than
  `GET /files/:id`'s participant-based read access. Non-owner → `403
  FORBIDDEN`.
- **Idempotent/safe**: deletes the DB row first, then best-effort removes
  the on-disk file (`fs.rmSync(path, { force: true })` — tolerates the
  physical file already being gone). A repeat `DELETE` on the same id →
  `404 NOT_FOUND` (the row is already gone) — standard, safe idempotent
  DELETE semantics; the end state after N calls is identical to after 1.
- If the deleted file is a job-posting's cover image
  (`JobPosting.imageFileId`), the FK's `ON DELETE SET NULL` clears it
  automatically at the DB level — no application code needed, verified in
  tests (`GET /careers/jobs/:id` then returns `imageFileId: null,
  imageUrl: null`).
- Writes an `AuditLog` row (`category: CONTENT`, `entityType: "StoredFile"`).

```jsonc
// DELETE /files/:id → 200
{ "success": true, "data": { "id": "uuid" } }
```

### Bonus fix in the same area — `generalReqs`/`specialReqs` are now
guaranteed real arrays

`JobPosting.generalReqs`/`specialReqs` are nullable at the DB level
(defense-in-depth for hand-written rows); `GET /careers/jobs/:id` and
`GET /careers/postings` previously could return `null` for either field,
which would crash frontend code doing `job.generalReqs.length`. Both are
now always serialized as `[]` when the underlying value is `null` — the
contract is unconditionally `string[]`, never `null`, in both the public
detail endpoint and the SITE_ADMIN postings list.

### Education-level / years-of-experience — reviewed, no backend change needed

`eduEntries`/`workEntries`/`langEntries` are opaque, unvalidated JSON blobs
(`Json` columns, capped at 20 entries, shape never enforced server-side —
same pattern as `SupportTicket.history`). PR #126's own `DEGREE_OPTIONS`
(دیپلم…دکتری) and `WORK_YEAR_OPTIONS` (Jalali years) dropdowns are
frontend-only constants; there is no backend "education levels" or "years"
options endpoint to call, and none is needed — whatever field names/shapes
the frontend sends round-trip through `POST /careers/jobs/:id/apply` and
back out of `GET /careers/applications/:id` unchanged and verified
end-to-end in tests.

---

## Summary — full endpoint table (this PR only)

| Method | Path | New / Changed |
|---|---|---|
| GET/POST | `/flights/aircraft-definitions` | new canonical alias |
| GET/PUT/PATCH | `/flights/aircraft-definitions/:id` | new canonical alias |
| GET | `/flights/aircraft-definitions/:id/seat-map` | new |
| GET | `/flights/:instanceId/commitments` | unified (was split) |
| GET | `/flights/:instanceId/commitments/summary` | new |
| POST | `/flights/:instanceId/commitments` | unified (was split charter/agency routes) |
| DELETE | `/flights/:instanceId/commitments/:id` | unified |
| PATCH | `/pricing/proposals/:id/approve` | new canonical alias for `register` |
| GET | `/search/flights` (+ connections) | added `definitionStatus`/`publishStatus` |
| GET | `/flights/:id/definition` | added `publishStatus` |
| GET | `/notifications` | new module |
| GET | `/notifications/unread-count` | new |
| PATCH | `/notifications/:id/read` | new |
| PATCH | `/notifications/read-all` | new |
| * | *(any endpoint)* | `403 ACCESS_REVOKED` now possible on any request |
| GET | `/audit/manager-reports` \| `/audit/logs` \| `/audit/system-events` | added pagination + actor/action/resource/dateFrom/dateTo filters, `meta` in response |
| GET | `/cartable/:id` | new |
| GET | `/cartable/unread-count` | new |
| PATCH | `/cartable/:id/transfer` | now also notifies |
| PATCH | `/agencies/requests/:id/refer` | now concurrency-safe + notifies |
| DELETE | `/files/:id` | new |

Migrations added: `RenameCommitmentFields`, `Notifications`,
`CartableTaskReadAt` (see `backend/src/database/migrations/`, all
additive, none touch pre-existing columns' data).
