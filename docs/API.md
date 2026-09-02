# API.md — blujet endpoints (human-readable summary)

Single source of truth is `docs/openapi.json`, regenerated on every backend
boot (`main.ts`) and after every phase. This file is a curated summary —
**only Phase 1 is specified below**; later phases are appended here as they
land, per `CLAUDE.md` workflow rule 1 (no feature code before its endpoints
are documented and approved here).

Envelope on every response: `{ success, data?, error?: { code, message } }`.
Auth: `Authorization: Bearer <accessToken>` (JWT, short-lived) +
httpOnly refresh cookie. All endpoints below require an authenticated staff
session unless marked public.

## API gateway contract

- The canonical base path is `/api/v1`. During the compatibility window, each
  existing unprefixed endpoint remains an alias with identical method,
  authentication, status, and payload semantics. For example,
  `/api/v1/auth/me` and `/auth/me` reach the same handler.
- `GET /health` and `GET /api/v1/health` are public, unauthenticated, and
  rate-limit-exempt. They report database/build readiness without secrets.
- Every response carries `X-Request-Id`. Clients may supply a 1-128 character
  identifier containing ASCII letters, digits, `.`, `_`, `:`, or `-`; invalid
  values are replaced with a server-generated UUID.
- The edge honors forwarded client IP/protocol/host only through the configured
  trusted proxy chain. Application logs use the resolved real IP.
- General traffic is rate-limited per resolved IP. Login endpoints are limited
  to 5 attempts/minute and OTP issuance endpoints to 3 attempts/minute; their
  tracker also incorporates the normalized username/phone/email identity.
- Controller processing is limited to 30 seconds by default and request bodies
  to 10 MiB by default. Limits are environment-configurable. Gateway timeout
  and oversized-body responses use the common envelope.
- Gateway error codes add `REQUEST_TIMEOUT` (HTTP 504) and
  `PAYLOAD_TOO_LARGE` (HTTP 413). `RATE_LIMITED` remains HTTP 429.
- JSON request logs include correlation ID, real IP, method, URL, status, and
  duration. Nginx and NestJS share the same validated correlation ID.
  Credentials, tokens, cookies, query strings, OTPs, and passenger identity
  fields are redacted or omitted. Nginx-local oversized-body failures also
  return the common JSON error envelope.

**Money fields (post Int→BigInt migration, see `docs/DB_SCHEMA.md`):**
every IRR-denominated field (`priceIrr`, `taxIrr`, `amountIrr`,
`signedAmountIrr`, `limitIrr`, `feeIrr`, ... — any field ending `Irr`,
plus `PromoCode.value`) is serialized as a **decimal string**, not a JSON
number, in every response (`{"priceIrr": "5000000"}`) — a JS `number`
can't safely hold amounts above 2^53. The same fields accept either a
decimal string or a plain integer as client input.

---

## Phase 1 — Auth, RBAC, panel shell, dashboard/reporting

### Auth (`backend/src/modules/auth/`)

| Method | Path                       | Auth           | Notes                                                                                                                                                      |
| ------ | -------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/staff/login`        | public         | `{ username, password }` → if correct, issues a `TwoFactorChallenge` and returns `{ challengeId }` (never a token yet). Rate-limited per-IP + per-account. |
| POST   | `/auth/staff/login/verify` | public         | `{ challengeId, code }` → on success, sets refresh cookie + returns `{ accessToken, user }`. 6-digit/2-min TTL/single-use/hashed, per Security Rules.      |
| POST   | `/auth/refresh`            | refresh cookie | Rotates refresh token, returns new access token.                                                                                                           |
| POST   | `/auth/logout`             | bearer         | Revokes the current refresh token.                                                                                                                         |
| GET    | `/auth/me`                 | bearer         | `{ id, fullName, role, permissions? }` — drives the frontend's role-scoped nav.                                                                            |

Error codes: `INVALID_CREDENTIALS`, `TWO_FACTOR_REQUIRED`, `TWO_FACTOR_INVALID`, `TWO_FACTOR_EXPIRED`, `ACCOUNT_SUSPENDED`.

### Panels (`backend/src/modules/panels/`)

| Method | Path                       | Roles                           | Notes                                                                                                                                                                                                                                                  |
| ------ | -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/panels/nav`              | any staff role                  | Returns the caller's role-scoped tab list (server-computed — the frontend never decides visibility itself, per CLAUDE.md's "never by hiding UI alone" rule).                                                                                           |
| GET    | `/panels/access`           | CEO, SENIOR_MANAGER, IT_MANAGER | Current `PanelAccessFlag` states for the panels that role is allowed to toggle (CEO: finance/commercial/IT; Senior Manager: +CEO panel, site admin; IT: none — IT's "دسترسی به پنل‌ها" tab in the design is read-only informational, no toggle wired). |
| PATCH  | `/panels/access/:panelKey` | CEO, SENIOR_MANAGER             | `{ enabled }` → toggles a sibling panel; writes an `AuditLog(category=ACCESS)` row.                                                                                                                                                                    |

### Customers — SITE_ADMIN / SENIOR_MANAGER (`backend/src/modules/customers/`)

پنل ادمین سایت → تب «مشتریان» (فهرست USERها، جستجو با موبایل، جزئیات).

| Method | Path                          | Roles                      | Notes                                                                                                                                                                                                                                 |
| ------ | ----------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/customers`                  | SITE_ADMIN, SENIOR_MANAGER | Query: `q?` (mobile digits). Returns `{ customers[], incompleteCount, total }`. Completion uses the five canonical fields defined in Phase 68. National ID is decrypted for site admin and masked for senior manager.                 |
| GET    | `/customers/incomplete-count` | SITE_ADMIN, SENIOR_MANAGER | `{ count }` for sidebar badge.                                                                                                                                                                                                        |
| GET    | `/customers/:id`              | SITE_ADMIN, SENIOR_MANAGER | Read-only detail for tabs: profile, `docs` (KYC id-card), `purchases` (bookings), `refunds` (استرداد via booking.userId), `contacts` (support tickets by userId/phone), `club`. Sensitive identity data is masked for senior manager. |

### Reporting (`backend/src/modules/reporting/`)

Shared by all 6 panels' dashboard/finance tabs — confirmed identical KPI
set and chart shape across every panel report.

| Method | Path                                   | Roles                                                                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | -------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/reporting/sales-chart`               | CEO, BOARD_CHAIR, SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER | Query: `granularity=day\|month\|q3\|q6\|year\|flight`, `month?`, `date?`, `flightNo?`. Returns per-period `{ label, systemIrr, charterIrr, agencyIrr }[]` — computed server-side from `LedgerEntry`, grouped by `Booking.channel`.                                                                                                                                                                                                                                                                                |
| GET    | `/reporting/flight-sales`              | same                                                                  | «شماره پرواز» picker for the analytic مالی tab: departed `FlightInstance` rows (newest first, cap 60) with per-channel SALE sums, route cities, seats. `{ rows: [{ flightInstanceId, flightNo, originCode, destCode, originCityFa, destCityFa, departureAt, systemIrr, charterIrr, agencyIrr, totalIrr, capacity, soldSeats }] }`. The CEO/analytic UI collapses rows that share the same `flightNo` into one card (summed channel sales + seats) and shows cards only after the user searches (no default list). |
| GET    | `/reporting/kpis`                      | same                                                                  | Query: `granularity`, `periodKey?` (selected bar/day/month) → `{ revenueIrr, profitIrr, marginPct, operatingCostIrr, agencyDebtIrr, agencyDebtCount, trend: {...} }`. Re-scopes to the selected period, matching the "KPIs re-scope when a chart month is selected" rule.                                                                                                                                                                                                                                         |
| GET    | `/reporting/completed-flights-summary` | same                                                                  | Same `granularity`/`periodKey` filter → `{ flightCount, totalSeats, soldSeats, unsoldSeats }`, synced to the same period as the chart.                                                                                                                                                                                                                                                                                                                                                                            |
| GET    | `/reporting/low-sales-alerts`          | CEO, BOARD_CHAIR, SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER | Flights &lt;72h out with occupancy below threshold — the design's recurring amber banner, currently hardcoded in every panel; this endpoint replaces the hardcoded copy with a real query.                                                                                                                                                                                                                                                                                                                        |
| GET    | `/reporting/commercial-overview`       | COMMERCIAL_MANAGER                                                    | Commercial dashboard KPI row: `{ activeAgencies, passengersThisMonth, pendingAgencyRequests }`.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GET    | `/reporting/site-admin-overview`       | SITE_ADMIN                                                            | Site-admin dashboard KPI row (design «آژانس فعال / مسافر این ماه / بلیط فروخته‌شده / درخواست در انتظار اقدام»): `{ activeAgencies, passengersThisMonth, ticketsSoldThisMonth, pendingActionCount, agenciesTrendPct, passengersTrendPct, ticketsTrendPct }` — `pendingActionCount` = pending/referred agency requests + SUBMITTED/REVIEW refunds + OPEN/IN_PROGRESS support tickets; trend fields are MoM % (null when previous month is 0 / N/A).                                                                 |
| GET    | `/reporting/finance-dashboard-stats`   | CEO, BOARD_CHAIR, SENIOR_MANAGER, FINANCE_MANAGER; EMPLOYEE with `fn_dashboard` | Dashboard KPI row matching the design cards: `{ activeAgencies, activeAgenciesTrendPct, passengersThisMonth, passengersTrendPct, ticketsSoldThisMonth, ticketsTrendPct, revenueThisMonthIrr, revenueTrendPct }`. Employee access is an explicit IT-manager grant and is enforced by `EmployeePermissionGuard`. |

### Manager activity / audit feed (`backend/src/modules/audit/`)

| Method | Path                     | Roles                                                                                                     | Notes                                                                                                                                                                                                                                    |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/audit/manager-reports` | CEO (excludes CEO/SENIOR_MANAGER/BOARD_CHAIR as actor), BOARD_CHAIR (sees all), SENIOR_MANAGER (sees all) | Query: `category?`, `actorRole?`, `q?` (search action/detail/actor name). Each row includes `actorName`. Role-specific exclusion filters are server-side per the confirmed per-panel behavior — never left to the frontend to hide rows. |
| GET    | `/audit/logs`            | IT_MANAGER, EMPLOYEE                                                                                      | `category=SYSTEM` + account-management entries — IT's "لاگ و رویدادها" tab; EMPLOYEE requires `lg_view`.                                                                                                                                 |
| GET    | `/audit/logs/export`     | IT_MANAGER, EMPLOYEE                                                                                      | UTF-8 CSV export (up to 100 filtered rows); EMPLOYEE requires `lg_export`.                                                                                                                                                               |
| POST   | `/audit`                 | internal (called by other modules, not directly by clients)                                               | Every write in every later-phase module calls this — not a public endpoint.                                                                                                                                                              |

---

## Phase 3 — Agencies

Roles column reflects the confirmed per-panel presence from the design
extraction — some actions (API key issuance, invoices, messaging) are
**not** uniform across the three roles that have an آژانس‌ها tab, and the
backend enforces that narrower set even though `SENIOR_MANAGER`/
`FINANCE_MANAGER`/`COMMERCIAL_MANAGER` all pass the base `@Roles` check on
the parent resource.

### `backend/src/modules/agencies/`

| Method     | Path                                       | Roles                                                                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET        | `/agencies`                                | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER                      | Query: `q?` (name/license/manager/city search), `debtorsOnly?` (Commercial's "آژانس‌های دارای بدهی" panel). Returns list + the same 4 KPI cards (active count, total credit granted, total used/debt, pending-settlement count) confirmed identical across all three panels.                                                                                                                                                                                               |
| GET        | `/agencies/:id`                            | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER                      | Detail: profile, computed stats (total sales, tickets issued, passengers), credit summary, recent activity timeline. `activityScore` (see DB_SCHEMA) is only included for FINANCE_MANAGER/COMMERCIAL_MANAGER — Senior Manager's detail view never showed it. For COMMERCIAL_MANAGER and FINANCE_MANAGER, also returns `commercialExtras`: `{ flightsSold[], purchasedServices[], financeSummary, transactions[] }` for the design's overview/finance/history sub-sections. |
| PATCH      | `/agencies/:id/suspend`                    | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER                      | `{ reason }` (required) → sets `suspendedAt`/`suspendReason`, `AuditLog(category=AGENCY)`.                                                                                                                                                                                                                                                                                                                                                                                 |
| PATCH      | `/agencies/:id/reactivate`                 | same as suspend                                                          | Clears suspension.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| GET        | `/agencies/:id/credit`                     | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER                      | `{ limitIrr, usedIrr (derived), remainingIrr }`.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PATCH      | `/agencies/:id/credit`                     | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER                      | `{ limitIrr }` — confirmed present in all three panels' Credit modal. Writes `AuditLog(category=AGENCY)`.                                                                                                                                                                                                                                                                                                                                                                  |
| POST       | `/agencies/:id/settle`                     | SENIOR_MANAGER, FINANCE_MANAGER                                          | "ثبت تسویه" — creates a `LedgerEntry(type=SETTLEMENT)` for the outstanding balance. **Not** shown in Commercial Manager's UI (which settles via invoices instead — see below), so not authorized for that role.                                                                                                                                                                                                                                                            |
| GET        | `/agencies/requests`                       | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER                      | List membership requests, `status?` filter. The public **POST** (an agency's own signup form) is deferred entirely — not implemented this phase, not even as a stub route — since it belongs to the not-yet-built agency-portal track and isn't in `docs/features/agencies.md`'s checklist.                                                                                                                                                                                |
| GET        | `/agencies/requests/:id`                   | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER                      | Applicant info + documents + (Senior/Commercial only) referral history.                                                                                                                                                                                                                                                                                                                                                                                                    |
| PATCH      | `/agencies/requests/:id/approve`           | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER                      | Creates the `AgencyProfile` + backing `User(role=AGENCY)`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| PATCH      | `/agencies/requests/:id/reject`            | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| PATCH      | `/agencies/requests/:id/refer`             | SENIOR_MANAGER, COMMERCIAL_MANAGER                                       | `{ referredToId, note? }` — confirmed only in those two panels' request-detail screen.                                                                                                                                                                                                                                                                                                                                                                                     |
| GET / POST | `/agencies/:id/api-key`                    | SENIOR_MANAGER only                                                      | Issue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| PATCH      | `/agencies/:id/api-key/:keyId`             | SENIOR_MANAGER only                                                      | `{ status: ACTIVE\|SUSPENDED }` or regenerate. Confirmed **exclusive** to Senior Manager's agency detail — Finance/Commercial never show this section.                                                                                                                                                                                                                                                                                                                     |
| GET / POST | `/agencies/:id/invoices`                   | COMMERCIAL_MANAGER (issue), FINANCE_MANAGER + SENIOR_MANAGER (read-only) | "صدور فاکتور" — confirmed only in Commercial Manager's agency detail → مالی sub-tab.                                                                                                                                                                                                                                                                                                                                                                                       |
| PATCH      | `/agencies/:id/invoices/:invoiceId/pay`    | FINANCE_MANAGER, COMMERCIAL_MANAGER                                      | Marks `PAID`, writes the `SETTLEMENT` ledger row (see DB_SCHEMA note — never a bare status flip).                                                                                                                                                                                                                                                                                                                                                                          |
| POST       | `/agencies/:id/invoices/:invoiceId/remind` | COMMERCIAL_MANAGER                                                       | "یادآوری" — queues a notification (SmsProvider/email interface, mocked in dev).                                                                                                                                                                                                                                                                                                                                                                                            |
| GET / POST | `/agencies/:id/messages`                   | COMMERCIAL_MANAGER only                                                  | "مکاتبه‌ها" chat thread — confirmed exclusive to that panel.                                                                                                                                                                                                                                                                                                                                                                                                               |
| POST       | `/agencies/debtors/notify-all`             | COMMERCIAL_MANAGER                                                       | Bulk "ارسال اعلان به همه" on the debtors panel.                                                                                                                                                                                                                                                                                                                                                                                                                            |

---

## Phase 4 — Cartable, referrals, manager messaging

See `docs/DB_SCHEMA.md` → Phase 4 for the wiring decisions (⚑) these
endpoints implement. Administrative workflows keep تأیید/رد/انتقال, while
internal staff messages use a two-way reply flow and stable conversation
history. `STAFF_ROLES` means every authenticated manager or employee role;
customer and agency accounts are excluded. Employees additionally need the
documented `ct_list`/`ct_process` grants from the IT permission catalog.

### `backend/src/modules/cartable/`

| Method | Path                         | Roles                               | Notes                                                                                                                                                                                                                                                                                                         |
| ------ | ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/cartable`                  | STAFF_ROLES                         | Caller's own tasks. Query: `category?` (ADMIN\|AGENCY\|MANAGER), `date?`, `status?` (default OPEN). Resolved items remain available through status filters; EMPLOYEE requires `ct_list`.                                                                                                                       |
| GET    | `/cartable/:id`              | STAFF_ROLES (sender or assignee)    | Returns task detail plus the complete chronological conversation history. The first assignee view marks the item read; closure never removes history. EMPLOYEE requires `ct_list`.                                                                                                                          |
| POST   | `/cartable/direct-message`   | STAFF_ROLES                         | Direct staff-to-staff delivery. Recipient must be another active staff account. EMPLOYEE requires `ct_process`.                                                                                                                                                                                             |
| POST   | `/cartable/:id/replies`      | STAFF_ROLES (OPEN assignee only)    | Marks the incoming row handled and adds a reciprocal OPEN message without closing the conversation. EMPLOYEE requires `ct_process`.                                                                                                                                                                          |
| PATCH  | `/cartable/:id/close`        | STAFF_ROLES (conversation participant) | Explicitly closes all OPEN rows in the internal conversation and preserves its chronological history in the APPROVED/archive filter. Inactive internal conversations are closed by the same lifecycle after four days without a new message. EMPLOYEE requires `ct_process`.                                                                                             |
| PATCH  | `/cartable/:id/approve`      | STAFF_ROLES (assignee only)         | `{ note }` — closes the current item. Resolving a workflow task whose `sourceType` has side effects triggers them (e.g. chair-permission APPROVED). EMPLOYEE requires `ct_process`.                                                                                                                           |
| PATCH  | `/cartable/:id/reject`       | EXEC_ROLES (assignee only)          | `{ note }` required. The design's red button is labeled «انصراف» but behaves as reject — kept as reject server-side.                                                                                                                                                                                          |
| PATCH  | `/cartable/:id/transfer`     | EXEC_ROLES (assignee only)          | `{ toId, note }` — creates a new OPEN task for `toId`, marks this one TRANSFERRED. 409 on already-resolved tasks (no double-resolution).                                                                                                                                                                      |
| POST   | `/cartable/chair-permission` | FINANCE_MANAGER, COMMERCIAL_MANAGER | The gate banner's «درخواست مجوز از رئیس هیئت مدیره» — 409 if one is already PENDING/APPROVED; creates one cartable task for every active `BOARD_CHAIR` account. The first valid decision wins atomically and closes the sibling tasks with the same result, so stale duplicate decisions cannot overwrite it. |
| GET    | `/cartable/chair-permission` | FINANCE_MANAGER, COMMERCIAL_MANAGER | Own latest request status — drives the banner's pending/approved state.                                                                                                                                                                                                                                       |

### Two-way internal staff conversations (2026-08-28)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/staff-directory` | STAFF_ROLES | Active staff recipients excluding the caller. EMPLOYEE requires `ct_process`; USER and AGENCY are never returned. |
| POST | `/cartable/direct-message` | STAFF_ROLES | `{ toId, subject, body, attachmentIds? }`; creates one recipient-owned OPEN internal cartable item with an isolated `conversationId`. EMPLOYEE requires `ct_process`. |
| POST | `/cartable/:id/replies` | STAFF_ROLES (OPEN assignee only) | `{ body, attachmentIds? }`; valid only for `MANAGER_MESSAGE`/`EMPLOYEE_MESSAGE`. Marks the received row handled, creates a reciprocal OPEN message in the same conversation, and does not close the conversation itself. Explicit conversation closure remains a separate `/close` action. |
| PATCH | `/cartable/:id/close` | STAFF_ROLES (conversation participant) | Closes all OPEN rows in the internal conversation with a retained resolution/history trail. The four-day inactivity lifecycle applies the same archived state automatically. |
| GET | `/cartable/:id` | conversation participant | Returns the task and the complete chronological conversation history. Resolved items remain readable and searchable through the existing status-filtered list. |

Department broadcasts delivered by `/manager-messages` create a distinct
conversation for each recipient. A reply therefore returns only to the sender
and cannot leak into another recipient's history.

### `backend/src/modules/staff-directory/`

| Method | Path               | Roles      | Notes                                                                                                                                                                          |
| ------ | ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/staff-directory` | STAFF_ROLES | Active staff users `{ id, fullName, role, roleLabelFa }`, excluding the caller and all customer/agency accounts. EMPLOYEE requires at least one applicable cartable/referral/agency-request permission. |

### `backend/src/modules/referrals/`

| Method | Path                              | Roles                                | Notes                                                                                                                                                                                   |
| ------ | --------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/referrals`                      | SENIOR_MANAGER                       | Sent referrals («ارجاعات من به مدیران») + the 4 KPI counts (کل/در انتظار گزارش/گزارش دریافت‌شده/بسته‌شده).                                                                              |
| POST   | `/referrals`                      | SENIOR_MANAGER                       | `{ title, body, recipientIds[] (≥1), priority, dueAt?, attachmentIds? }` — validation message per design: موضوع، شرح و حداقل یک مدیر مقصد الزامی است. Creates recipient cartable tasks. |
| GET    | `/referrals/:id`                  | SENIOR_MANAGER (sender) + recipients | Detail incl. recipients, attachments, reports thread.                                                                                                                                   |
| POST   | `/referrals/:id/reports`          | recipients only                      | `{ body, attachmentIds? }` — flips status to REPORTED. (No mock UI existed for this — see DB_SCHEMA ⚑.)                                                                                 |
| PATCH  | `/referrals/:id/close`            | SENIOR_MANAGER (sender)              | «تأیید دریافت گزارش و بستن» — only from REPORTED, else 409.                                                                                                                             |
| PATCH  | `/referrals/:id/request-revision` | SENIOR_MANAGER (sender)              | «درخواست اصلاح گزارش» — REPORTED → REVIEWING.                                                                                                                                           |
| POST   | `/referrals/:id/remind`           | SENIOR_MANAGER (sender)              | «ارسال یادآوری دریافت گزارش» — SENT/REVIEWING → REVIEWING, notifies recipients.                                                                                                         |

### `backend/src/modules/manager-messages/`

| Method | Path                     | Roles                  | Notes                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/manager-messages`      | STAFF_ROLES | `{ toDept, subject, body, attachmentIds? }` — department broadcast. Delivery creates one isolated cartable conversation per active recipient, excluding the sender, so replies cannot leak between recipients. |
| GET    | `/manager-messages/sent` | STAFF_ROLES | Sender's own broadcast history.                                                                                                                                                 |

### `backend/src/modules/files/`

| Method | Path         | Roles                                               | Notes                                                                              |
| ------ | ------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| POST   | `/files`     | any staff role or `USER`                            | multipart upload, PDF/image only, ≤ 5MB; returns `{ id, fileName }` for attaching. |
| GET    | `/files/:id` | owner + participants/reviewer of the attached entity | Streams the file; support-ticket owners/assignees and `SITE_ADMIN` reviewers are included; 403 otherwise. |

---

## Phase 8 — Employee management (IT Manager)

Scope covers the eleven implemented IT tabs (accounts/permissions, security,
services, web services, reservation, panel access, logs, survey, backups,
settings and the technical dashboard). The IT role remains full-access within
its panel; employee delegation is narrower and only reaches handlers carrying
an operation-level `@RequiresPermission` key. See `docs/DB_SCHEMA.md` → Phase
8 for the data model and the design's `PERM_CATALOG` reproduction.

### `backend/src/modules/it-manager/` — employees ("کاربران و دسترسی‌ها")

| Method | Path                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/it/permissions`                  | The seeded unit/action catalog (dept → sections → perms) for the IT create-employee form and detail modal. Commercial/sales cover agencies (partners/requests/debtors), routes, aircraft, flight operations, services, passenger reports, club rules and web services; finance covers agencies, credit/settlement, reports/exports and refunds. Legacy umbrella keys remain for backward compatibility.                                                                                                                                                                                                                                                               |
| GET    | `/it/employees`                    | Query: `dept?`, `q?` (name/username). List with `role` label, `dept`, `username`, `lastLoginAt`, `isActive`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| POST   | `/it/employees`                    | `{ fullName, username, phone (Iranian mobile), password (≥6), dept, customDeptLabel?, rank, referralScope, permissionKeys[] }` — creates `User(role=EMPLOYEE)`, normalizes the mobile to E.164, enables mandatory staff 2FA, hashes password (argon2), and grants the listed catalog permissions. A duplicate username or mobile returns 409. The design's `createStaffUser()` also always tags every new employee with `"dashboard"`/`"cartable"` — **not** carried over: neither corresponds to a real gate for `EMPLOYEE` in this backend (not a `REPORTING_ROLES`/`EXEC_ROLES` member), so faking the grant would be cosmetic only. `AuditLog(category=ACCOUNT)`. |
| GET    | `/it/employees/:id`                | Detail: profile + last login + granted permissions + the catalog rows not yet granted ("available"). 404 for non-EMPLOYEE / non-existent ids.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| PATCH  | `/it/employees/:id/status`         | `{ isActive }` — suspend/reactivate. `AuditLog(category=ACCOUNT)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| PATCH  | `/it/employees/:id/permissions`    | `{ permissionKey, grant }` — single toggle (mirrors the design's per-row switch). `AuditLog(category=ACCESS)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| POST   | `/it/employees/:id/reset-password` | Generates a temporary password, argon2-hashes it onto the account, sets `mustChangePassword=true`, records a `PasswordResetEvent`, `AuditLog(category=ACCOUNT)`. Returns the plaintext temp password **once** in this response only — never stored, never logged (per Security Rules' OTP/secret-at-rest pattern).                                                                                                                                                                                                                                                                                                                                                    |

### `backend/src/modules/it-manager/` — security ("رمزها و امنیت")

| Method | Path                               | Notes                                                                                                                                                                   |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/it/security/policy`              | The singleton `SecurityPolicy` row (auto-created with design's defaults on first read).                                                                                 |
| PATCH  | `/it/security/policy`              | Any subset of the toggle/param fields. `AuditLog(category=SECURITY)`.                                                                                                   |
| GET    | `/it/security/sessions`            | Active (non-revoked, non-expired) `RefreshToken`s joined to their user — "۴۸ کاربر هم‌اکنون وارد سامانه هستند" + per-row device/IP.                                     |
| POST   | `/it/security/sessions/logout-all` | Revokes every active `RefreshToken` site-wide — the design's «خروج همه». `AuditLog(category=SECURITY)`, high-severity by nature so confirmed as IT-only, not delegated. |

### `backend/src/modules/it-manager/` — services ("سرویس‌های سایت")

| Method | Path                             | Notes                                                                                                                                                                                                                     |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/it/services`                   | `{ internal: InternalService[], external: ExternalServiceConfig[] }` (seeded rows from `site-data.js`'s `svcDefs`/`extDefs`; `apiKeyEncrypted` never returned in plaintext — masked).                                     |
| PATCH  | `/it/services/internal/:key`     | `{ enabled }` — toggle, immediate (per design copy "بلافاصله روی سایت اعمال می‌شود"). `AuditLog(category=SYSTEM)`.                                                                                                        |
| POST   | `/it/services/external`          | Create — `{ nameFa, provider, endpoint, method, timeoutMs, apiKey?, sandbox }`; `apiKey` encrypted at rest (`pii-crypto` AES-256-GCM, reused generically — not a PII field but the same reversible-encryption primitive). |
| PATCH  | `/it/services/external/:id`      | Update any field incl. `enabled` toggle.                                                                                                                                                                                  |
| DELETE | `/it/services/external/:id`      | Remove.                                                                                                                                                                                                                   |
| POST   | `/it/services/external/:id/test` | Real connectivity check — HTTP request to the stored endpoint with the configured method/timeout/key, hard-capped; records `lastTestAt/lastTestOk/lastTestMessage`. Never fakes a result.                                 |

### `backend/src/modules/it-manager/` — backups ("پشتیبان‌گیری")

| Method | Path                   | Notes                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/it/backups`          | `BackupRecord` list, newest first.                                                                                                                                                                                                                                                                                                                                                   |
| POST   | `/it/backups`          | Triggers a real `pg_dump` (via `DATABASE_URL`) to the configured backup directory; creates a `RUNNING` row, updates to `SUCCESS`/`FAILED` with size/error when the process exits. Never simulated. The production backend image installs `postgresql-client`, so the runtime always contains the required binary; database/permission failures still produce an honest `FAILED` row. |
| GET    | `/it/backups/schedule` | Static config describing the server-side cron (`scripts/backup-db.sh`, already documented in `docs/RUNBOOK.md`) — informational only, this phase does not add a second, competing scheduler.                                                                                                                                                                                         |

Restore is intentionally **not** a one-click endpoint: CLAUDE.md's own
deployment rules treat restore as a manual, RUNBOOK-documented operation
("once a month, restore the latest dump into a throwaway container") — wiring
a database-overwriting action behind a panel button would contradict that,
not implement it faster.

### `backend/src/modules/it-manager/` — dashboard ("داشبورد فنی")

| Method | Path            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/it/dashboard` | `{ kpis, serviceHealth, resources, recentEvents }`. `kpis`: active employees, active sessions, services up/total, last backup status+age. `allServicesHealthy` is true only when at least one service is configured and **every internal and external service is enabled**; an empty catalogue or a disabled external dependency is unhealthy. `serviceHealth`: from `InternalService`+`ExternalServiceConfig`. `resources`: **real** host memory (`os.totalmem/freemem`) + 1-minute load average (`os.loadavg`) — never synthetic/random numbers. `recentEvents`: latest `AuditLog` rows across SYSTEM/ACCOUNT/ACCESS/SECURITY. |

### Logs ("لاگ و رویدادها") and Panels access ("دسترسی به پنل‌ها")

`GET /audit/logs` and `GET /panels/access` are reused by the IT panel. The
additional `/audit/logs/export` handler uses the same server-side filters and
is guarded by the dedicated `lg_export` capability.

---

## Phase 9 — Reservation system (seat lock / PNR)

Roles: `CEO` + `BOARD_CHAIR` (nav label **هواپیما**), `COMMERCIAL_MANAGER`
(from flight management), and `IT_MANAGER`
(سامانه رزرواسیون) have the reachable reservation nav entry per
`panel-nav.config.ts`. `SENIOR_MANAGER` stays authorized at the API level
(⚑ product decision, see `docs/DB_SCHEMA.md` → Phase 9) but — per the
2026-08-03 senior-panel trim — no longer has a reachable nav entry; it is
view-only. `canLock` (PNR cancel / change-seat / manual issue / no-show) =
`CEO`/`BOARD_CHAIR`/`COMMERCIAL_MANAGER`/`IT_MANAGER`. Seat-map managerial
lock/release/approve/reject is narrower: `CEO`/`BOARD_CHAIR`/
`COMMERCIAL_MANAGER` — **IT Manager
cannot manually lock seats** (view sold-seat passenger details only).
`SENIOR_MANAGER` is view-only on every write endpoint below (403).

### `backend/src/modules/reservation/`

| Method | Path                                          | Roles                                                                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/reservation/seatmap/:flightInstanceId`      | BOARD_CHAIR, SENIOR_MANAGER, IT_MANAGER, COMMERCIAL_MANAGER, CEO             | Computed from `AircraftSeatMap` (by the instance's `Flight.aircraftType`) + confirmed sales + unexpired 15-minute checkout holds + active `SeatLock`s. Returns `{ flightNo, origin/dest (+ cityFa), departureAt, rows[], cabinLayout, soldCount, heldCount, managerLockedCount, blockedCount, lockedCount, freeCount, capacity, occupancyPct }`. Cell status is one of `FREE                              | HELD | SOLD | LOCKED | BLOCKED`; held cells carry `holdExpiresAt`, sold/held cells carry the authorized passenger shape, and managerial locks carry classification/approval/agency fields. Staff-only; IT is read-only. |
| POST   | `/reservation/seatmap/:flightInstanceId/lock` | canSeatLock only (`CEO`/`BOARD_CHAIR`/`SENIOR_MANAGER`/`COMMERCIAL_MANAGER`) | `{ seatCode, agencyId?, passengerName?, passengerNationalId?, passengerMobile?, reason, classification, discountPct? }` — agencyId must reference an active `AgencyProfile`; passenger/agency/anonymous targets are supported. 409 if sold/locked. PII remains encrypted+hashed. IT_MANAGER → 403.                                                                                                        |
| PATCH  | `/reservation/seatmap/locks/:id/release`      | canSeatLock only                                                             | Any canSeatLock role may release any active lock (the design's «×» chip shows no per-locker ownership filter). Sets `releasedAt`; 409 if already released. Audited. IT_MANAGER → 403.                                                                                                                                                                                                                     |
| GET    | `/reservation/pnr`                            | all 4 reservation roles                                                      | `q?` (PNR or passenger name). Grouped by flight instance, newest first — the design's «مدیریت رزروها» list.                                                                                                                                                                                                                                                                                               |
| GET    | `/reservation/pnr/:pnr`                       | all 4                                                                        | Full detail incl. passenger + boarding-pass fields. 404 if not found.                                                                                                                                                                                                                                                                                                                                     |
| PATCH  | `/reservation/pnr/:pnr/seat`                  | canLock only                                                                 | `{ seatCode }` — «تغییر رزرو»; 409 if the target seat is sold/locked by someone else; 409 if the booking is CANCELLED. Audited.                                                                                                                                                                                                                                                                           |
| PATCH  | `/reservation/pnr/:pnr/cancel`                | canLock only                                                                 | «لغو رزرو» → `BookingStatus.CANCELLED`; releases the seat for resale; 409 if already CANCELLED. Audited.                                                                                                                                                                                                                                                                                                  |
| GET    | `/reservation/search`                         | all 4                                                                        | `origin`, `dest`, `date` (Jalali, converted) → matching `SCHEDULED` `FlightInstance`s with a computed price (`FarePricingProposal.registeredPriceIrr` if REGISTERED, else a documented flat fallback — no invented dynamic pricing) and free-seat count.                                                                                                                                                  |
| POST   | `/reservation/pnr`                            | canLock only                                                                 | «صدور PNR و بلیط» — staff-side **manual/offline** issuance (phone/counter booking): `{ flightInstanceId, seatCode, passengerName, passengerNationalId?, passengerMobile? }` → creates a `TICKETED` `Booking`+`Passenger` directly (no HELD/PAID steps — no payment gateway involved, distinct from the public paid-checkout track) + a `LedgerEntry(type=SALE)`. 409 if the seat is sold/locked. Audited. |
| GET    | `/reservation/dashboard-stats`                | all 4                                                                        | Real counts (today's bookings, active PNRs, seats sold, revenue) plus `channels[]` (share of non-cancelled bookings by `Booking.channel`) and `services[]` (dependent toggles from `InternalService` + measured DB latencies — no invented uptime).                                                                                                                                                       |
| GET    | `/reservation/agency-api-access`              | all 4                                                                        | Agencies that already have an `AgencyApiKey` — masked key hint (`bjk_••••…`), lifetime `callCount`, ACTIVE/SUSPENDED. Empty list → design empty state.                                                                                                                                                                                                                                                    |
| GET    | `/reservation/flights`                        | all 4                                                                        | `q?` — SCHEDULED instances with sold/capacity/occupancy and statusKey `SELLING`/`NEAR_FULL`/`FULL` for the design «پروازها» table.                                                                                                                                                                                                                                                                        |
| POST   | `/reservation/_test/flight-instance`          | all 4                                                                        | E2E only — creates a fresh SCHEDULED instance with a randomized far-future date (avoids collisions across repeated test runs); always 404s in production. Same pattern as `club`'s and `pricing`'s own `_test/*` seeding hooks.                                                                                                                                                                           |

Flight/schedule **creation** stays on Phase 10's `/flights/*` (not this shell).

---

## Agency Portal (self-service, پنل آژانس) — separate track, reassigned into this session

Explicitly authorized by the user (2026-07-17, after confirming this feature
did not exist anywhere despite `CLAUDE.md` scoping it to the public-site
track). Grounded in a full extraction of `پنل آژانس.dc.html`'s 7 نav tabs
(دشبورد/صندلی‌های تخصیص‌یافته/وب‌سرویس/اعتبار و مانده/فروش و گزارش/کارتابل و
پیام‌ها/پروفایل و مدارک) and reuses Phase 3's `AgencyProfile`/
`AgencyCreditLine`/`AgencyInvoice`/`AgencyMessage`/`AgencyApiKey` — this is
the agency's own self-service view over the SAME rows the staff آژانس‌ها tab
already manages, not a parallel data model.

⚑ **Login mechanism (product decision, no design-confirmed spec existed —
the design's «آژانس همکار» login tab labels the identifier «نام کاربری / کد
آژانس», a concept with no backing field anywhere in the schema):** login is
phone + password, no 2FA (`User.phone`, already populated for every AGENCY
user since Phase 3's `approveRequest` sets it from the membership request) —
reusing real data instead of inventing an "agency code" column. Frontend
copy reads «شماره تماس آژانس» rather than copying the design's literal
"کد آژانس" label, to stay honest about what's actually collected. 2FA is
skipped because the design shows no 2FA step anywhere in the آژانس همکار
tab (unlike staff login, which is 2FA-mandatory per `CLAUDE.md`).
`approveRequest` (Phase 3) is extended to also issue a one-time temp
password (same pattern as IT Manager's employee `resetPassword`) — before
this, an approved agency had a `User` row with `passwordHash: null` and no
way to ever log in.

⚑ **Credit top-up reinterpreted as an audited request, not a mutation**
(the design's «افزایش اعتبار» modal directly raises `_limitN` client-side —
exactly the mutable-balance anti-pattern `CLAUDE.md`'s financial rules
forbid carrying over). The agency submits an `AgencyCreditRequest`; a
staff member with credit authority (`SENIOR_MANAGER`/`FINANCE_MANAGER`/
`COMMERCIAL_MANAGER` — the same three roles already authorized on
`PATCH /agencies/:id/credit`) decides it, and only that decision calls the
existing `updateCredit` service method. No new code path can change a
credit limit outside that one already-audited method.

Deferred, not silently dropped (see `docs/features/agency-portal.md` for
full reasoning): «صندلی‌های تخصیص‌یافته» (allocated seats) — no staff-side
allocation workflow exists anywhere to allocate seats to an agency in the
first place; «وب‌سرویس» self-service API purchase+approval — no staff-side
purchase-approval counterpart exists (only issuance via Phase 3's Senior
Manager-only `AgencyApiKey` flow, which stays staff-initiated); staff-side
document review (uploaded docs stay `PENDING` — reviewing them is a new
staff workflow, not part of this slice); Excel export (mock-only button,
not a real feature anywhere else in the codebase either).

### `backend/src/modules/auth/` (new agency login path)

| Method | Path                 | Roles  | Notes                                                                                                                                                                                                                                                                                                                                                          |
| ------ | -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/agency/login` | public | `{ phone, password }` → `{ accessToken, user }` directly (no 2FA challenge step, unlike staff login). 401 on bad credentials, 403 if suspended (`AgencyProfile.suspendedAt` set) or inactive. Sets the same httpOnly refresh cookie as staff login; `/auth/refresh`, `/auth/me`, `/auth/logout` are already role-agnostic and work unchanged for AGENCY users. |

### `backend/src/modules/agencies/` (staff-side additions)

| Method | Path                                          | Roles                                               | Notes                                                                                                                                                                                               |
| ------ | --------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/agencies/:id/credit-requests`               | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER | Pending + decided `AgencyCreditRequest` rows for one agency.                                                                                                                                        |
| PATCH  | `/agencies/:id/credit-requests/:reqId/decide` | same as above                                       | `{ approve: boolean }` — approve calls the existing `updateCredit` internally with the requested limit (single audited code path); reject just marks `REJECTED`. 409 on an already-decided request. |

### `backend/src/modules/agency-portal/` — self-scoped to the caller (`actor.id` IS the `AgencyProfile.userId`; no `:id` param anywhere, ownership is implicit)

| Method | Path                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/agency-portal/dashboard`               | `{ credit, kpis: { salesThisMonthIrr, ticketsIssuedTotal, seatsSoldThisMonth }, monthlySales: [{month,salesIrr}] (last 6 months) }`. The design's «صندلی تخصیص‌یافته» KPI card is replaced with `ticketsIssuedTotal` (real, derived from `Booking`) — CLAUDE.md forbids fabricating a figure for a workflow (seat allocation) that doesn't exist yet, same reasoning as Phase 9's dashboard. |
| GET    | `/agency-portal/credit`                  | `{ limitIrr, usedIrr, remainingIrr }` — reuses `AgenciesService.getCredit(actor.id)` verbatim.                                                                                                                                                                                                                                                                                               |
| GET    | `/agency-portal/ledger`                  | Last 20 `LedgerEntry` rows for «گردش حساب اخیر» (recent activity), signed for +/- display.                                                                                                                                                                                                                                                                                                   |
| GET    | `/agency-portal/invoices`                | Own invoices — reuses `AgenciesService.listInvoices(actor.id)`. A completed agency-owned customer checkout also appears here as one `PAID` sale invoice linked by `bookingId`; this is committed atomically with the ticket, wallet entry and SALE ledger row.                                                                                                                                 |
| POST   | `/agency-portal/invoices/:invoiceId/pay` | «پرداخت از اعتبار» — reuses `AgenciesService.payInvoice` verbatim (same transactional conditional-update + `SETTLEMENT` ledger row as the staff-side pay action); ownership is implicit since the agency can only ever pass its own id.                                                                                                                                                      |
| POST   | `/agency-portal/credit-requests`         | `{ requestedLimitIrr, note? }` — must exceed the current limit; creates `AgencyCreditRequest(PENDING)`, audited, fans a `CartableTask` out to SENIOR_MANAGER/FINANCE_MANAGER/COMMERCIAL_MANAGER (no `sourceType` — informational only, the actual decision goes through the dedicated decide endpoint above, not generic cartable resolution).                                               |
| GET    | `/agency-portal/credit-requests`         | Own request history + status.                                                                                                                                                                                                                                                                                                                                                                |
| GET    | `/agency-portal/sales`                   | «فروش و گزارش»: own ticket list (`Booking` rows, PAID/TICKETED/REFUNDED) + per-flight aggregation + summary KPIs (کل فروش، بلیط صادرشده، میانگین نرخ، نرخ استرداد — all real, computed server-side per `CLAUDE.md`'s reporting rule).                                                                                                                                                        |
| GET    | `/agency-portal/inbox`                   | «کارتابل و پیام‌ها» — reuses `AgenciesService.listMessages(actor.id)`.                                                                                                                                                                                                                                                                                                                       |
| POST   | `/agency-portal/inbox`                   | `{ body }` — reuses a `senderIsAgency`-aware `AgenciesService.postMessage` (the staff-side controller keeps calling it with `senderIsAgency=false`; this path passes `true`).                                                                                                                                                                                                                |
| GET    | `/agency-portal/profile`                 | Own `AgencyProfile` fields — a dedicated lightweight query, NOT a reuse of the staff `detail()` method, since that method also returns internal `AuditLog` rows and an `activityScore` never meant for the agency's own eyes.                                                                                                                                                                |
| GET    | `/agency-portal/documents`               | Own `AgencyDocument` list.                                                                                                                                                                                                                                                                                                                                                                   |
| POST   | `/agency-portal/documents`               | multipart `{ file, docType }` — reuses `FilesService.store` (PDF/PNG/JPG, ≤5MB), wraps the resulting `StoredFile` in an `AgencyDocument(status=PENDING)`. Staff review is deferred (see above) — status stays `PENDING` until that phase.                                                                                                                                                    |

No `_test/*` seeding hook was needed for this feature (unlike club/pricing/reservation) — the seed already provisions two agencies (`+989120000002` gold, `+989120000003` silver, suspended) with the shared dev password, which is deterministic enough for Playwright. A `_test/set-password` endpoint was drafted and then removed: it would have lived under the same `@Roles('AGENCY')`-gated controller it was meant to bootstrap credentials for, which is unreachable before any credentials exist — a real chicken-and-egg gap, not a deliberate deferral.

---

## Phase 10 — Flight management (مدیریت پروازها)

Module `backend/src/modules/flights/`. Roles: `SENIOR_MANAGER` +
`COMMERCIAL_MANAGER` (the two panels with the tab; nav keys `flights` in
both — Commercial's tab already hosts Phase 6's pricing section, which
stays untouched on the same page).

- GET `/flights/overview` — the tab's data in one call: KPI row (پرواز
  فعال / صندلی فروخته‌شده / میانگین ضریب اشغال) + the three lists:
  - `active`: SCHEDULED instances — route label, flightNo, Jalali
    date/time, sold/capacity (+ derived status فعال/در حال فروش/تکمیل/لغو
    شده), basePriceIrr.
  - `completed`: DEPARTED instances — per-channel revenue sums from real
    bookings (سیستمی/چارتری/آژانس), tickets, نرخ اصلی, متوسط نرخ, سود/ضرر
    vs base rate + the 4 KPI totals.
  - `future`: SCHEDULED instances with `departureAt` beyond the active
    window — capacity, charterSeats, agencySeatsAllocated, persisted AI
    suggestion (if any), and the Jalali day list for the calendar filter.
- GET `/flights/airports` — seeded airport catalog for the add-flight
  selects.
- POST `/flights/airports` — `{ cityFa, code, tz? }` — add a city/airport
  to the catalog (Commercial «شهرهای پروازی» tab); 409 on duplicate code or
  city name; audited.
- POST `/flights` — full flight **definition** (Commercial/Senior +
  `fl_manage`): `{ originCode, destCode, flightNo (^\[A-Z\]{2}\d{4}$ —
uppercased only, no trim/strip), departureAt (UTC ISO),
durationMinutes (arrivalAt = departureAt + duration), capacity,
cabinCapacities[{cabin: ECONOMY|COMFORT|BUSINESS, seats}], basePriceIrr
(decimal string), aircraftType?, charterSeats?, chargeRules?,
competitorPriceIrr? }`. Cabin capacities must fit the aircraft seat-map
  (COMFORT requires real comfort rows; never merged into ECONOMY). The flight,
  charge rules and exactly one initial pricing proposal are created in one
  transaction and returned as `definitionStatus=DRAFT`. Commercial then
  calls `POST /flights/:id/submit-operations` → `PENDING_OPERATIONS`.
  Operations manager approves → `PENDING_CEO`; CEO register → `PUBLISHED`
  (bookable). `PUT /pricing/flights/:id/proposal` may refine the
  proposed/legal rate while the definition is in the approval pipeline.
- GET `/flights/:id/definition` — editable definition detail (real sold /
  derivedStatus + `publishStatus` + `version`). Under `PENDING_REVISION`,
  form fields come from `pendingRevisionSnapshot`; live published
  inventory stays sellable until CEO re-approves.
- PUT `/flights/:id/definition` — edit DRAFT / OPERATIONS_REJECTED /
  REJECTED in place; edit of PUBLISHED stages `PENDING_REVISION` without
  mutating live inventory. Audited.
- POST `/flights/:id/submit-operations` — Commercial/Senior/Employee+`fl_manage`
  — moves `DRAFT|OPERATIONS_REJECTED|REJECTED|PENDING_REVISION` →
  `PENDING_OPERATIONS`. Body `{ expectedVersion? }`. 409 on illegal state /
  version mismatch.
- PUT `/flights/:id/complete-and-submit` — Commercial/Senior/Employee+`fl_manage`
  — completes every eligible future occurrence materialized by the selected
  schedule template and submits the series to operations in one transaction.
  Body contains
  `{ expectedVersion?, basePriceIrr, competitorPriceIrr?, charterSeats?, chargeRules?, fareRules[], pricingProposal }`. Route,
  departure, aircraft and physical cabin capacities are checked against the
  locked occurrence/aircraft definition; the client may define fare-class and
  channel capacity but cannot rewrite physical capacity. Success returns the
  representative definition in `PENDING_OPERATIONS` plus `scheduleGroup`
  (`occurrenceCount`, `startAt`, `endAt`, `departures`). Any error rolls back
  every occurrence's definition, charges, fares, proposal and status together. This is the canonical Add
  Flight command; `POST /flights` remains a compatibility endpoint and is not
  used by the commercial Add Flight UI.
- GET `/flights/operations-queue` — `OPERATIONS_MANAGER` (+ Senior) —
  list instances awaiting ops (`status` defaults `PENDING_OPERATIONS`).
  Schedule-backed instances are grouped into one review row and include
  `scheduleGroup` with every operating date and the first/last date.
- GET `/flights/operations-overview` — `OPERATIONS_MANAGER` (+ Senior) —
  dashboard counters plus pending/recent workflow rows. Each row includes
  proposal prices/note, aircraft/capacity, status and optimistic-lock version.
- POST `/flights/:id/operations-decision` — ops only —
  `{ decision: APPROVED|REJECTED, comment, expectedVersion? }`. Comment
  required. Approve → `PENDING_CEO`; reject → `OPERATIONS_REJECTED`.
  Writes append-only `FlightReview`. For a schedule-backed representative the
  decision is atomic across every sibling occurrence in the same pending state.
- POST `/flights/:instanceId/cancel` — Commercial Manager — body `{ reason }`;
  cancels one scheduled occurrence, disables public sale, stores actor/reason/time,
  invalidates search, creates customer notifications, and attempts booking-contact SMS.
- GET `/flights/cancellations` — Commercial/Finance/Senior — cancelled occurrences
  with route, reason, actor/time, affected bookings, passengers and refund status.
- POST `/flights/:instanceId/cancellations/:bookingId/refund` — Finance Manager —
  idempotent full flight-cancellation refund. Writes an immutable ledger reversal,
  credits the owning customer wallet when present, and transitions the booking to
  `REFUNDED`.
- GET `/flights/:id/history` — reviews + audit trail for the instance
  (Commercial/Ops/CEO/Senior as permitted by role), including CEO decisions
  and every post-publication price change.
- PATCH `/pricing/flights/:flightInstanceId/price` — Commercial Manager only
  — `{ salePriceIrr, reason, expectedVersion? }`; changes the current sale
  price only for `PUBLISHED` inventory, enforces the legal-rate ceiling,
  bumps the flight version, invalidates search cache and appends an immutable
  PRICING audit event with the previous and new IRR amounts.
- GET `/flights/:instanceId` — flight detail modal: sold/cap, ضریب اشغال,
  قیمت پایه, real channel breakdown (seats + revenue per سیستمی/چارتری/
  آژانس) and مجموع درآمد from bookings.
- PATCH `/flights/:instanceId/plan` — the future-flight نرخ‌گذاری modal
  `{ priceToman, agencySeats }` — agencySeats capped at capacity −
  charterSeats (مستقیم derived); sets `basePriceIrr` +
  `agencySeatsAllocated`; audited. ⚑ price registration authority: in the
  mocks BOTH Senior and Commercial set the final rate directly here,
  which conflicts with Phase 6's approved CEO-approval flow — proposed
  resolution: this endpoint stores the plan figures, and for COMMERCIAL
  it also upserts the Phase 6 proposal (still requiring CEO registration
  to become the bookable price); SENIOR_MANAGER's save is allowed as-is
  for the plan figures only. The bookable price NEVER comes from this
  endpoint.
- Flight creation automatically requests and persists one advisory ML price
  suggestion after the creation transaction. Provider timeout/failure is a
  graceful no-op and never blocks creation or publishes a fare.
- POST `/flights/ai-analysis` — «تحلیل قیمت‌گذاری با هوش مصنوعی» over the
  future list, reusing Phase 6's ml-service client verbatim (2s timeout,
  graceful degradation, advisory only, persisted with modelVersion).
- POST `/flights/:instanceId/fare-rules/:ruleId/price-suggestion` — Commercial
  Manager / permitted commercial employee; body
  `{ channel: SYSTEM|AGENCY, competitorPriceIrr? }`. Returns a per-class
  advisory projection containing real capacity/released/sold/available seats,
  occupancy, hours to departure, base/current/competitor/suggested IRR values,
  rationale/factors and `source: ML|HEURISTIC`. It never mutates or publishes
  the fare rule; the existing site-price or agency-release command remains the
  mandatory human confirmation boundary.
- Deferred (explicit): خروجی Excel buttons (same deferral as Phase 3's,
  toast-only in mocks); RRULE schedules (no design UI — see DB_SCHEMA).

---

## Phase 13 — Reservation engine completion, Part A

See `docs/DB_SCHEMA.md`'s Phase 13 for the full reasoning. Note: the
public booking engine's own endpoints (`backend/src/modules/booking-engine/`
— `GET /search/flights`, `GET /search/flights/:id/seatmap`, `POST
/bookings`, `PATCH /bookings/:id/pay`, etc.) were built on the public-site
track and were never added to this file before the branches merged into
`main` — that's pre-existing doc debt from before this phase, not
something this phase caused; backfilling their full documentation here is
a separate task, not bundled into this one so this phase's diff stays
reviewable. Only what Phase 13 actually changes is documented below.

- `GET /search/flights` and `POST /bookings` (`booking-engine` module):
  - The authenticated booking controller accepts both `USER` and `AGENCY`
    identities so an agency session can complete the same public checkout;
    staff roles remain forbidden and every booking/read/payment stays scoped
    to the caller's `userId`.
  - `GET /search/cabins` returns the ordered distinct `CabinClass` values
    backed by currently sellable public flight instances. Homepage and agency
    searches use this catalogue instead of assuming only Economy/Business.
  - Both now respect `FlightInstance.saleStartsAt/saleEndsAt` — an instance
    outside its window is excluded from search results, and `POST /bookings`
    against one 409s `SALE_WINDOW_CLOSED`.
  - `POST /bookings` gains a channel-pool check alongside the existing
    per-seat conflict check — 409 `POOL_EXHAUSTED` (with which pool:
    `AGENCY` | `CHARTER` | `SYSTEM`) when the requested channel's pool is
    full, even if physical seats remain (they belong to a different pool).
  - A seat-bearing passenger may omit `seatCode`; under the same locked
    booking transaction the server assigns a free seat according to the
    documented family/gender/child/infant/exit-row policy. Supplied seat codes
    remain manual preselection and the server rejects more supplied seats than
    seat-bearing passengers.
  - `GET /search/flights/:id/seatmap` also returns the aircraft definition's
    `exitRows`, allowing clients and booking policy to share one DB-backed
    source of truth.
  - `seatsLeft` in search results uses the sum of Commercial Management's
    `FareRule.seatsAllocated` rows as the sellable cabin ceiling whenever fare
    classes exist. Aircraft/configured cabin capacity remains the hard upper
    bound; occupied seats and active agency/charter commitments are deducted.
    `POST /bookings` enforces this same ceiling transactionally.
- PATCH `/flights/:instanceId/aircraft` (new, `backend/src/modules/flights/`,
  `SENIOR_MANAGER` + `COMMERCIAL_MANAGER`, matching Phase 10's existing
  role gate) — `{ aircraftType }`. Re-points the instance at a different
  `AircraftSeatMap`; 409 `CAPACITY_BELOW_CONFIRMED` (with the shortfall
  count) if the new type's capacity is less than the instance's current
  confirmed-or-later booking + active-lock count. No design mock shows
  this control (aircraft type is create-only in every existing panel), so
  it's a new form field on the flight-detail view — not a redesign of an
  existing one.
- `PATCH /flights/:instanceId/plan` (existing, Phase 10) gains optional
  `saleStartsAt`/`saleEndsAt` (Jalali in the request, stored UTC) —
  additive, no change to its existing `priceToman`/`agencySeats` behavior.

## Phase 13 — Reservation engine completion, Part B

See DB_SCHEMA.md's Phase 13 Part B for the full reasoning — no design
screen exists for this yet, so these are backend-only for now.

- `GET /flights/:instanceId/fare-rules` — `SENIOR_MANAGER` +
  `COMMERCIAL_MANAGER`. Lists the instance's fare-class rows ordered by
  price.
- `POST /flights/:instanceId/fare-rules` — same roles —
  `{ cabin, classCode, priceIrr, seatsAllocated, taxIrr?, refundable?,
changeable?, baggageAllowanceKg?, validFrom?, validUntil?,
allowedChannels? }`. 400 `VALIDATION_FAILED` if this rule would push the
  cabin's total `seatsAllocated` past its physical seat count, or if
  `validUntil <= validFrom`.
- `PATCH /flights/:instanceId/fare-rules/:id` — same roles, same body
  (partial) and validations, re-checked against the instance's OTHER
  existing rules.
- `DELETE /flights/:instanceId/fare-rules/:id` — same roles — 409
  `CONFLICT` if any active booking (`DRAFT|HELD|PAID|TICKETED`) is already
  stamped with this rule's `classCode` for the instance.
- `getCabinPrice`'s return shape is unchanged (still just the per-seat
  `priceIrr`, pre-tax) for backward compatibility with every existing
  caller; `POST /bookings`'s response gains a `taxIrr` field (0 when the
  resolved price didn't come from a `FareRule`) alongside the existing
  `priceIrr`, which now includes the tax total.

## Phase 13 — Reservation engine completion, Part C

See DB_SCHEMA.md's Phase 13 Part C — staff-side allotment bookkeeping
only this phase; an agency actually booking against one is a follow-up
(no payment-path design exists for it yet).

- `GET /flights/:instanceId/allotments` — `SENIOR_MANAGER` +
  `COMMERCIAL_MANAGER`. Lists the instance's allotments (agency name,
  seats, type, releaseAt, contractPriceIrr), each flagged `active: boolean`
  (false once a SOFT row's `releaseAt` has passed).
- `GET /flights/:instanceId/allotments/summary` — same roles — returns the
  reservation-sourced capacity summary used by flight creation and pricing:
  `totalCapacity`, `charterSeats`, `agencySeats`, occupied direct-passenger
  seats, `freeSeats`, `agencyRevenueIrr`, and the active per-agency breakdown.
  Lap infants (`occupiesSeat=false`) do not reduce free capacity.
- `POST /flights/:instanceId/allotments` — same roles —
  `{ agencyId, seatsAllocated, type?, releaseAt?, contractPriceIrr? }`.
  400 `VALIDATION_FAILED` if the sum of every active allotment's
  `seatsAllocated` for this instance (including this new one) would
  exceed `FlightInstance.agencySeatsAllocated`, or if that field is unset.
  `releaseAt` is only meaningful (and only accepted) when `type: 'SOFT'`.
- `DELETE /flights/:instanceId/allotments/:id` — same roles — 409
  `CONFLICT` if that agency already has an active booking on this
  instance (there is currently no path that creates one — see
  DB_SCHEMA.md — so this guard is a no-op today and becomes real once
  agency booking creation lands).

## Phase 13 — Reservation engine completion, Part D

See DB_SCHEMA.md's Phase 13 Part D — backend-only governance layered onto
Phase 9's `SeatLock`; no design screen exists for a request/approval queue.
All endpoints live in `backend/src/modules/reservation/`, gated
`CAN_LOCK_ROLES` (`CEO`, `BOARD_CHAIR`, `IT_MANAGER`) unless noted.

- `POST /reservation/seatmap/:flightInstanceId/lock` (existing endpoint,
  changed body/behavior) — now `{ seatCode, reason, classification,
discountPct?, passengerName?, passengerNationalId?, passengerMobile? }`.
  400 `VALIDATION_FAILED` if `discountPct` is given without
  `classification: 'DISCOUNTED'` (or vice versa) or is outside 0–100.
  409 `LOCK_CAP_EXCEEDED` if the requester already has
  `MAX_ACTIVE_MANAGERIAL_LOCKS_PER_REQUESTER` (5) active locks anywhere.
  Creates the lock `PENDING_APPROVAL` with `expiresAt = now + 24h` — it no
  longer immediately behaves like an active managerial hold; it must be
  approved first.
- `PATCH /reservation/seatmap/locks/:id/approve` (new) — no body. 409
  `CONFLICT` if not `PENDING_APPROVAL`, expired, or the caller is the
  original requester (self-approval blocked). Sets
  `approvalStatus: APPROVED`, `approvedById/At`, `expiresAt = now + 48h`.
- `PATCH /reservation/seatmap/locks/:id/reject` (new) — `{ rejectionReason }`.
  409 `CONFLICT` if not `PENDING_APPROVAL` or already expired. Unlike
  approve, self-rejection IS allowed (a requester withdrawing their own
  pending request isn't the segregation-of-duties gap approval guards
  against). Sets `approvalStatus: REJECTED`, `rejectedById/At`,
  `rejectionReason`, and `releasedAt` immediately (frees the seat).
- `PATCH /reservation/seatmap/locks/:id/release` (existing) — unchanged;
  still works on any not-yet-released lock regardless of approval state
  (a requester or another authorized manager can always stand down early).
- `POST /reservation/pnr/from-lock/:lockId` (new) — `{ passengerName,
passengerNationalId?, passengerMobile? }`. 409 `CONFLICT` if the lock
  isn't `APPROVED` or has expired. Finalizes into a `TICKETED` booking
  priced per the lock's `classification` (see DB_SCHEMA.md), stamps the
  lock `releasedAt`/`bookingId`, records the same `LedgerEntry`+`AuditLog`
  pattern as the existing `POST /reservation/pnr` manual-issuance path.
- `GET /reservation/seatmap/:flightInstanceId` (existing) — response is
  unchanged in shape; a `LOCKED` seat now only reflects a currently-active
  lock (`releasedAt: null AND expiresAt > now`), so an expired
  never-approved request or an expired never-finalized hold shows as
  `FREE` again automatically.

## Phase 13 — Reservation engine completion, Part E

See DB_SCHEMA.md's Phase 13 Part E for full reasoning — a real bug fix
(payment reconciliation) plus a real-but-unwired flight-lifecycle gap
(`DEPARTED` was never written), not new UI-driven scope.

- `GET /reservation/pnr` / `GET /flights` completed-flights list
  (existing) — both now call `materializeDepartedInstances()` first, so
  «پروازهای انجام‌شده» reflects flights that have actually departed
  instead of only seed-backdated rows.
- `PATCH /reservation/pnr/:pnr/no-show` (new, `backend/src/modules/reservation/`,
  `CAN_LOCK_ROLES`) — marks a `TICKETED`/`FLOWN` booking `NO_SHOW`. 409
  `FLIGHT_NOT_DEPARTED` if the instance hasn't departed yet; 409
  `CONFLICT` if the booking is `CANCELLED`/`REFUNDED`/already `NO_SHOW`.
  Materializes departed instances + flown bookings first, so a booking
  that's technically still `TICKETED` in the DB (lazy flip hasn't run
  yet) is still handled correctly.
- New `backend/src/modules/reconciliation/` (`FINANCE_MANAGER` only,
  same gate as Phase 7 refunds):
  - `GET /reconciliation` — every `PENDING` `PaymentReconciliation` row
    (booking/PNR, gatewayRefId, amountIrr, age) — the actual "payment
    succeeded, ticket not issued" queue.
  - `PATCH /reconciliation/:id/resolve` — `{ resolutionNote }`. 409
    `CONFLICT` if already `RESOLVED`. Marks `RESOLVED`, audited (FINANCE
    category). Does not itself re-issue a ticket or reverse a charge —
    those remain separate, already-existing actions (manual PNR issuance,
    `PaymentGateway.reverse`) a finance user takes alongside resolving
    the queue entry; see DB_SCHEMA.md's reasoning for not automating this.
- `POST /bookings/:id/pay` (existing, `booking-engine` module) — behavior
  for `WALLET`/`POINTS` is unchanged. For `GATEWAY`, a `PaymentReconciliation`
  row is now created the moment the gateway confirms payment, before the
  ticketing transaction runs — invisible to the client (response shape
  unchanged), but real e2e evidence for anyone that a since-fixed bug (a
  transaction failure after gateway capture silently lost track of the
  money) can no longer happen unnoticed.

## Phase 14 — real SmsProvider + management log

See DB_SCHEMA.md's Phase 14 for full reasoning. Endpoints live in
`backend/src/modules/it-manager/` alongside the existing services tab
(`IT_MANAGER` only, matching that tab's existing role gate).

- `GET /it/services/sms-log` (new) — `{ enabled, todaySuccessCount,
todayFailedCount, recent: [{ id, phoneMasked, messageType, status,
failureReason, createdAt }] }` (latest 50). `enabled` is read straight
  from the existing `InternalService(key:"sms")` row — same value the
  existing `PATCH /it/services/internal/:key` toggle already writes; no
  new toggle endpoint needed. No uptime figure of any kind is returned.
- No other endpoint changes — `POST /admins` and `POST /admins/:id/reset-password`
  keep their existing request/response shape; they now genuinely send
  (or genuinely fail to send, if no phone is on file — see DB_SCHEMA.md)
  behind the same `delivery` flag, instead of only writing an audit-log
  sentence claiming they did.

---

## Phase 11 — Finance tab (مالی), گزارش مسافران, گزارش کارمندان

Grounded in the FINANCE / PASSENGER SEARCH / STAFF REPORTS markup of all 5
panels that carry these tabs. Design findings that scope this phase:

- The مالی tab has **two distinct layouts**: FINANCE_MANAGER gets the
  finance-ops view (KPI row + low-sales alert + completed-flights box +
  «تراکنش‌های مالی اخیر» + «ترکیب درآمد» donut + «تسویه‌حساب آژانس‌ها»);
  CEO/BOARD_CHAIR/SENIOR_MANAGER/COMMERCIAL_MANAGER get the analytic view
  (the full نمودار فروش with mode switcher روز/ماه/۳ماهه/۶ماهه/سال/پرواز +
  channel sum tiles + completed-flights box + «ترکیب درآمد» donut) — this
  matches CLAUDE.md's «تراکنش‌های اخیر و تسویه آژانس‌ها only in the finance
  manager panel» rule verbatim.
- The finance panel's `finMonths` income/expense bar chart is computed in
  the mock's script but **never rendered anywhere in its markup** (orphaned,
  same class as other confirmed orphans) — not built.
- Excel/PDF export buttons on گزارش مسافران are mock-only (toast) — same
  deferral as every prior phase.
- Almost the whole analytic مالی view is powered by the EXISTING Phase 1
  reporting endpoints (`/reporting/sales-chart` incl. `flight` granularity,
  `/reporting/kpis`, `/reporting/completed-flights-summary`,
  `/reporting/low-sales-alerts`) — the missing backend is only the four
  endpoints below.

### `backend/src/modules/reporting/` (additions)

| Method | Path                             | Roles                                                                 | Notes                                                                                                                                                                                                                                                                                                                              |
| ------ | -------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/reporting/recent-transactions` | FINANCE_MANAGER; EMPLOYEE with `fn_transactions`                     | Latest 20 `LedgerEntry` rows joined with party context (agency name via `agencyId`, passenger via `booking`) → `{ type, titleFa, party, occurredAt, signedAmountIrr }[]` + total count. Real rows only; delegated employee access is server-enforced. |
| GET    | `/reporting/revenue-mix`         | CEO, BOARD_CHAIR, SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER | «ترکیب درآمد» donut: per-channel SALE sums + pct over the same optional `granularity`/`periodKey` window as the KPIs.                                                                                                                                                                                                              |
| GET    | `/reporting/agency-settlements`  | FINANCE_MANAGER; EMPLOYEE with `fn_settlements`                      | «تسویه‌حساب آژانس‌های همکار»: per-agency rows derived from real invoices (`amount = SUM(invoices in period)`, `paidPct`, `due = earliest unpaid dueAt`, status تسویه شد/در انتظار/معوق + overdue days) + total outstanding. Delegated access is read-only and server-enforced. |

### `backend/src/modules/passenger-reports/` (new)

| Method | Path                        | Roles                                               | Notes                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/passenger-reports/search` | SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER | `q` (passenger full-name substring, or exact national ID via hash — reusing Phase 9's `Passenger.nationalIdHash`) → matching tickets `{ fullName, maskedNationalId, pnr, flightNo, route, departureAt, seatCode, cabin (derived from AircraftSeatMap row bands), priceIrr, status }[]`. PII rule: national ID always masked (`123******7` style) — this surface never decrypts. |

### `backend/src/modules/staff-reports/` (new)

| Method | Path                  | Roles                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/staff-reports/mine` | EMPLOYEE                            | «گزارش‌های من» — فید فعالیت خود کارمند از `AuditLog` (`{ items: [{ id, title, detail, category, at }] }`).                                                                                                                                                                                                                                                                                                                                  |
| GET    | `/staff-reports`      | FINANCE_MANAGER, COMMERCIAL_MANAGER | «گزارش عملکرد کارمندان»: EMPLOYEE-role users whose `dept` maps to the caller (finance→FINANCE_MANAGER, sales/commercial→COMMERCIAL_MANAGER) + their `AuditLog` action feed (action, category, detail, at), `staffId?` filter for the per-employee tabs. Also returns the «کارمند جدید توسط مدیر IT اضافه شد» banner rows — real `AuditLog(category=ACCOUNT)` employee-creation events for the caller's dept, not a fabricated notification. |

The earlier Excel-export deferral is superseded by the finance-manager
completion section below. CSV, native Excel and PDF exports are operational
server-side exports; they are generated only from the filtered database
result. The finance mock's orphaned income/expense chart and notification
"mark as read" persistence remain out of scope.

### Finance-manager completion (2026-08-13) — reports, exports, and accounting connectors

All routes in this section are `FINANCE_MANAGER` only and remain protected by
`JwtAuthGuard`, `RolesGuard`, and `PanelAccessGuard`.

| Method | Path                                                 | Request                                                                                                                  | Response / behavior                                                                                                                                                                                                                              |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/reporting/finance-reports`                         | `scope=AGENCIES\|CHARTERS\|CUSTOMERS`, `period=flight\|day\|month\|q3\|q6\|year`, `date?`, `month?`, `flightInstanceId?` | Real booking/ledger aggregates for the approved «گزارشات و خروجی» tabs. Agency scope is based on non-null booking ownership (`agencyId`) so an agency purchase from public inventory is not omitted. Returns `{ rows, summary, selectedPeriod }`; empty datasets return empty rows and zero totals. |
| GET    | `/reporting/finance-reports/export`                  | Same filters plus `format=csv\|excel\|pdf`                                                                                | Downloads UTF-8 CSV, native multi-sheet `.xlsx` finance pack or the A4 RTRD PDF generated from every matching server-side booking (export path does not apply the UI pagination limit). No client-side sample rows are introduced.                                                                                                    |

### Finance sales report engine v2

- `GET /reporting/finance-sales` — server-side detailed sales report. Optional
  filters: `bookedFrom`, `bookedTo`, `flightFrom`, `flightTo`, `bookingStatus`,
  `paymentStatus`, `originCode`, `destCode`, `cabin`, `channel`, `agencyId`,
  `flightInstanceId`.
  Returns `{ rows, summary }`; `rows` use immutable booking and
  payment snapshots and `summary` contains order/passenger counts, gross/net
  IRR and average-order IRR.
- `GET /reporting/finance-sales/export` — the same filters plus
  `format=csv|excel|pdf`. CSV and Excel contain detailed rows; Excel is a
  native multi-sheet `.xlsx` workbook with summary, detail, agency, refund,
  tax, flight, reconciliation and data-dictionary tabs; PDF is the
  finance summary. All aggregation stays on the server and requires
  `rp_exports` (preview requires `rp_finance`).
- Booking detail responses now include nullable `fareClassCode`; invoice,
  ticket and manage-booking clients must render it beside the purchased
  `cabin` when present.
- `GET /cartable` accepts optional `status=OPEN|APPROVED|REJECTED|TRANSFERRED`
  and returns both open category counts and all-status counts for the active
  assignee. This powers the selectable cartable status strip.
| GET    | `/reporting/finance-flight-search`                   | `q?`, `date?`, `month?`                                                                                                  | Completed/departed flights matching flight number or route, with real capacity, sold-seat and sales totals.                                                                                                                                      |
| GET    | `/reporting/finance-flight-search/:flightInstanceId` | —                                                                                                                        | Selected flight summary plus `bookings[]` (PNR, cabin/fare class, channel, status, passenger count and immutable amounts) and per-agency sold seats, paid amount, and outstanding amount. The customer-sales «جزئیات» dialog consumes this payload directly. |
| GET    | `/financial-integrations`                            | —                                                                                                                        | Five supported providers (`HOLO`, `SEPIDAR`, `HESABFA`, `RAHKARAN`, `PARMIS`) with connection status, masked key suffix, last real sync timestamp/status, and connected count. Secrets are never returned.                                       |
| POST   | `/financial-integrations/:provider/connect`          | `{ apiKey }`                                                                                                             | Encrypts the key at rest and performs a real provider health/auth request against the configured endpoint. Persists connected state only after success; audited. Returns 422 when the provider endpoint is not configured or verification fails. |
| POST   | `/financial-integrations/:provider/sync`             | —                                                                                                                        | Sends a real finance snapshot to the provider adapter, stores the real result/time, and audits it. Returns 409 if disconnected and 502 for upstream failure.                                                                                     |
| DELETE | `/financial-integrations/:provider`                  | —                                                                                                                        | Clears the encrypted credential and connected state; audited.                                                                                                                                                                                    |

Accounting provider base URLs are supplied through deployment configuration,
not the browser. Vendor adapters fail closed when their endpoint is absent;
the UI therefore never reports a fabricated connection or successful sync.

---

## Phase 12 — مدیران و ادمین‌ها, امنیت و رمز عبور, تنظیمات سامانه, CEO logs, IT panels view

Grounded in the ADMINS LIST / ADMIN PERMISSIONS / SECURITY-PASSWORD / LOGS /
SETTINGS / PANELS ACCESS markup of the CEO, Board Chair, Senior and IT
panels. Key ⚑ decisions:

- **Per-admin permission toggles are NOT built** (the design's 10-key
  toggle matrix on the admin detail screen). Authorization in this system
  is enum-role-based and enforced server-side (`RolesGuard`); shipping a
  stored-but-unenforced toggle matrix would violate CLAUDE.md's «never by
  hiding UI alone» rule, and enforcing it means a full dynamic-authorization
  redesign. Open item, documented — the admin detail keeps the real
  actions: block/unblock login and password reset.
- **«نقش سفارشی…» in add-admin is NOT supported** — roles are a seeded
  enum; a free-text role would have no real authorization backing.
- **Management hierarchy (server-enforced):** CEO and BOARD_CHAIR manage
  {SENIOR_MANAGER, FINANCE_MANAGER, COMMERCIAL_MANAGER, IT_MANAGER,
  SITE_ADMIN}; SENIOR_MANAGER manages the same set minus SENIOR_MANAGER.
  Nobody can block/reset CEO/BOARD_CHAIR accounts or block themselves.
- **«آنلاین» state is real** — derived from unexpired, unrevoked
  `RefreshToken` rows, not a fabricated presence flag.
- The chair settings' «قوانین استرداد» inputs write the REAL Phase 7
  `RefundPenaltyRule` brackets. The mock shows 2 inputs; the real engine
  has 4 brackets — all 4 are shown (⚑ documented deviation: editing only
  half the real engine would be misleading).
- CEO «لاگ و رویدادها» level chips are a presentational mapping over real
  `AuditLog` rows: SECURITY→هشدار, financial categories→موفق, else info.

### `backend/src/modules/admins/` (new) — CEO, BOARD_CHAIR, SENIOR_MANAGER

| Method | Path                             | Notes                                                                                                                                                                                                                                                                                               |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admins`                        | Manager/admin accounts in the caller's managed set (+ hierarchy above): fullName, username, email, roleLabelFa, lastLoginAt, isActive, online (real session derivation), managedByCaller flag.                                                                                                      |
| POST   | `/admins`                        | «افزودن مدیر / ادمین» `{ fullName, email, username, role (managed-set enum only), password (min 6), delivery: sms\|email }` — creates the staff `User` (argon2, `mustChangePassword`), audited; credentials delivery goes through the mocked provider path in dev. 409 on duplicate username/email. |
| PATCH  | `/admins/:id/block` / `/unblock` | Toggles `User.isActive` — really enforced (staff login already rejects inactive accounts). Only within the caller's managed set; never self, never CEO/BOARD_CHAIR. Audited.                                                                                                                        |
| POST   | `/admins/:id/reset-password`     | `{ password?, delivery? }` — explicit password (min 6) or a generated temp password (returned exactly once); sets `mustChangePassword`; audited; managed-set only.                                                                                                                                  |

The `BOARD_CHAIR` navigation exposes both `admins` and `security`: the former
uses the server-enforced hierarchy above for manager creation/reset, while the
latter changes the chair's own password through `POST /auth/change-password`.

### `backend/src/modules/auth/` (addition)

| Method | Path                                       | Roles                             | Notes                                                                                                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/change-password`                    | any authenticated staff or agency | «تغییر رمز عبور من» `{ currentPassword, newPassword (min 6) }` — verifies the current password (argon2) before updating; 401 on mismatch; sets `mustChangePassword=false` on success; audited (SECURITY, no password material logged). **Always allowed** even when `mustChangePassword=true` (the forced-change gate). |
| GET    | `/auth/me`                                 | any authenticated                 | Returns `{ id, fullName, role, preferredLocale, mustChangePassword }`.                                                                                                                                                                                                                                                  |
| *      | any other JWT-protected staff/agency route | staff + agency                    | When `mustChangePassword=true`, returns `403` with code `PASSWORD_CHANGE_REQUIRED` and message «قبل از ادامه باید رمز عبور خود را تغییر دهید.» — enforced in `JwtAuthGuard` after token validation. Skipped on `/auth/me`, `/auth/change-password`, `/auth/logout`.                                                     |

**Forced password change (Phase staff-auth):** IT/admin/agency-approval flows that issue a temporary password set `mustChangePassword=true`. After 2FA (staff) or direct login (agency), the frontend redirects to `/required-password-change` until `POST /auth/change-password` succeeds. This closes the gap where temp passwords could be used indefinitely.

### `backend/src/modules/audit/` (addition)

| Method | Path                   | Roles | Notes                                                                                                                                                                     |
| ------ | ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/audit/system-events` | CEO   | «لاگ‌ها و رویدادهای سامانه» — latest 100 real `AuditLog` rows (all actors incl. CEO itself, unlike `/audit/manager-reports`) with the presentational level mapping above. |

### `backend/src/modules/settings/` — IT_MANAGER, SITE_ADMIN

(BOARD_CHAIR no longer has the تنظیمات سامانه tab or settings API access.)

| Method | Path                     | Notes                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/settings`              | All `SystemSetting` key-values with server defaults (companyName, supportEmail, supportPhone, gateway toggles mellat/saman/zarin, global toggles maintenance/registration/charterSale/apiPublic/sandbox, brandColor, **socialLinks** — five fixed networks: instagram/telegram/whatsapp/linkedin/x, each `{ id, name, url, enabled }`) + the real `RefundPenaltyRule` brackets. |
| PATCH  | `/settings`              | Partial key-value update; validated per key; audited (SYSTEM). `socialLinks` patch: array of partial entries; enabled links require non-empty URL (max 500 chars); unknown network ids rejected.                                                                                                                                                                                |
| PATCH  | `/settings/refund-rules` | IT_MANAGER only — updates the REAL Phase 7 `RefundPenaltyRule.penaltyPct` per bracket (0–100 validated); audited. The refund engine keeps reading these same rows.                                                                                                                                                                                                              |
| GET    | `/settings/social-links` | **Public** (no auth) — returns `{ links: [{ id, name, url }] }` for enabled networks with non-empty URLs; bare hostnames normalized to `https://`. Rate-limited.                                                                                                                                                                                                                |

### `backend/src/modules/panels/` (change)

`GET /panels/access` gains IT_MANAGER as a READ-ONLY role (its دسترسی به
پنل‌ها tab is informational per the design: «تعیین سطح دسترسی ورود در
اختیار مدیر عامل است»); `PATCH` stays CEO/SENIOR_MANAGER only.

Deferred (documented, not dropped): per-admin permission matrix (see ⚑
above); site-logo upload in IT settings (the logo is a public-site asset —
no public site exists in this track to render it); the chair panel's
orphaned PROFILE & SECURITY section (no nav entry reaches it — confirmed
orphan like prior phases' dead blocks).

---

## Later phases (endpoints TBD — documented here before each phase's code is written)

- **Phase 2** — none directly (reporting reads Phase-2 tables; no new endpoints of its own beyond what's above).
- **Phase 5 — VIP club** (`backend/src/modules/club/`; roles below are the 3 panels with the tab — CEO, BOARD_CHAIR, SENIOR_MANAGER):
  - GET `/club/members` — `level?`, `q?` (name/email/cardNo, plus exact nationalId via hash); returns members + the KPI counts (کل اعضا، کارت‌های صادرشده، درخواست در انتظار، توزیع سطوح). All 3 roles.
  - POST `/club/members` — «تعریف مشتری VIP جدید» — CEO+BOARD_CHAIR+SENIOR_MANAGER; national-ID checksum validated, PII encrypted. Re-adding a deactivated national ID reactivates the preserved membership.
  - PATCH `/club/members/:id/deactivate` — all 3 executive roles; returns `{ id, isActive:false, deactivatedAt }`, suspends club benefits and hides the member from active lists without deleting account, points, booking, wallet, card-request or audit history. The former DELETE route is intentionally unavailable.
  - PATCH `/club/members/:id/level` — tier segmented control — SENIOR_MANAGER only, audited.
  - POST `/club/members/:id/issue-card` — «صدور کارت» direct issuance — all 3 roles; 409 if already issued; audited (⚑).
  - GET `/club/card-requests` — the panels' queue (server filters to REFERRED/APPROVED/REJECTED — SUBMITTED lives in the site-admin track); includes history timeline. All 3 roles.
  - PATCH `/club/card-requests/:id/approve` | `/reject` — «تأیید و صدور کارت» / «انصراف» — CEO/BOARD_CHAIR: any REFERRED; SENIOR_MANAGER: only `assignedTo=SENIOR` (⚑); transactional + audited; 409 on non-REFERRED.
- **Phase 6 — Ticket pricing** (`backend/src/modules/pricing/` + `backend/src/modules/ai/` + `ml-service/`):
  - GET `/pricing/proposals` — CEO: pending + registered (+ rejected) lists and `pendingApprovalsCount`; COMMERCIAL_MANAGER: upcoming SCHEDULED instances joined with their proposal.
  - GET `/pricing/proposals/pending-count` — CEO only → `{ pendingApprovalsCount }` (empty DB → 0).
  - PUT `/pricing/flights/:flightInstanceId/proposal` — COMMERCIAL_MANAGER / EMPLOYEE+`pr_propose` — `{ proposedPriceIrr, legalRateIrr?, note? }` (IRR decimal strings). Atomic with `definitionStatus→PENDING_CEO`. `competitorPriceIrr` is taken from the flight definition when set; **never** fabricated (+3% removed). Nullable competitor → UI «—». 409 once REGISTERED.
  - PATCH `/pricing/proposals/:id/legal-rate` — CEO — «ثبت نرخ قانونی»; audited.
  - PATCH `/pricing/proposals/:id/register` — CEO + step-up; atomic with definition promote; idempotent if already REGISTERED.
  - PATCH `/pricing/proposals/:id/reject` — CEO + step-up + rejectionReason; atomic; live APPROVED inventory kept under PENDING_REVISION.
  - Sellability: search/seat-map/booking/price-lock only APPROVED|PENDING_REVISION (not DRAFT/PENDING_CEO/REJECTED).
  - POST `/pricing/proposals/ai-analysis` — CEO — «تحلیل و پیشنهاد قیمت هوش مصنوعی» for all PENDING proposals via the NestJS→ml-service client (2s timeout, graceful fallback, usage logged); persists suggestions with modelVersion. Advisory only.
  - ml-service: `POST /internal/v1/price-suggestion` (internal token; pydantic; versioned heuristic model; pytest) + `GET /health`.
- **Phase 7 — Refunds** (`backend/src/modules/refunds/`; FINANCE_MANAGER only — the executives' panels have no live refund surface, confirmed):
  - GET `/refunds` — request cards + the 3 KPI counts (در صف پرداخت / پرداخت‌شده / در انتظار بررسی ادمین).
  - GET `/refunds/:id` — detail for the modal: passenger/account panel (شبا decrypted for this surface only), flight panel, amounts panel with the penalty breakdown (درصد جریمهٔ کنسلی → مبلغ نهایی قابل پرداخت).
  - PATCH `/refunds/:id/refer` — `{ assigneeId }` (finance staff via /staff-directory) — sets assignee + history, status unchanged (per design), audited.
  - PATCH `/refunds/:id/pay` — «تأیید، واریز به شبا و بستن پرونده» — only from FINANCE (else 409); transactional ledger reversal + booking REFUNDED + audit (see DB_SCHEMA ⚑).
  - POST `/refunds/_test/request` — non-production E2E seed hook (creates a booking + FINANCE-status request), 404 in production.

## Phase 15 — step-up verification for high-risk operations

See DB_SCHEMA.md's Phase 15 for full reasoning. One new shared endpoint,
then five existing endpoints gain two required body fields.

- `POST /auth/step-up/request` (new, any authenticated staff/agency
  actor, `@Throttle` 5/min like OTP) — `{ scope }` where scope is one of
  `ADMIN_ROLE_CHANGE | API_KEY_ROTATE | REFUND_PAYOUT |
PRICE_CAPACITY_CHANGE | SESSION_REVOKE`. Returns `{ challengeId }`; the
  code is delivered through the actor's existing 2FA channel.
- `POST /admins` (existing) — body gains `stepUpChallengeId`,
  `stepUpCode`; scope `ADMIN_ROLE_CHANGE`. 401 `TWO_FACTOR_INVALID`/
  `TWO_FACTOR_EXPIRED` if the challenge doesn't check out — same codes
  the login 2FA flow already uses.
- `POST /agencies/:id/api-key` (existing) — same two fields required;
  scope `API_KEY_ROTATE`.
- `PATCH /agencies/:id/api-key/:keyId` (existing) — same two fields
  required **only when `regenerate: true`**; a plain `status` toggle
  (suspend/activate an existing key) does not need step-up.
- `PATCH /refunds/:id/pay` (existing) — same two fields required; scope
  `REFUND_PAYOUT`.
- `PATCH /pricing/proposals/:id/register` (existing) — same two fields
  required; scope `PRICE_CAPACITY_CHANGE`.
- `PATCH /flights/:instanceId/aircraft` (existing, capacity-affecting)
  — same two fields required; scope `PRICE_CAPACITY_CHANGE` (shared with
  price registration — both are the "price/capacity change" item in the
  spec's §5.1, not two separate scopes).
- `POST /security/sessions/logout-all` (existing) — same two fields
  required; scope `SESSION_REVOKE`.

## Phase 16 — agency self-registration + real seat allotments

See DB_SCHEMA.md's Phase 16 for full reasoning (design source, why a new
phone-keyed OTP table instead of reusing `TwoFactorChallenge`, and what's
explicitly out of scope).

- `POST /agencies/requests/otp` (new, public, `@Throttle` 5/min per-IP +
  per-phone) — `{ phone }`. Upserts nothing; creates an `AgencyRequestOtp`
  row and sends the code via the existing `TwoFactorProvider`. Returns
  `{ challengeId }`.
- `POST /agencies/requests` (new, public, `@Throttle` 5/min) — `{
applicantName, managerName, licenseNo, phone, challengeId, code }`.
  Verifies the OTP (same 401 `TWO_FACTOR_INVALID`/`TWO_FACTOR_EXPIRED`
  codes as every other OTP check in this codebase), then creates an
  `AgencyMembershipRequest(status: PENDING, email: null, city: null,
documents: null)`.
- `GET /agencies/requests`, `GET /agencies/requests/:id` (existing) — role
  gate widened to also allow `SITE_ADMIN` (method-level override; every
  other `/agencies/*` route keeps the original `AGENCY_TAB_ROLES` gate).
- `PATCH /agencies/requests/:id/refer` (existing) — role gate widened to
  `SITE_ADMIN | SENIOR_MANAGER | COMMERCIAL_MANAGER`.
- `PATCH /agencies/requests/:id/approve` (existing) — role gate
  **narrowed** to `COMMERCIAL_MANAGER` only (was
  `SENIOR_MANAGER | FINANCE_MANAGER | COMMERCIAL_MANAGER`). On success now
  also sends a real SMS with the temp password (Phase 14's `SmsProvider`/
  `SmsLog`), matching `POST /admins`'s existing delivery pattern, instead
  of only returning it in the response body.
- `PATCH /agencies/requests/:id/reject` (existing) — role gate widened to
  add `SITE_ADMIN` alongside the existing gate.
- `GET /flights/:instanceId/allotments`, `POST
/flights/:instanceId/allotments`, `DELETE
/flights/:instanceId/allotments/:allotmentId` — **no change**; these
  already exist (Phase C) and are only gaining a frontend caller this
  phase (a new section in the existing flights panel, same
  `SENIOR_MANAGER`/`COMMERCIAL_MANAGER` gate — no new endpoint).
- `GET /agency-portal/allotments` (new, `AGENCY` role, tenant-scoped to
  `actor.agencyId` server-side) — replaces `AgencySeatsPage.tsx`'s
  hardcoded sample data with each allotment's flight info,
  `seatsAllocated`, and seats consumed so far (derived via `COUNT` over
  real bookings, never a stored counter).

## Phase 17 — customer profile fields + completeness notification

See DB_SCHEMA.md's Phase 17 for full reasoning and explicit scope cuts
(no KYC/selfie, bank cards, sessions, invite-friends, saved passengers).

- `GET /my/profile` (new, `USER` role — matches the existing `/my/wallet`,
  `/my/refunds`, `/my/club-points` customer self-service convention) —
  current values of `fullName`, `nationalId` (decrypted for the owner
  only), `birthDate`, `passportNo` (decrypted), `address` (decrypted for the
  owner only), `emailVerifiedAt`, plus a
  server-computed `completionPct`.
- `PATCH /my/profile` (new, `USER` role) — partial update of the same
  fields, including the account `email`; national ID validated with the
  official checksum server-side (CLAUDE.md security rule). National ID,
  passport and address are encrypted at rest immediately. Email is normalized
  to lowercase, must remain unique, and changing it clears `emailVerifiedAt`
  until the new address completes the existing verification flow.
- `POST /my/profile/email/verify-request` (new, `USER` role, `@Throttle`
  5/min) — sends a short-lived code to the account's current `email` via
  the existing `TwoFactorProvider`. 400 if no email is set yet.
- `POST /my/profile/email/verify` (new, `USER` role) — `{ challengeId,
code }`; on success stamps `emailVerifiedAt`.
- No change to any booking/checkout endpoint's validation — national ID
  stays optional there, exactly as today; the checkout banner is a
  frontend-only read of `GET /users/me/profile`'s `completionPct`.

### UAT correction (2026-08-24)

- `completionPct` is returned as a rounded integer from 0 through 100; clients
  must not expose repeating decimal percentages.
- `POST /agency-portal/seat-requests/inquiry` is unchanged. The agency client
  now calls it automatically after a short debounce whenever a valid requested
  seat count changes, and ignores stale responses.
- `GET /search/advisory` is unchanged. Non-Persian clients localize the
  advisory reason and ISO cheapest-day value at render time, including a safe
  localized fallback for previously unseen Persian ML reasons.

## Phase 18 — SITE_ADMIN + EMPLOYEE panel access

See DB_SCHEMA.md's Phase 18 for full reasoning (which design-listed
SITE_ADMIN tabs stay deferred, why EMPLOYEE's nav is computed per-user
instead of a static `PANEL_NAV` row, and the exact catalog keys wired vs
deferred). No schema change — reuses the existing `EmployeePermission`/
`Permission` tables from Phase 8.

- `GET /panels/nav` — now `async`; for `role === 'EMPLOYEE'` the response
  is computed per-user from that employee's real `EmployeePermission`
  grants (`["dashboard", ...granted sections]`, matching پنل کارمند.dc.html's
  `navKeys` formula) instead of a static table row. Every other role is
  unchanged.
- New `@RequiresPermission(...keys)` decorator +
  `EmployeePermissionGuard` (`src/common/guards/employee-permission.guard.ts`)
  — passes straight through for any non-EMPLOYEE actor; for EMPLOYEE it
  403s unless the actor holds at least one of the decorated keys via
  `EmployeePermission`. Added to `@UseGuards(...)` alongside the existing
  `RolesGuard`/`PanelAccessGuard` on every controller touched below.
- `GET /agencies`, `GET /agencies/:id` — role gate widened to add
  `SITE_ADMIN` and `EMPLOYEE` (method-level, was previously class-default
  `AGENCY_TAB_ROLES` only for these two). EMPLOYEE additionally requires
  `ag_list` (list) / `ag_info` (detail).
- `GET /agencies/requests`, `GET /agencies/requests/:id` — also widened to
  `EMPLOYEE` + `RequiresPermission('ag_requests')` (SITE_ADMIN was already
  granted in Phase 16).
- `GET /passenger-reports/search` — role gate widened to add `SITE_ADMIN`
  and `EMPLOYEE` (+ `RequiresPermission('rp_sales', 'rp_finance')` — same
  "reports" tab for either catalog dept's report permission).
- `GET /club/members`, `POST /club/members/:id/issue-card` — role gate
  widened to add `SITE_ADMIN` only (method-level). `createMember`
  (CEO/BOARD_CHAIR), `updateLevel` (SENIOR_MANAGER), and the
  `card-requests` approve/reject flow stay untouched — SITE_ADMIN never
  gets member creation, tier changes, or the referred-card decision.
- Cartable (`GET/PATCH /cartable/*`) — `SITE_ADMIN` added directly to
  `CartableController`'s class-level `@Roles(...)` (not to the shared
  `EXEC_ROLES` constant). `manager-messages` independently includes
  `SITE_ADMIN` because its compose action is exposed in the site-admin
  cartable; `staff-directory` stays unchanged. Every cartable endpoint is self-scoped to the
  actor, so this is a safe "act on my own items" grant.
- `GET /refunds`, `GET /refunds/:id`, `PATCH /refunds/:id/refer` — role
  gate widened to add `SITE_ADMIN` and `EMPLOYEE` (+
  `RequiresPermission('rf_list' | 'rf_details' | 'rf_process')`
  respectively). `PATCH /refunds/:id/pay` is **never** widened — stays
  `FINANCE_MANAGER`-only, matching the same "site admin/employee review +
  refer, one specialist role executes" pattern used for agency requests
  in Phase 16.
- `GET /pricing/proposals`, `PUT /pricing/flights/:flightInstanceId/proposal`
  — role gate widened to add `EMPLOYEE` (+ `RequiresPermission('pr_propose')`).
  No SITE_ADMIN grant — pricing isn't in its design access list.
  `legal-rate`/`register`/`ai-analysis` stay `CEO`-only.
- `GET /flights/overview`, `GET /flights/airports`, `GET /flights/schedules`,
  `GET /flights/:instanceId`, `GET /flights/:instanceId/fare-rules`,
  `GET /flights/:instanceId/allotments` — role gate widened to add
  `EMPLOYEE` (+ `RequiresPermission('fl_view')`). Every write endpoint on
  this controller (create/schedule/plan/aircraft/fare-rule/allotment
  mutations — the catalog's `fl_manage`) is **deliberately deferred**;
  granting broad flight-write access needs individual per-endpoint review
  this phase didn't have time for.

### Explicit deferrals (flagged, not oversights)

- `flightops`, `tickets`, `blog`, `media` — present in
  پنل ادمین سایت.dc.html's `roleDefs.siteAdmin.access` but have **no**
  backend anywhere in the codebase for any role; excluded from
  `PANEL_NAV.SITE_ADMIN` rather than shipped as dead tabs.
- EMPLOYEE's `referrals` tab — پنل کارمند.dc.html's `navKeys` formula
  always appends it, but `GET /referrals` (the only listing endpoint) is
  sender-scoped (`SENIOR_MANAGER`'s own referrals); there's no
  recipient-side "referrals assigned to me" listing yet, only per-item
  detail/report access. Left out of the computed nav until that listing
  exists.
- Catalog keys `fl_manage`, `ag_settle`, `fn_invoices`, and the entire IT
  dept (`us_manage`, `sv_control`, `sc_manage`, `lg_view`) are **not**
  wired to any controller this phase — an employee granted only these
  gets no matching nav tab (no dead tabs), even though the permission row
  itself exists and can be granted by IT_MANAGER today.
- SITE_ADMIN's dashboard is a new, narrower `SiteAdminDashboardPage` (pending
  agency requests + refunds awaiting review) rather than
  پنل ادمین سایت.dc.html's fuller multi-widget combined feed — both source
  lists are real (no mock data), just a simpler composition.

## Phase 19 — مدیریت رزرو (anonymous PNR self-service)

`ManageBookingPage.tsx` was entirely mock (PLAN.md's earlier note: "any PNR

- last name resolves to a hardcoded sample booking... zero calls to the
  real `/my/refunds` endpoint"). Per user decision, the anonymous PNR+last-
  name lookup model wins over requiring login (matches
  مدیریت رزرو.dc.html and standard airline "manage my booking" UX) — the
  existing authenticated `GET /bookings/pnr/:pnr` stays as-is for logged-in
  customers (`AccountPage`/`TicketPage`); this phase adds a **separate,
  public, anonymous** surface reusing the same underlying booking/refund
  logic. No schema change.

* `POST /manage-booking/lookup` (new, public, `@Throttle` 10/min per IP —
  matches `POST /bookings`'s existing rate) — `{ pnr, lastName }`. Finds
  the booking by PNR, matches `lastName` against the **last
  whitespace-separated token** of any passenger's `fullName` on that
  booking (case-sensitive-insensitive per Persian normalization already
  used elsewhere, trimmed). Same generic 404 `NOT_FOUND` ("رزرو یافت
  نشد") whether the PNR doesn't exist or the last name doesn't match —
  no oracle for PNR enumeration. Response is the same shape
  `BookingService.toDetail()` already returns for the authenticated
  endpoint (passengers exposed as `{ fullName, seatCode }` only — no PII
  decryption on this surface, same as today).
* `POST /manage-booking/refund` (new, public, `@Throttle` 10/min per IP)
  — `{ pnr, lastName, iban }`. Re-verifies the same PNR+lastName match,
  then runs the _exact_ penalty/eligibility logic `submitFromCustomer`
  already uses (TICKETED/PAID only, one request per booking, `RefundPenaltyRule`-driven
  penalty) — refactored into a shared private helper so the anonymous and
  authenticated paths can never compute the penalty differently. Response
  shape matches `/my/refunds`'s (`penaltyPct`, `penaltyAmountIrr`,
  `refundableIrr`, ...) — the frontend shows these REAL figures only
  after submission, mirroring `TicketPage.tsx`'s already-built
  authenticated refund flow (enter شبا → submit → see the real computed
  breakdown), not a pre-submission preview.
* No `AuditService.record` call on the anonymous path (its `actorId` is a
  required real `User.id`, which an anonymous caller doesn't have) — same
  precedent as Phase 16's anonymous agency pre-registration.

### Explicit deferrals (flagged, not oversights)

- **تغییر صندلی (seat change)** and **دانلود بلیط (ticket download)** —
  the mock's buttons for both already had no `onClick` handler at all
  (pure decoration); left disabled with a "به‌زودی" hint this phase
  rather than built. Seat change on an already-TICKETED booking is a
  distinct feature (seat-availability check, no existing customer-facing
  endpoint) deserving its own scoped review; ticket download/PDF was
  already flagged deferred in PLAN.md's Phase 9 notes.
- **Per-passenger partial refund selection** — the mock's refund modal
  let the user check individual passengers to refund a subset of the
  fare. The real `RefundRequest` model (Phase 7) is 1:1 with `Booking`,
  not per-passenger, and every other refund surface in the app (customer
  `/my/refunds`, staff `RefundsController`) already refunds the whole
  booking as one unit. Matching that existing, already-tested model
  instead of inventing per-passenger refund support keeps this phase's
  scope real rather than adding a parallel, untested money-handling path;
  the rebuilt page drops the per-passenger checkboxes accordingly.

## Phase 20 — تماس با ما + پشتیبانی (contact + support tickets)

Second item from the post-Phase-18 "dead forms" punch list.
`ContactPage.tsx` and `SupportPage.tsx`'s ticket form were both pure
client-side mocks (`setSent(true)`, a hardcoded `TK-8842` tracking code,
zero backend calls). Built as **two separate models** — a plain inbox
(`ContactMessage`) and a tracked workflow (`SupportTicket`) — rather than
one unified table, since they are conceptually different (pre-sale
inquiry vs. an active support issue needing dept/priority/status/forward)
and the design's own ticket dept field (`tkDepts = ["سایت","آژانس‌ها"]`,
confirmed from `پنل ادمین سایت.dc.html`) has no equivalent on the contact
side anyway.

### تماس با ما — `ContactMessage`

- `POST /contact` (new, public, `@Throttle` 10/min per IP) —
  `{ name, phone, subject, body }`. The design's own form
  (`design-reference/تماس با ما.dc.html`) requires all four fields
  (`onSend` validates `name`/`phone`/`subject`/`msg` all non-empty) — the
  earlier build of `ContactPage.tsx` was missing the `subject` input
  entirely; this phase adds it back as part of making the form real.
- `GET /contact` (new, `SITE_ADMIN` only) — the 20 most recent messages.
  No dedicated review/reply UI this phase (no design admin tab exists
  specifically for "تماس با ما" — `پنل ادمین سایت.dc.html`'s own access
  list has no such key); this endpoint's only consumer is a new third
  section on `SiteAdminDashboardPage.tsx` ("آخرین پیام‌های تماس با ما").
  A full inbox/reply workflow stays a deferred polish item, same category
  as Phase 18/19's other explicitly-flagged deferrals.

### پشتیبانی — `SupportTicket`

- `POST /support-tickets` (new, public, `@Throttle` 10/min per IP) —
  `{ requesterName, requesterPhone, subject, body }`. The design's ticket
  form (`design-reference/پشتیبانی.dc.html`) has **no** name/phone input
  at all — but a real ticket system needs a way to contact the submitter
  back, so both fields were added to the rebuilt form (a deliberate,
  bounded scope decision made after the user declined further clarifying
  questions on this feature and said to continue using judgment). Returns
  `{ id, trackingCode }`; the frontend replaces the old fake `TK-8842`
  constant with this real code. `dept` always defaults to `SITE` at
  submission — there is no "which department" picker on the public form,
  matching the design (which also has no such picker on its ticket form).
- `GET /support-tickets` (new, `SITE_ADMIN` only, optional
  `?status=`/`?dept=` filters) — list.
- `GET /support-tickets/:id` (new, `SITE_ADMIN` only) — detail.
- `GET /support-tickets/forward-targets` (new, `SITE_ADMIN` only) — the
  active-staff picker for the forward action. Reuses
  `StaffDirectoryService.list()` (Phase 4) **via dependency injection**
  rather than widening `StaffDirectoryController`'s own endpoint, which is
  gated to `EXEC_ROLES` (CEO/BOARD_CHAIR/SENIOR_MANAGER/FINANCE_MANAGER/
  COMMERCIAL_MANAGER — notably not `SITE_ADMIN`). Exposing a
  ticket-scoped endpoint instead of widening that shared role gate follows
  the same conservative-widening principle established in Phase 18.
- `PATCH /support-tickets/:id/forward` (new, `SITE_ADMIN` only) —
  `{ targetUserId }`. Validates the target against the same staff list,
  advances `OPEN` → `IN_PROGRESS` (leaves any other status as-is), and
  appends a `history` entry — same `history: Json` append pattern already
  used by `RefundRequest`/`AgencyMembershipRequest`, not a separate
  message-thread table.
- `PATCH /support-tickets/:id/status` (new, `SITE_ADMIN` only) —
  `{ status }` ∈ `OPEN | IN_PROGRESS | ANSWERED | CLOSED`. Appends a
  `history` entry.
- `POST /support-tickets/admin` (`SITE_ADMIN` only) — create from the
  panel «ایجاد تیکت» modal: `{ subject, requesterName, requesterPhone?,
dept: SITE|AGENCY, priority: HIGH|MEDIUM|LOW, body }`. Phone optional
  (sentinel stored when omitted). Audited.
- Both forward and status-change actions are audit-logged
  (`category: 'SYSTEM'` — no new `AuditCategory` enum value was added for
  a scoped-down v1 feature). No audit row on the anonymous submission
  path, same precedent as Phase 16/19's anonymous flows.
- New `PANEL_NAV.SITE_ADMIN` tab: `tickets` (`تیکت‌های پشتیبانی`) — this
  closes the gap Phase 18 explicitly flagged: `پنل ادمین سایت.dc.html`'s
  `roleDefs.siteAdmin.access` list includes `"tickets"`, which Phase 18
  left out because no backend existed anywhere in the codebase yet.
  `flightops`/`blog`/`media` remain deferred (still no backend for any
  role).

### Historical deferrals superseded by the authenticated conversation follow-up

- File attachments and multi-message reply threads were deferred in the
  original phase, but are now implemented for authenticated customer and
  agency tickets and for the site-admin reply surface. The remaining public
  anonymous submission endpoint intentionally stays submission-only.
- **Public ticket status lookup ("track my ticket")** — the design has no
  such UI (only a post-submission tracking-code display); not built this
  phase.
- **A dedicated تماس با ما admin review/reply UI** — see above; the
  dashboard's new summary section is this phase's only admin surface for
  it.

### پنل کاربر — پیام به پشتیبانی (`/account` → تب `tickets`)

Closes the gap flagged in `design-reference-v2/پنل کاربر.dc.html`'s
`accountNav` (`tickets` / «پیام به پشتیبانی») — the public
`POST /support-tickets` flow existed from Phase 20 but logged-in customers
had no way to see their submissions inside `/account`.

- `GET /my/support-tickets` (`USER` or `AGENCY` role) — list the caller's own
  tickets: rows where `userId = caller.id`, **plus** any anonymous
  submissions whose `requesterPhone` exactly matches the caller's stored
  `User.phone` (covers tickets filed before login with the same number).
  Returns `{ id, trackingCode, subject, body, status, history, attachments,
  createdAt, updatedAt }` only — no admin-only fields (`dept`, `priority`,
  `forwardedTo`).
- `GET /my/support-tickets/:id` (`USER` or `AGENCY` role) — detail for one owned
  ticket; `404` if the row isn't linked to the caller by `userId` or
  phone match above.
- `POST /my/support-tickets` (`USER` or `AGENCY` role, `@Throttle` 10/min per
  account) — same body as the public submit DTO plus optional
  `attachmentIds` (maximum one owner-validated file); always sets `userId`
  to the caller. Returns `{ id, trackingCode }`.
- `POST /my/support-tickets/:id/replies` (`USER` or `AGENCY` role) — appends a
  reply to an owned, non-closed ticket. Body is `{ body, attachmentIds? }`;
  at most one owner-validated attachment is accepted. The ticket returns to
  `OPEN` so support can respond.
- `POST /support-tickets/:id/replies` (`SITE_ADMIN` only) — appends a staff
  reply, preserves the chronological message history, resolves an optional
  owner-validated attachment, and changes the ticket to `ANSWERED`. Closed
  tickets reject replies. The site-admin detail modal renders the full thread
  and inserts the returned reply immediately after a successful request.
- Authenticated agency submissions are routed to `dept=AGENCY`; customer
  submissions remain in `dept=SITE`. In the agency portal these endpoints
  power the existing «پیام‌ها» surface rather than a separate ticket menu.
- Frontend: customer and agency ticket surfaces use the same conversation
  center with status counters, independent rows, chronological requester/staff
  messages, timestamps, and downloadable attachments. New requests and replies
  accept one PDF/PNG/JPG up to 5 MB. Their local search filters only the
  already owner-scoped response by tracking code or subject. The site-admin
  table search is likewise wired to tracking code, subject, requester, and body.

### پنل کاربر — باشگاه مشتریان (`/account` → تب `club`)

Closes the gap flagged in `design-reference-v2/پنل کاربر.dc.html`'s
`accountNav` (`club` / «باشگاه مشتریان»): tier banner + progress bar,
membership-card issuance (request, tracker timeline, issued card display),
and tier-benefits grid. BluBank block deferred (no backing schema).

The later bank-loan adapter phase supersedes that display-only deferral. The
customer club surface may now link to the real `/me/loan-applications` workflow;
it must not simulate a bank-account connection or a loan decision in the UI.

### UAT staff-directory recipients (2026-08-25)

`GET /staff-directory` keeps temporary `uat.*` panel accounts hidden in normal
production operation. When `AUTH_SANDBOX_ENABLED=true`, active temporary UAT
staff accounts are included so CEO and board-chair cartable transfer pickers can
exercise the real routing workflow. The caller is still excluded and the
existing role/permission guards remain unchanged.

- `GET /my/club/membership` (new, `USER` role) — returns `{ isMember,
level, balance, cardStatus, cardNo, tierRules: { goldMinPoints,
platinumMinPoints, cardRequestMinPoints }, cardRequest: { id, status,
history, cardNo?, createdAt } | null, canRequestCard,
pointsNeededForCard }`. `balance` is the authoritative ledger sum
  (`ClubPointsEntry`), not the staff display cache. `cardRequest` is the
  latest non-REJECTED request (SUBMITTED/REFERRED/APPROVED).
- `POST /my/club/join` (`USER` role, `@Throttle` 5/min) — self-join as
  `SILVER` `ClubMember` linked via `userId`. Requires a valid national ID
  on the user profile (email or phone used for the member email field).
  Idempotent if already a member; links an existing NID row when orphaned.
- `POST /my/club/card-request` (new, `USER` role, `@Throttle` 5/min per
  account) — member-initiated card request: requires linked `ClubMember`,
  `balance >= cardRequestMinPoints`, `cardStatus === NONE`, and no pending
  SUBMITTED/REFERRED request. Creates a `ClubCardRequest(status=SUBMITTED)`
  with a one-step history timeline and sets `ClubMember.cardStatus=REVIEW`.
  `409` if already issued or a request is pending; `400` if below threshold.
- Frontend: `club` tab on `AccountPage.tsx` (replaces the old minimal
  `points` tab) wired to the endpoints above; keeps `GET /my/club-points`
  for the header chip / price-lock eligibility checks.
- Seed: links test USER `+989120000001` (نگار رضایی) to the seeded GOLD
  `ClubMember` row and backfills a ledger entry when missing so manual
  testing works immediately after `prisma db seed`.

### SITE_ADMIN — ارجاع درخواست‌های کارت SUBMITTED

Completes the member-initiated card-request flow started above: after a
USER submits via `POST /my/club/card-request`, the request sits in
`SUBMITTED` until SITE_ADMIN refers it from the پنل ادمین سایت `club` tab.

- `GET /club/submitted-card-requests` (`SITE_ADMIN` only) — list of **all**
  card-request statuses for the admin queue (SUBMITTED / REFERRED /
  APPROVED / REJECTED) with member detail (incl. decrypted national ID)
  - history timeline. Refer action still only succeeds on SUBMITTED.
    Exec panels' `GET /club/card-requests` still excludes SUBMITTED.
- `PATCH /club/card-requests/:id/refer` (`SITE_ADMIN` only) — body
  `{ assignedTo: 'SENIOR' | 'CHAIR' }`; `SUBMITTED → REFERRED`, appends a
  history step, audited. `409` if not SUBMITTED.
- `GET /club/members` KPI payload includes `submittedRequests` (SUBMITTED)
  alongside `pendingRequests` (REFERRED). For `SITE_ADMIN` only, each
  member row also includes decrypted `nationalId` (profiles + VIP Excel).
- Frontend: `SiteAdminClubPage` (via `ClubRouter`) — dark 3-KPI layout,
  card-request queue, member profiles, VIP-ready list + Excel download.

### پنل کاربر — نشان‌شده‌ها (`/account` → تب `saved`)

Closes the «نشان‌شده‌ها» tab in `design-reference-v2/پنل کاربر.dc.html`:
list saved flight+cabin bookmarks, book (navigate to checkout flow), remove.

- `GET /my/saved-flights` (new, `USER` role) — newest first; each row
  includes `{ id, flightInstanceId, cabin, flightNo, originCode, destCode,
originCityFa, destCityFa, departureAt, arrivalAt, priceIrr, bookable,
createdAt }`. `priceIrr` is recomputed live via `getCabinPrice`; departed
  or non-`SCHEDULED` instances return `bookable: false`.
- `POST /my/saved-flights` (new, `USER` role, `@Throttle` 30/min) — body
  `{ flightInstanceId, cabin }`; requires a future `SCHEDULED` instance with
  a bookable cabin price. Max 20 rows per user. `409` on duplicate.
- `DELETE /my/saved-flights/:id` (new, `USER` role) — owner-only; `404`
  otherwise.
- Frontend: new `saved` tab on `AccountPage.tsx` + bookmark control on
  `ResultsPage.tsx` cabin rows (login-gated, same pattern as price lock).

### پنل کاربر — مسافران ذخیره‌شده (`/account` → تب `passengers`)

Closes the «مسافران ذخیره‌شده» section in
`design-reference-v2/پنل کاربر.dc.html`: customer address-book CRUD for
checkout autofill (autofill wiring on `BookPage` deferred).

- `GET /my/saved-passengers` (new, `USER` role) — newest first; each row
  `{ id, fullName, latinName, gender, birthDate, nationalId, passportNo, mobile, isChild,
createdAt, updatedAt }`. PII decrypted for the owner only.
- `POST /my/saved-passengers` (new, `USER` role, `@Throttle` 30/min) — body
  `{ fullName, latinName, gender, birthDate, nationalId?, passportNo?, mobile?, isChild? }`;
  `gender` is `male`|`female`; `birthDate` is Gregorian `YYYY-MM-DD`. At least one of
  `nationalId` or `passportNo` required; national ID checksum validated when present.
  Max 20 rows per user. `409` when the same national ID is already saved for this user.
- `PATCH /my/saved-passengers/:id` (new, `USER` role) — same field shape as
  POST (all optional except at least one id doc must remain); owner-only;
  `404` otherwise.
- `DELETE /my/saved-passengers/:id` (new, `USER` role) — owner-only; `404`
  otherwise.
- Frontend: `AccountPassengersTab` on `AccountPage` (list + add/edit modal with
  gender + DOB + remove). Profile preview + «+ افزودن مسافر» still open the modal.
- Frontend checkout: selecting a saved passenger fills Latin names, gender, DOB,
  and identity document fields on the passenger form.

### پنل کاربر — نشست‌های فعال (`/account` → تب `security`)

Closes the «نشست‌های فعال / دستگاه‌های متصل» block in
`design-reference-v2/پنل کاربر.dc.html`. Reuses existing `RefreshToken`
rows — no schema change.

- `GET /my/sessions` (new, `USER` role) — non-revoked, non-expired refresh
  tokens for the caller only; each row `{ id, deviceLabel, ip, userAgent,
createdAt, expiresAt, isCurrent }`. `isCurrent` is true when the
  request's `blujet_refresh` cookie matches that row's hash.
- `DELETE /my/sessions/:id` (new, `USER` role) — revokes one other-device
  session; `403` if targeting the current cookie's session (use logout
  instead); owner-only `404`.
- Frontend: `AccountSecuritySessions` on `AccountPage.tsx` `security` tab
  (device list, «دستگاه فعلی» badge, «پایان نشست» for others).

### پنل کاربر — حساب‌های بانکی (`/account` → تب `banks`)

Closes the «حساب‌های بانکی» section in
`design-reference-v2/پنل کاربر.dc.html`: saved card + sheba for refund
payouts.

- `GET /my/bank-accounts` (new, `USER` role) — default first, then newest;
  each row `{ id, bankName, bankShort, brandColor, cardMasked, sheba,
shebaMasked, isDefault, createdAt, updatedAt }`. PAN/sheba decrypted for
  owner only; list UI uses masked fields.
- `POST /my/bank-accounts` (new, `USER` role, `@Throttle` 20/min) — body
  `{ cardNo, sheba, bankName? }`; 16-digit card + ISO13616 sheba checksum;
  Persian digits normalized. Bank name/BIN guessed from card when omitted.
  Max 5 rows per user; first row becomes default. `409` on duplicate sheba.
- `PATCH /my/bank-accounts/:id` (new, `USER` role) — `{ isDefault?: true }`
  clears other defaults for this user; owner-only `404`.
- `DELETE /my/bank-accounts/:id` (new, `USER` role) — owner-only; if the
  deleted row was default, the newest remaining row is promoted.
- Frontend: `AccountBankAccountsTab` on `AccountPage.tsx` `banks` tab (card
  list with brand chip + «پیش‌فرض» badge, inline add form).

### پنل کاربر — معرفی دوستان (`/account` → تب `referral`)

Closes the «معرفی دوستان» section in
`design-reference-v2/پنل کاربر.dc.html`.

- `GET /my/referral` (new, `USER` role) — `{ referralCode, sharePath,
stats: { invitedCount, pointsEarned, successfulBookings }, invites:
[{ id, fullName, joinedAt, status, pointsAwarded }] }`. Code is
  lazily generated on first read (`NAME-####` shape).
- `POST /auth/otp/request` — optional `referralCode` in body; applied only
  when the phone number is registering for the first time (ignored for
  returning customers and invalid/self codes).
- First ticketed booking by a referred user awards `500` club points to
  the referrer's `ClubMember` ledger (if they are a member); idempotent.
- Frontend: `AccountReferralTab` on `AccountPage.tsx` `referral` tab
  (hero banner, copy/share, KPI cards, invited-friends list).

### پنل کاربر — احراز هویت (`/account` → تب `identity`)

Closes the «احراز هویت» section in `design-reference-v2/پنل کاربر.dc.html`
**without the selfie step** (explicit CLAUDE.md cut — national ID card
upload only).

- `GET /my/identity` (new, `USER` role) — `{ status, isComplete,
canSubmit, submittedAt, rejectReason, steps: [{ key, done }],
idCardFile? }`. Step `profile` is derived from User identity fields;
  step `id_card` from an uploaded StoredFile id.
- `POST /my/identity/id-card` (new, `USER` role, `@Throttle` 10/min,
  multipart) — PDF/PNG/JPG ≤5MB via `FilesService`; blocked when status is
  `SUBMITTED` or `APPROVED`.
- `POST /my/identity/submit` (new, `USER` role) — requires profile step +
  id card; sets `SUBMITTED`.
- Frontend: `AccountIdentityTab` — warning banner, 2-step checklist (no
  selfie), upload + submit matching the design layout.

### پنل ادمین سایت — احراز هویت مشتریان (`/panel/kyc`)

Staff side of the flow above — the `APPROVED`/`REJECTED` transitions have
to be reachable somewhere; no design tab exists for it, so it follows the
`jobapps` review-queue pattern (new `kyc` tab in `PANEL_NAV.SITE_ADMIN`).
All endpoints: `JwtAuthGuard` + `RolesGuard` + `PanelAccessGuard`,
`@Roles('SITE_ADMIN')`.

- `GET /identity-verifications` (new) — rows with customer `fullName`,
  `phone`, decrypted `nationalId`, `birthDate`, `status`, `submittedAt`,
  `reviewedAt`, `rejectReason`, `idCardFileName`. `NOT_STARTED` rows are
  excluded (nothing to review).
- `GET /identity-verifications/:id/id-card` (new) — streams the id-card
  file. Dedicated staff surface (careers-resume style) instead of
  loosening the general `/files` ACL for all staff.
- `PATCH /identity-verifications/:id/approve` (new) — `SUBMITTED →
APPROVED`, sets `reviewedAt`, audit (`ACCOUNT`). 409 otherwise.
- `PATCH /identity-verifications/:id/reject` (new) — body
  `{ rejectReason }` (required, ≤500 chars); `SUBMITTED → REJECTED`, sets
  `reviewedAt` + `rejectReason` (shown to the customer, who can re-upload
  and re-submit), audit (`ACCOUNT`). 409 otherwise.
- Frontend: `IdentityAdminPage` — pending counter, queue list with
  status badges, id-card download, approve button, reject modal with a
  required reason.

### پنل کاربر — استرداد بلیط (`/account` → تب `refunds`)

Closes the gap between `design-reference-v2/پنل کاربر.dc.html`'s full
refund tab and the current amount/status-only list. The same
`RefundPenaltyRule` rows and `computePenalty` function remain authoritative
for every surface; the browser never decides eligibility or money.

All endpoints below are `JwtAuthGuard` + `RolesGuard`,
`@Roles('USER')`, owner-scoped, and return the standard response envelope.

- `GET /my/refunds/eligible-bookings` (new) — upcoming owned bookings
  whose status is `TICKETED|PAID`, which have no prior refund request, and
  whose current rule is refundable (`penaltyPct < 100`). Each row:
  `{ bookingId, pnr, flightNo, originCode, destCode, departureAt,
totalPaidIrr, hoursLeft, penaltyPct, penaltyAmountIrr, refundableIrr }`.
  The amounts are a server-computed preview at response time.
- `GET /my/refunds/rules` (new) — the current four customer-readable
  brackets sorted by `minHoursBeforeDeparture DESC`:
  `{ minHoursBeforeDeparture, penaltyPct, labelFa, isRefundable }[]`.
  This is read-only; IT_MANAGER's settings endpoint remains the
  only rule editor.
- `POST /my/refunds/preview` (new) — body `{ bookingId }`; repeats
  ownership/status/no-prior-request checks and returns
  `{ bookingId, totalPaidIrr, hoursLeft, penaltyPct, penaltyAmountIrr,
refundableIrr, refundable }`. This is called when opening the confirm
  modal so a stale list cannot display an old time bracket. 404 for
  unknown/not-owned booking; 409 when ineligible.
- `POST /my/refunds` (existing, enriched response) — body
  `{ bookingId, iban }`. **Always recomputes** eligibility and penalty in
  the transaction immediately before creating the request; the preview
  is advisory and is never trusted. Existing IBAN validation/encryption
  remains. Response uses the enriched customer row below.
- `GET /my/refunds` (existing, enriched) — customer rows:
  `{ id, trackingCode, bookingId, pnr, flightNo, originCode, destCode,
departureAt, status, totalPaidIrr, penaltyPct, penaltyAmountIrr,
refundableIrr, history: [{ step, labelFa, at }], createdAt, paidAt }`.
  No IBAN or other passenger PII is returned.
- `GET /my/refunds/:id` (existing, enriched) — same shape; 404 for another
  user's request. Static routes (`eligible-bookings`, `rules`, `preview`)
  are declared before `:id`.

Status tracking remains the existing server lifecycle:
`SUBMITTED → REVIEW → FINANCE → PAID`. The UI renders actual
`RefundRequest.history` entries plus pending placeholders for the
remaining stages; it does not fabricate completed timestamps.

Production-flow correction included in this phase: the existing
`PATCH /refunds/:id/refer` currently assigns a finance user but leaves a
customer-created request at `SUBMITTED`, while `PATCH /refunds/:id/pay`
correctly accepts only `FINANCE`; that makes payout unreachable outside
the E2E-only seeded FINANCE row. When a SITE_ADMIN refers a
`SUBMITTED|REVIEW` request to an active finance assignee, the operation now
atomically records the admin-review and finance-referral history entries
and advances it to `FINANCE`. Reassignment of an already-`FINANCE` request
does not advance status again. Payment authority remains
FINANCE_MANAGER-only and step-up protected.

Frontend: a dedicated `AccountRefundsTab` matching the approved design:
navy intro/KPIs, eligible-flight cards, four live rule cards, submission
modal with a saved-bank-account selector/manual IBAN fallback and
server-refreshed breakdown, and request cards with route/PNR/tracking code
and the four-stage timeline. fa uses Jalali/Persian digits, en uses the
design's English copy/LTR, ar uses RTL Arabic copy with the shared fallback
rules.

## Phase 21 — فراموشی رمز (customer forgot/set password)

Third "dead forms" item. `ForgotPasswordPage.tsx` was entirely client-side
(three steps advancing on every submit, no backend call). A design check
first surfaced a routing bug: `LoginPage.tsx` (staff username+password)
linked its own "فراموشی رمز عبور؟" to this same page, but
`design-reference/ورود مدیران و کارمندان.dc.html`'s own `forgotPw` handler
is **not** a navigation — it shows a toast: "برای بازیابی رمز عبور، با
واحد فناوری اطلاعات (مدیر IT) تماس بگیرید" (staff has no self-service
reset; Phase 12 already gives admins a temp-password reset tool). Fixed
to match: the link now shows that same notice instead of routing
anywhere. `فراموشی رمز.dc.html`'s own "بازگشت/ورود به حساب" links point at
`ورود و ثبت‌نام.dc.html` (customer login), confirming this page was
always meant to be customer-only.

- No new endpoints needed for identity verification — reuses the
  existing `POST /auth/otp/request` + `POST /auth/otp/verify` (Phase 2)
  verbatim to prove phone ownership. `verifyOtp` already logs the caller
  in, so the frontend immediately calls the new set-password endpoint
  with that token, then signs out so the customer logs back in fresh
  (matching the design's explicit "ورود به حساب" step) rather than
  silently staying authenticated.
- `POST /auth/set-password` (new, `JwtAuthGuard` + `@Roles('USER')`,
  `@Throttle` 5/min) — `{ newPassword }` (≥8 chars, matching the design's
  own copy). Deliberately **no current-password check** — the caller just
  proved phone ownership via OTP, and if they're here it's because they
  don't know (or never set) a password. `@Roles('USER')` is a
  security-relevant restriction: without it, a staff/agency access token
  could bypass `POST /auth/change-password`'s current-password guard
  entirely, silently overwriting that account's password with none of
  the safeguards CLAUDE.md requires for privileged accounts.
- This same endpoint doubles as first-time password setup — a customer
  who has only ever used OTP login can go through this exact flow to gain
  a password, giving real meaning to CLAUDE.md's "email+password
  optional" line for customers (previously nothing implemented it).
- `POST /auth/customer/login-password` (new, public, `@Throttle` 5/min)
  — `{ phone, password }`. Issues tokens directly like `otp/verify` does
  (no 2FA — customers aren't staff). Closes the loop: without this, a
  password set via the reset flow would have nowhere to actually be used.
  Wrong password and "phone was never given a password" both 401 with
  the identical generic message — no account-existence oracle.
- Frontend: `CustomerLoginPage.tsx`'s login tab gained a small "ورود با
  رمز عبور" toggle (phone+password fields, same visual language as the
  existing OTP form) plus a link to `/forgot-password`. The design's own
  ورود و ثبت‌نام.dc.html has no password field for customers at all — this
  is the minimal addition needed to make the new backend capability
  reachable, not a redesign; signup stays OTP-only.
- No schema change — reuses `User.passwordHash`, already nullable and
  already populated for staff accounts.

## Phase 22 — وضعیت پرواز (flight status lookup)

Fourth "dead forms" item. `FlightStatusPage.tsx` was entirely mock (a
single hardcoded `MOCK_STATUS` object returned for exactly one
flight number, "BJ-410").

- `GET /flight-status` (new, public, `@Throttle` 20/min) —
  `?flightNo=BJ-410&date=YYYY-MM-DD` or `?origin=THR&dest=MHD&date=YYYY-MM-DD`
  (exactly one of the two modes; 400 if neither is given). Finds the
  matching `FlightInstance` for that calendar day and returns real data:
  route (origin/dest codes + `Airport.cityFa`), scheduled departure/
  arrival, `resolveAircraftType()` (Phase 13's override-aware helper,
  reused verbatim), and a derived status label (`SCHEDULED` →
  "برنامه‌ریزی‌شده", `CANCELLED` → "لغو شد", `DEPARTED` → "در حال پرواز" or
  "فرود آمد" depending on whether `arrivalAt` has passed). 404 if no
  instance matches.
- **Explicitly NOT in the response: گیت (gate), تحویل بار (baggage belt),
  تأخیر (delay minutes), ترمینال (terminal).** None of these exist
  anywhere in this codebase's data model — `FlightInstanceStatus` is only
  `SCHEDULED | DEPARTED | CANCELLED` (see docs/DB_SCHEMA.md), and there is
  no gate-assignment/baggage-belt/real-time-delay operational system for
  any role to populate them from. Inventing values for these fields would
  violate CLAUDE.md's "never fabricate data" principle, so the rebuilt
  page shows only what's real and drops the design's four operational
  stat boxes rather than displaying placeholder/fake data. Building the
  real version of this (a `flightops` capability — already flagged
  deferred since Phase 18's `PANEL_NAV` notes) is a distinct, larger
  future phase, not a gap in this one.
- The design's «اطلاع‌رسانی تأخیر» SMS-subscribe checkbox is disabled
  with a "(به‌زودی)" label — same reasoning: no delay-detection system
  exists to actually trigger such a notification.
- Frontend: reuses the existing `JalaliDatePicker` component (shared with
  `HomeSearchPage.tsx`) for the date field in both search modes, and the
  same `fetchAirports()` + `<select>` pattern for the route mode's origin/
  destination pickers — the design's free-text city inputs are replaced
  with the airport-code pickers the backend actually needs, matching
  every other real search surface in this app (`HomeSearchPage.tsx`).

## Phase 23 — وب‌سرویس آژانس (Agency B2B webservice purchase)

Fifth and final "dead forms" item. `AgencyWebservicePage.tsx` was entirely
local mock state (`requested`/`keyShown` booleans, a fake sample API key
`bj_live_4f8a2c91d7e3b5a6`) — no backend involved at all.

Builds on Phase 3's pre-existing `AgencyApiKey`/`AgencyApiScope` schema
and staff-side `POST/PATCH .../api-key` endpoints (already real since
Phase 3), and replicates Phase 16's `AgencyCreditRequest`
request/decide pattern exactly, for a new `AgencyWebserviceRequest`.

### Agency-portal (self-service)

- `POST /agency-portal/webservice-requests` — body
  `{ scope: 'FULL' | 'SEARCH_BOOK', months: 1 | 3 | 12, note?: string }`
  (whitelist DTO — `forbidNonWhitelisted` rejects any other field,
  including a client-supplied price). Creates a `PENDING`
  `AgencyWebserviceRequest` with `priceIrr` computed server-side from the
  **configurable** plan catalog (`SystemSetting.webservicePlanPrices` —
  defaults: ۱ ماهه=۴۵٬۰۰۰٬۰۰۰, ۳ ماهه=۱۲۰٬۰۰۰٬۰۰۰, ۱۲ ماهه=۴۲۰٬۰۰۰٬۰۰۰
  ریال; editable by COMMERCIAL_MANAGER via `PATCH /webservice/pricing`),
  fires a cartable task to `SENIOR_MANAGER`/`FINANCE_MANAGER`/`COMMERCIAL_MANAGER`
  (same review-role set as credit requests), and audit-logs.
- `GET /agency-portal/webservice-plans` — current plan prices for this
  agency's purchase UI (same three durations, server-computed IRR).
- `GET /agency-portal/webservice-requests` — this agency's own request
  history.
- `GET /agency-portal/api-keys` — this agency's own API keys, **metadata
  only** (`id`, `scope`, `status`, `activatedAt`, `expiresAt`,
  `lastUsedAt`, `callCount`) — `keyHash` is never returned, and there is
  no raw-key field at all on this read path (see "raw key delivery"
  below).

### Agencies (staff-side review)

- `GET /agencies/webservice-requests` — cross-agency queue for the
  SITE_ADMIN «درخواست وب‌سرویس» tab (`SITE_ADMIN`, `COMMERCIAL_MANAGER`,
  `SENIOR_MANAGER`). Optional `?status=PENDING|APPROVED|REJECTED`. Each
  row includes `agencyId`, `agencyName`, `city`, `licenseNo` plus the
  same request fields as the per-agency list. Must be registered
  **before** `GET /agencies/:id/...` so `:id` does not capture
  `webservice-requests`.
- `GET /agencies/:id/webservice-requests` — list, same
  `AGENCY_TAB_ROLES` guard as credit requests (no per-method narrowing).
- `PATCH /agencies/:id/webservice-requests/:reqId/decide` — body
  `{ approve: boolean, stepUpChallengeId?, stepUpCode? }` (step-up fields
  required only when `approve: true`, enforced via `@ValidateIf`). On
  approve, calls `AgenciesService.issueApiKey` **verbatim** (same
  step-up-gated, already-audited key-issuance path Phase 3 built for the
  staff-only `POST :id/api-key` endpoint — not duplicated). On reject,
  just flips status. Ordering deliberately issues the key **before** the
  conditional `updateMany` status-flip guard (unlike `decideCreditRequest`,
  which updates first): if step-up verification fails, the request must
  stay `PENDING` for a retry, never end up `APPROVED` with no key actually
  issued.

### Commercial Manager — webservice plan pricing

- `GET /webservice/pricing` — `COMMERCIAL_MANAGER`, `CEO`, `SENIOR_MANAGER`
  — `{ prices: { 1, 3, 12 } }` in IRR.
- `PATCH /webservice/pricing` — `COMMERCIAL_MANAGER` only — body
  `{ month1PriceIrr, month3PriceIrr, month12PriceIrr }`; audited
  (SYSTEM). New agency purchase requests immediately use the updated
  prices.

Frontend: `CommercialWebservicePage.tsx` (Commercial panel's **وب سرویس**
tab — `PANEL_NAV.COMMERCIAL_MANAGER` key `webservice`) edits the three
plan prices; `AgencyWebservicePage.tsx` reads them via
`GET /agency-portal/webservice-plans`.

### Raw key delivery — a scope decision, documented here

`AgencyApiKey` only ever stores `keyHash` (Phase 3 design, unchanged) —
the raw key is retrievable exactly once, at the moment
`issueApiKey`/`updateApiKey` creates or regenerates it. The design's
webservice page shows the agency's own active key with a show/hide
toggle, which would require a second retrieval — impossible under that
storage model without either (a) storing the raw key in some retrievable
form (rejected — contradicts the existing, already-shipped Phase 3
architecture and CLAUDE.md's "never store secrets in retrievable form"
posture), or (b) delivering it once through an already-existing
notification channel. This phase takes (b): on approval,
`decideWebserviceRequest` posts the raw key as a message via
`AgenciesService.postMessage` into the agency's own message thread —
already visible through `GET /agency-portal/inbox` and the staff-side
`GET /agencies/:id/messages`, no new channel invented. The rebuilt
frontend page therefore never shows a copyable raw key; it shows
scope/status/activation metadata and a note pointing at the inbox
message.

### Explicit deferrals (flagged, not oversights)

- No FK from `AgencyWebserviceRequest` to the `AgencyApiKey` it produces
  on approval — the agency's key list is already fully visible via
  `GET /agency-portal/api-keys`; tracing "which request produced which
  key" isn't needed for this phase.
- `AgencyApiScope.SEARCH_ONLY` has no design-mock equivalent (the design
  only offers "جستجو و رزرو" and "فروش کامل") and is left unused by this
  new request flow — it remains selectable only via the pre-existing
  staff-only direct `POST :id/api-key` endpoint.
- "مشاهده مستندات API" (API docs) button in the design's active-connection
  card stays a static, non-functional element — no API docs page exists
  yet in this codebase.

## Phase 24 — پرواز (flightops: sale auto-close + نیرا manifest submission)

Closes the `flightops` gap flagged deferred since Phase 18's `PANEL_NAV`
notes and referenced again in Phase 22 (وضعیت پرواز's dropped operational
stat boxes — those stay dropped; that's customer-facing gate/baggage/delay
data with no backing model anywhere, a different, still-unbuilt concept
from this one). Read verbatim from `پنل ادمین سایت.dc.html`'s flightops
sc-if blocks: **not** gate/baggage/delay tracking — the design's own copy
is "فروش هر پرواز ۴ ساعت مانده به زمان پرواز به‌صورت خودکار بسته می‌شود و
لیست کامل مسافران به‌صورت اتومات در سامانه نیرا بارگذاری می‌گردد" (sale
auto-closes 4h before departure; the full passenger list auto-uploads to
سامانه نیرا, Iran's civil aviation manifest system). The CEO design
sidebar has no `flightops` entry — API access is
`SITE_ADMIN` / `FINANCE_MANAGER` / `COMMERCIAL_MANAGER` (SITE_ADMIN nav
exposes the tab).

- `GET /flightops` (new; `SITE_ADMIN`, `FINANCE_MANAGER`,
  `COMMERCIAL_MANAGER`) — KPI counts (کل پروازها / باز / بسته‌شده-در‌نیرا /
  مجموع مسافران) + row list, scoped to `SCHEDULED` instances only, ordered
  by soonest departure. Each read lazily materializes any instance that
  has crossed the 4h-before-departure threshold (see below) — same
  "no cron job" pattern as `materializeDepartedInstances`/
  `materializeExpiry` elsewhere in this codebase.
- `GET /flightops/:id` (same roles) — sold/free/capacity/occupancy +
  نیرا submission status (done+timestamp, or pending) + the real passenger
  manifest (`fullName`, decrypted `nationalId`, `seatCode`, `pnr`) for
  `SOLD_STATUSES` (`PAID`/`TICKETED`) passengers only. 404 for a missing
  or `CANCELLED` instance — a cancelled flight has no real manifest to
  submit, so it's excluded rather than shown with a fabricated "pending"
  state.
- **Sale-close derivation**: `isSaleAutoClosed(departureAt)` — pure,
  `departureAt − now ≤ 4h`. This is a NEW, fixed 4-hour rule, distinct
  from the existing, unrelated, per-instance-configurable
  `saleStartsAt`/`saleEndsAt` window (Phase 13) — the two are independent
  and this phase does not touch the latter.
- **نیرا submission**: a `NiraProvider` interface (`backend/src/common/
nira/`) with a `MockNiraProvider` (dev/test — logs the manifest and
  always succeeds, never fabricates a failure rate, same convention as
  `MockSmsProvider`), wrapped by `NiraService` (mirrors `SmsService`).
  Once an instance crosses the 4h threshold, the next `flightops` read
  submits the real manifest and persists `FlightInstance.niraSubmittedAt`
  via a conditional `updateMany` (idempotency guard — a second read never
  re-submits or moves the timestamp).
- **Explicit scope narrowing (documented, not an oversight)**: this phase
  does NOT make the 4h auto-close a booking-creation restriction. The
  design itself has no manual "close" action and no visible link between
  this admin report and the booking flow — it is a reporting/manifest-
  submission surface. `POST /booking` (Phase 13) is unchanged; a seat can
  still be booked within 4h of departure exactly as before. If a future
  requirement needs the close to actually block sales, that's a distinct,
  larger change (touches the booking-engine's hot path and its full
  existing test suite) and should be its own phase, not bundled here. No
  real نیرا HTTP integration exists or is planned — behind the provider
  interface exactly like every other external system in this codebase.
  No manifest export (CSV/Excel) — the design's `exportPax` button has no
  specified file format.

### `backend/src/modules/flightops/` (new)

## Phase 25 — حریم خصوصی و داده‌های من (GDPR export/delete UI)

The backend for this (`GET /my/privacy/export`, `DELETE /my/privacy/account`
— `backend/src/modules/booking-engine/privacy.controller.ts`/
`privacy.service.ts`, `@Roles('USER')`) already existed from the public-site
track's port (see PLAN.md's Phase 13 merge note) and was already covered by
`backend/test/privacy.e2e-spec.ts` (3 tests) — but was never documented
here, and had no frontend surface at all (PLAN.md flagged this explicitly:
"a GDPR export/delete UI screen don't exist yet — those endpoints are
currently curl/Supertest-only"). This phase is documentation + frontend
only; no backend/schema changes.

- `GET /my/privacy/export` — full JSON of the customer's own data: account
  fields, bookings (with passengers, national ID decrypted for this
  surface only — same "narrow authorized decrypt surface" precedent as
  refunds' شبا), refunds, wallet entries, club membership + points ledger,
  price locks.
- `DELETE /my/privacy/account` — soft-deletes the account (`isActive:
false`, `deletedAt`, phone/email/fullName scrubbed), anonymizes
  passenger PII on the customer's own bookings (`fullName` → placeholder,
  `nationalIdEnc`/`nationalIdHash`/`mobileEnc` cleared, `deletedAt` set),
  clears `Booking.contactPhone`, and revokes every active `RefreshToken` —
  all in one transaction. Booking/ledger rows themselves are kept (CLAUDE.md:
  soft delete for bookings, financial audit trail) — only PII fields are
  scrubbed, not the records.
- Frontend: new "حریم خصوصی و داده‌های من" section on the customer پنل
  کاربر's پروفایل من tab (`AccountPage.tsx` — no design-reference page
  covers this; CLAUDE.md's GDPR requirement applies regardless of what the
  mock shows, so this is the minimal addition needed to make the
  already-real backend capability reachable, same reasoning as Phase 21's
  password-login toggle). "دانلود اطلاعات من" downloads the export as a
  JSON file client-side (`Blob` + `URL.createObjectURL`, no server-side
  file generation). Delete requires an explicit two-step confirm (a warning
  panel with "بله، حساب من حذف شود" / "انصراف" — never a bare
  `window.confirm`, for testability and to show the real consequences
  before the irreversible action) before calling the endpoint; on success,
  signs the session out and returns to the home page.

## Phase 26 — ارجاعات (EMPLOYEE recipient-side referral listing)

Closes the `referrals` nav gap flagged deferred since Phase 18 (`PANEL_NAV`
notes): پنل کارمند.dc.html's `navKeys` formula always appends `referrals`
(unconditional — not gated by any permission key), but the only listing
endpoint (`GET /referrals`) was sender-scoped (`referrals.service.ts`'s
`list` — "ارجاعات من به مدیران", `SENIOR_MANAGER` only). Recipients of any
role (`STAFF_ROLES` — any staff member can be a referral recipient, see
`referrals.service.ts`'s `create`) had detail (`GET /referrals/:id`) and
report-submission (`POST /referrals/:id/reports`) access since Phase 4,
but no discovery listing and, until this phase, **no frontend at all**
for the recipient side — not just for EMPLOYEE.

- `GET /referrals/mine` (new; same access set as `:id`/`:id/reports` —
  `EXEC_ROLES` + `SITE_ADMIN` + `IT_MANAGER` + `EMPLOYEE`) — referrals
  where the caller is a recipient, each with a `hasMyReport` flag (true
  once THIS actor has submitted at least one report on that referral —
  independent of the referral's overall `status`, since multiple
  recipients can each report separately) and `counts.awaitingMyReport`
  (not yet reported by me, and not `CLOSED`).
- `PANEL_NAV.EMPLOYEE` now always includes `{ key: 'referrals', labelFa:
'ارجاعات' }`, matching the design's unconditional formula — no longer
  gated behind a wired permission key (referrals are personally
  addressed, not section-based access).
- Frontend: the `referrals` panel tab now renders per-role via a new
  `ReferralsRouter` (same "one tab key, two designs" pattern as
  `SecurityRouter`/Phase 8) — `SENIOR_MANAGER` keeps the existing
  sender-side `ReferralsPage`; `EMPLOYEE` gets a new `MyReferralsPage`
  (list + detail + a real report-submission form calling
  `POST /referrals/:id/reports`, the first frontend surface anywhere in
  this codebase for that endpoint).
- **Explicit scope narrowing (documented, not an oversight)**: this phase
  only wires the EMPLOYEE frontend (the specific gap flagged in Phase 18).
  Other potential recipient roles (e.g. a CEO/BOARD_CHAIR/FINANCE_MANAGER/
  COMMERCIAL_MANAGER referral, sent by a different manager) still have no
  frontend for `GET /referrals/mine`/report submission — the backend
  endpoint is already generically available to them (same guard set), so
  a future phase can add that UI without any backend change. The design's
  mock `getStaffReferrals` also shows an "accept"/"forward to a colleague"
  flow with no real backing model — not built; the real, already-tested
  `ManagerReferral`/`submitReport` workflow (accept implicitly by
  reporting; no forwarding) is used instead, matching this codebase's
  "never invent parallel logic the real backend doesn't support"
  convention.

## Phase 27 — EMPLOYEE write/financial access: fl_manage + ag_settle + fn_invoices

Prior phases (18, 26) left EMPLOYEE with only read-only or personally-
addressed access (`fl_view`, `ag_list`/`ag_info`/`ag_requests`, referrals).
The remaining unwired `PERMISSION_CATALOG` keys were left unwired
deliberately as a security decision ("no unjustified financial-write
expansion" — see prior `PANEL_NAV`/`EMPLOYEE_SECTION_NAV` notes), not an
oversight. This phase widens exactly the three keys the product owner
explicitly authorized (`fl_manage` + `ag_settle` + `fn_invoices`); the
remaining IT-dept keys (`us_manage`, `sv_control`, `sc_manage`, `lg_view`)
stay out of scope and unwired pending a separate decision.

- **`fl_manage`** (catalog dept `commercial`) — `@RequiresPermission('fl_manage')`
  added (alongside the existing `SENIOR_MANAGER`/`COMMERCIAL_MANAGER` roles,
  now also `EMPLOYEE`) to every flights write endpoint: `POST /flights`,
  `POST /flights/schedules`, `POST /flights/ai-analysis`,
  `PATCH /flights/:instanceId/plan`, `PATCH /flights/:instanceId/aircraft`
  (step-up unaffected), `POST/PATCH/DELETE /flights/:instanceId/fare-rules[/:ruleId]`,
  `POST /flights/:instanceId/allotments`. Read endpoints stay on `fl_view`
  as before.
- **`ag_settle`** (catalog dept `finance`) — `POST /agencies/:id/settle` now
  also accepts `EMPLOYEE` + `RequiresPermission('ag_settle')`.
- **`fn_invoices`** (catalog dept `finance`) — `GET /agencies/:id/invoices`,
  `PATCH /agencies/:id/invoices/:invoiceId/pay`,
  `POST /agencies/:id/invoices/:invoiceId/remind` now also accept
  `EMPLOYEE` + `RequiresPermission('fn_invoices')`. `POST /agencies/:id/invoices`
  (issuing) deliberately stays `COMMERCIAL_MANAGER`-only — issuing is not
  part of `fn_invoices`'s catalog label ("مشاهده و مدیریت فاکتورها" scopes
  to viewing/settling existing invoices, not creating new ones).
- **Reachability fix**: `GET /agencies` and `GET /agencies/:id` widened to
  `@RequiresPermission('ag_list'|'ag_info', 'ag_settle', 'fn_invoices')` (any
  one). Without this, an EMPLOYEE granted only `ag_settle` or only
  `fn_invoices` (no `ag_list`/`ag_info`) could never load the list or a
  specific agency's detail page to reach the action they were granted —
  a "permission granted but functionally unreachable" bug caught during
  this phase's own design review.
- **`fl_manage`/`ag_settle` per-employee dept constraint**: `fl_manage` is
  a `commercial`-dept catalog key while `ag_settle`/`fn_invoices` are
  `finance`-dept; `EmployeesService.setPermission`/`.create` both resolve
  grantable keys via `catalogDeptFor(employee.dept)`, which never changes
  after creation — so a single EMPLOYEE can only ever hold keys from ONE
  dept. This mirrors real org structure (a commercial-dept employee isn't
  independently grantable finance permissions) and is not a bug; Phase 27's
  e2e tests use two separate fixture employees accordingly.
- `EMPLOYEE_SECTION_NAV.flights.wiredKeys` gains `fl_manage`;
  `EMPLOYEE_SECTION_NAV.agencies.wiredKeys` gains `ag_settle` + `fn_invoices`.
  `fn_invoices`'s real UI surface is the per-agency invoice table on
  `AgencyDetailPage` (reached via the `agencies` tab, same as `ag_settle`)
  — **not** `FinancePage.tsx`'s `FINANCE_MANAGER`-only company-wide
  revenue/profit/all-transactions dashboard, which was deliberately never
  widened: that page's real UI surface is far broader than "view/manage
  invoices," and granting it would be a genuine over-broad-access risk,
  not a mechanical nav wiring.
- Frontend: `AgencyDetailPage.tsx` gains an `isEmployee` branch — the
  settle button (previously `isSenior || isFinance`) now also includes
  `isEmployee`; the invoices table (previously rendered only inside the
  `COMMERCIAL_MANAGER`-only tabbed layout) now also renders in the
  non-tabbed overview branch EMPLOYEE uses, with the «صدور فاکتور» button
  omitted (`action={isCommercial ? <button>… : undefined}`) since
  `fn_invoices` never grants issuing. The invoices fetch for EMPLOYEE is
  wrapped in its own try/catch: an EMPLOYEE reaching the page via
  `ag_settle` alone (no `fn_invoices`) gets a real 403 on that fetch,
  which is swallowed locally so it doesn't block the rest of the
  (permitted) page — the invoices section then just renders empty, and
  server-side authorization is still the real enforcement for any invoice
  action.

## Phase 28 — IT Manager external-service «تنظیمات» edit modal

No backend change — `PATCH /it/services/external/:id` (`UpdateExternalServiceDto`:
`nameFa`/`endpoint`/`method`/`timeoutMs`/`apiKey`/`sandbox`/`enabled`, all
optional) was already implemented and e2e-tested since Phase 8; only its
frontend surface was deferred. Closes that deferral: `ServicesPage.tsx`'s
external-service cards gain a «تنظیمات» button opening a modal pre-filled
with نام سرویس/Endpoint/متد/مهلت اتصال; کلید احراز (API key) stays blank by
default (the raw key is never returned by the API — only `hasApiKey`) and
is sent only if the operator types a new one, so an unedited save never
overwrites an existing key with an empty string. Client-side validation
mirrors the existing add-service modal (نام سرویس/Endpoint required,
مهلت اتصال bounded 1000–120000ms, matching the DTO's own `@Min`/`@Max`).

## Phase 29 — referral/report attachment upload + view UI

Closes the "Attachment upload UI on the referral/compose modals" deferral
from Phase 4 (`docs/features/cartable-referrals.md`). The files module
(`POST /files`, `GET /files/:id`) and `CreateReferralDto`/`CreateReportDto`'s
`attachmentIds` were already complete and tested since Phase 4 — attaching
worked at the API level, but responses only ever returned the raw
`StoredFile` id array, with no frontend surface to pick or view them.

- `ReferralsService.list()`, `.detail()`, and `.myReferrals()` now resolve
  each `attachments: string[]` (raw ids) into
  `{id, fileName, mimeType, sizeBytes}[]` — `.detail()` resolves both the
  referral's own attachments and each report's. `submitReport()`'s own
  return value is left unresolved (unused by the frontend, which reloads
  via `detail()`/`myReferrals()` after submitting).
- No DTO change — `attachmentIds` was already accepted and ownership-
  validated (`assertOwnedAttachments`) on both `POST /referrals` and
  `POST /referrals/:id/reports`.
- **Bug fix (pre-existing, not introduced this phase)**: `FilesService
.store()` used `file.originalname` directly. multer/busboy decode
  multipart header bytes as latin1 by default; browsers send non-ASCII
  filenames (Persian, in this platform's case) as raw UTF-8 bytes, so the
  undecoded name came out as mojibake. Fixed by re-decoding
  `Buffer.from(file.originalname, 'latin1').toString('utf8')` — a no-op
  for ASCII names, so no behavior change for the existing ASCII-only
  fixtures in `files.e2e-spec.ts`. Caught by this phase's own e2e test
  using a Persian filename, which none of the pre-existing upload tests
  did.
- Frontend: new `frontend/src/api/files.ts` (`uploadFile`, `downloadFile`
  — the latter via a new `apiGetBlob` in `http.ts`, since `GET /files/:id`
  returns a raw file body on success, not the `{success,data}` envelope).
  New reusable `AttachmentPicker` (upload control + removable chips,
  matching the design's dashed "افزودن سند" control) and `AttachmentList`
  (read-only, click-to-download chips) components, wired into both
  `ReferralsPage.tsx` (creation modal, detail view's request body and
  each report) and `MyReferralsPage.tsx` (report-submission form, detail
  view's request body).

## Phase 30 — data-driven seat-map aisle gap rendering

Closes the "seat map's exact aisle-gap rendering" deferral from Phase 9
(`docs/features/reservation.md`). `AircraftSeatMap.{business,economy}
ColsLeft/ColsRight` were already the real per-aircraft-type column-group
config (CLAUDE.md: "seat map config lives per aircraft type in the DB,
not hardcoded"), but `GET /reservation/seatmap/:flightInstanceId` never
exposed it, and the frontend seat grid instead hardcoded the aisle gap
at a fixed seat index — invisible only because the single seeded
aircraft type happens to be business 2-2 / economy 2-3, which matches
that fixed index by coincidence.

- `SeatmapService.getSeatMap()` now returns `cabinLayout:
{ BUSINESS: { aisleAfterIndex }, ECONOMY: { aisleAfterIndex } }`,
  computed from `map.businessColsLeft.length` /
  `map.economyColsLeft.length` for that flight instance's real aircraft
  type (`resolveAircraftType`, so a `changeAircraftType` override is
  respected same as everywhere else that reads aircraft type).
- `ReservationPage.tsx`'s seat grid reads `aisleAfterIndex` per row's
  cabin instead of the previous `idx === 1`.
- No DTO/schema change — `AircraftSeatMap` already had the source data;
  this only exposes and consumes it.

## Phase 31 — EMPLOYEE narrow access to the IT-dept permission keys

Closes the last deferral from Phase 8/27: `us_manage`/`sv_control`/
`sc_manage`/`lg_view` were seeded in `PERMISSION_CATALOG` since Phase 8
but never wired to any real access. Unlike Phase 27's `fl_manage`/
`ag_settle`/`fn_invoices` (which had a designed EMPLOYEE screen to wire
against), the design has **zero page body** for any of the IT panel's
four EMPLOYEE-relevant tab keys (`users`/`services`/`security`/`logs`) —
`design-reference/پنل کارمند.dc.html`'s nav generator lists them by
label/icon, but no `sc-if` block or `titles{}`/`subs{}` entry exists for
any of the four, so wiring an `EMPLOYEE_SECTION_NAV` entry would only
produce a dead/blank tab. This phase is therefore **backend-only**, and —
because several of the underlying IT_MANAGER endpoints are genuinely
sensitive (self-permission-granting, a site-wide service kill switch,
company-wide session data, a force-logout-everyone action) — required a
second, more specific round of product sign-off beyond the initial "which
backlog item" decision, narrowing each key to a small, explicitly-approved
slice of its module rather than the raw IT_MANAGER endpoint list:

- **`us_manage`** — the legacy umbrella remains accepted as a bundle for
  the operation-level `us_list` and `us_reset_password` grants. `GET
/it/employees` (list) and `GET /it/employees/:id` (detail) are now
  reachable by `EMPLOYEE`, but always scoped server-side
  to the actor's **own dept** (`EmployeesService.deptScopeForEmployee`
  looks up the actor's `dept` fresh from the DB — `AuthenticatedUser`
  doesn't carry `dept`, same freshness pattern as
  `EmployeePermissionGuard`'s own live grant check). A `?dept=` query
  param from the client is silently overridden, not honored — it can't be
  used to view another dept's roster. `GET /it/employees/:id` for a
  different-dept id → 403. `POST /it/employees/:id/reset-password` is
  also reachable, but only for a same-dept colleague — resetting one's
  own password via this endpoint, or another dept's, → 403 (it's a
  "help a colleague" tool, not self-service and not cross-dept).
  `POST /it/employees` (create), `PATCH .../status` (suspend), and
  `PATCH .../permissions` (grant/revoke any catalog key — the actual
  privilege-escalation surface) stay strictly `IT_MANAGER`-only.
- **`sv_control`** — the legacy umbrella is accepted for `sv_view`; only
  `GET /it/services` (view internal/external service list + health), the
  internal/external report reads, and SMS-log reads are reachable. Toggling an internal service
  (site-wide kill switch for e.g. payment/search/SMS/CDN),
  creating/updating/deleting an external service (including its
  encrypted API key), and the live connection test stay
  `IT_MANAGER`-only; `sv_control`/`sv_config` metadata remains attached to
  the corresponding mutation handlers for future delegated grants.
- **`sc_manage`** — the legacy umbrella is accepted for `sc_view`; only
  `GET /it/security/policy` (view the current
  password/security policy) is reachable. `GET /it/security/sessions`
  is deliberately **excluded** — narrower than the scope originally
  proposed ("policy + own sessions"), because `SecurityService
.listSessions()` has no per-actor filter (it returns every active
  session company-wide: user, device, IP), and there is no "my sessions
  only" endpoint to scope to. Building one was judged out of scope for
  this narrow phase, so the safer choice was to exclude `/sessions`
  entirely rather than expose company-wide session/IP data to a regular
  employee. `PATCH policy` and `POST sessions/logout-all` (force-logs-out
  every active session site-wide, already step-up gated) stay
  `IT_MANAGER`-only.
- **`lg_view`** — `GET /audit/logs` (`AuditService.systemLogs()`) is
  reachable, and `lg_export` authorizes the bounded `GET /audit/logs/export`
  CSV download (at most 100 filtered rows). Already narrower than the CEO's
  `system-events` endpoint —
  scoped to `SYSTEM`/`ACCOUNT` categories only, not the financial/
  strategic audit trail `ceoSystemEvents()` exposes — so it was wired
  as-is with no additional narrowing needed.

Mechanically: each newly-reachable `GET`/`POST` method gets
`@Roles('IT_MANAGER', 'EMPLOYEE')` + `@RequiresPermission('<key>')` added
at the method level (method-level `@Roles` fully replaces the
class-level `@Roles('IT_MANAGER')` for `RolesGuard`, which reads via
`getAllAndOverride` — so this doesn't loosen any other method on the same
controller), and `EmployeePermissionGuard` is added to the guard chain of
`EmployeesController`/`ItServicesController`/`SecurityController`/
`AuditController` (only a no-op pass-through for non-`EMPLOYEE` actors,
so `IT_MANAGER`/`CEO` behavior is unchanged — proven by this phase's own
"doesn't affect IT_MANAGER" test). The export endpoint reuses the existing
`AuditLogQueryDto`; no DTO or database-schema changes are required.

## Phase 34 — کیف پول (top-up) + قفل قیمت هوشمند: retroactive docs + frontend closure

`backend/src/modules/booking-engine/wallet.service.ts`/`price-lock
.service.ts`/`wallet-points-lock.controller.ts` shipped in an earlier
phase's merge (see PLAN.md's public-site/"Promo codes / wallet / club
points ledger / price lock" bullet) but never got a dedicated docs/API.md
section — this section documents the endpoints retroactively, alongside
the two additive response-shape changes this phase made. Full reasoning,
the frontend UI closure, and the found-and-fixed bugs are in
`docs/features/wallet-price-lock.md`.

### `backend/src/modules/booking-engine/` — wallet ("کیف پول") — `@Roles('USER')`

| Method | Path               | Notes                                                                                                                                                                                                                                  |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/my/wallet`       | `{ balanceIrr, entries }` — `balanceIrr` is always `SUM(WalletEntry.signedAmountIrr)`, never a mutable column. `entries` is the newest-first immutable wallet history with booking/PNR context when present.                           |
| POST   | `/my/wallet/topup` | `{ amountIrr (min 10,000) }` — a sandbox "always succeeds" gateway (no redirect/callback, unlike `POST /bookings/:id/pay`'s `GATEWAY` method): inserts a `WalletEntry(type=TOPUP)` and returns the new `{ balanceIrr }` synchronously. |

### `backend/src/modules/booking-engine/` — price lock ("قفل قیمت هوشمند") — `@Roles('USER')`

| Method | Path                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/my/price-locks`     | `{ flightInstanceId, cabin }` — 403 if the caller isn't a `GOLD`/`PLATINUM` `ClubMember`; 404 if the flight is gone or no longer `SCHEDULED`; 409 if an active, unexpired lock already exists for that user+flight+cabin **or wallet balance can't cover the fee**. Locks the live cabin price for 72h flat (`LOCK_TTL_MS`), fee = flat 3% of that price rounded to the nearest 10,000 IRR (`LOCK_FEE_PCT`). **Fee is debited from the wallet** (`PURCHASE` ledger row, `feeCharged=true`) on create and refunded (`TOPUP`) on cancel when previously charged. |
| GET    | `/my/price-locks`     | Own locks, newest first. **Phase 34 addition**: each row now also includes `flight: { flightNo, originCode, destCode, departureAt }` (joined via `FlightInstance → Flight → Route`) — previously only raw fields, giving the frontend no way to show which flight a lock is for.                                                                                                                                                                                                                                                                               |
| DELETE | `/my/price-locks/:id` | Owner-only; 404 otherwise; 400 if not currently `ACTIVE` → `CANCELLED`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Consumption at booking time is **implicit** — `POST /bookings` does not
take a `priceLockId`. `BookingService.createBooking` looks up any active,
unexpired, not-yet-consumed lock for the exact user+flight+cabin
(`PriceLockService.findUsableLock`) and prices the booking at the locked
rate automatically, atomically claiming the lock (`bookingId` set) inside
the same transaction to guard against a concurrent duplicate request. At
payment, an active lock skips price-change detection entirely, then
flips to `USED`.

**Phase 34 addition**: every `BookingDetail` response (`toDetail()` — `GET
/bookings/:id`, `GET /bookings/me`, `POST /bookings`, the `booking` field
inside `POST /bookings/:id/pay`'s response, `POST /manage-booking/lookup`)
now includes `isPriceLocked: boolean`. Found and fixed a real staleness
bug while adding this: `createBooking()`'s `booking` object is fetched
(with the `priceLock` relation included) **before** the same
transaction's `tx.priceLock.updateMany(...)` actually claims the lock, so
a naive `!!booking.priceLock` read the pre-claim snapshot and was always
`false` right after creating a locked booking. Fixed by deriving the flag
from `usableLock` (already resolved earlier in the method, before the
transaction starts) instead of trusting the post-transaction relation
snapshot.

## Phase 35 — صف مغایرت‌های پرداخت: frontend closure (retroactive docs)

`GET /reconciliation` / `PATCH /reconciliation/:id/resolve`
(`backend/src/modules/reconciliation/`, `FINANCE_MANAGER` only) shipped in
Phase 13 Part E — see that section above for the endpoints' own request/
response shapes and reasoning — but never got a frontend surface or a
dedicated docs/API.md mention of its own until now. Found via a systematic
audit cross-referencing every backend controller route against every
frontend `api/*.ts` caller (prompted after Phase 34 turned up a similar
gap for wallet/price-lock) — of everything that audit could check before
it was interrupted, this was the one confirmed genuine, non-deferred,
non-internal gap. No backend change; `FinancePage.tsx`'s finance-ops view
gained a «صف مغایرت‌های پرداخت» card (list + resolve-with-note action) —
see `docs/features/finance-reports.md`'s Phase 35 section for the full
checklist.

## Phase 36 — عدم حضور مسافر: frontend closure (retroactive docs)

`PATCH /reservation/pnr/:pnr/no-show` (Phase 13 Part E, `CAN_LOCK_ROLES` —
see that section above for the endpoint's own behavior) had the same
shape of gap as Phase 35: fully implemented, fully e2e-tested, no
frontend control, found by the same audit. `ReservationPage.tsx`'s PNR
detail modal gained a «ثبت عدم حضور مسافر» button (shown for `canLock`
roles when the booking is `TICKETED`/`FLOWN`), and the frontend's
`BookingStatus` type gained the `FLOWN`/`NO_SHOW` values it was missing.
No backend change. See `docs/features/reservation.md`'s Phase 36 section
for the full checklist, including why the seat-lock approval queue
(`.../locks/:id/approve`/`reject`, `pnr/from-lock/:lockId`) — a different,
larger gap the same audit turned up — stays deliberately un-built.

## Phase 37 — سامانه پیامک (SMS) log: frontend closure (retroactive docs)

`GET /it/services/sms-log` (Phase 14, `IT_MANAGER`) had the same shape of
gap as Phases 35/36: fully implemented and e2e-tested, no frontend
surface, found by the same audit. `ServicesPage.tsx` gained a «سامانه
پیامک (SMS)» card (enabled state, today's success/fail counts, recent
messages with masked phones) below the existing internal-services grid.
No backend change. See `docs/features/it-manager.md`'s Phase 37 section.

## Phase 38 — تغییر نوع هواپیما (aircraft-type change): frontend closure

`PATCH /flights/:instanceId/aircraft` shipped backend-only in Phase 13
Part A (see that section above for its own request/response shape,
`CAPACITY_BELOW_CONFIRMED` conflict, and role gate) — found by the same
systematic controller-vs-frontend audit as Phases 35–37: fully
implemented and e2e-tested, no frontend control anywhere. Two small,
additive backend changes were needed to build a real (not free-text) form
around it:

- `GET /flights/aircraft-types` (new, `SENIOR_MANAGER` + `COMMERCIAL_MANAGER`
  - `EMPLOYEE` with `fl_view`, matching the existing `airports` catalog
    endpoint's role gate) — lists every seeded `AircraftSeatMap` row as
    `{ aircraftType, capacity }`, capacity computed via the same
    `enumerateSeats()` helper `changeAircraftType()` already uses for its
    own capacity check. No such listing existed anywhere: every other
    `AircraftSeatMap` reader already knows the exact type string it wants
    (from `Flight.aircraftType` or a `changeAircraftType` override), so this
    is the first caller that needs the full catalog — needed so the UI can
    offer a real dropdown instead of an error-prone free-text field.
- `GET /flights/:instanceId` (detail) response gains `aircraftType`
  (resolved via the existing `resolveAircraftType()` util —
  `instance.aircraftTypeOverride ?? instance.flight.aircraftType`) so the
  detail modal can show the current type and pre-select it in the form.

Frontend: the flight-detail modal in `FlightsPage.tsx` gained a «نوع
هواپیما» box showing the current type, with a تغییر button that reveals a
select (populated from `GET /flights/aircraft-types`, fetched once and
cached) + ثبت تغییر/انصراف. Submitting requires step-up 2FA via the
existing `useStepUp('PRICE_CAPACITY_CHANGE')` hook (same scope used by
`PATCH /flights/:instanceId/plan`), then calls
`changeFlightAircraft(id, aircraftType, stepUp)`; the
`CAPACITY_BELOW_CONFIRMED` conflict is surfaced inline exactly like the
plan modal's own conflict handling.

**Deliberately deferred, not silently dropped**: `flights` also exposes
fare-rules CRUD (`GET/POST/PATCH/DELETE
/flights/:instanceId/fare-rules`) with the same shape of gap — backend
complete, no frontend surface — but it's a materially bigger admin table
(multi-field rows: fare class, channel restrictions, refund/exchange
penalties) with no design-reference screen to build against, unlike this
phase's single-field form over an existing pattern. Left for a future
phase with explicit direction rather than inventing the table's UX
unilaterally.

## Phase 39 — بازبینی مدارک آژانس (staff-side agency document review)

`AgencyDocument` (Agency Portal track, self-service upload) has had a
real `status` enum (`PENDING`/`APPROVED`/`REJECTED`) since it shipped,
and its own Prisma comment said so explicitly: _"Staff-side review is
deferred... every row stays PENDING until that workflow is built."_
`POST /agency-portal/documents` (agency uploads a license/contract) has
always worked, but no staff endpoint could see or decide on the result —
every uploaded document sat `PENDING` forever. Found while explaining the
audit's agency-portal findings to the user; correcting two other items on
that same list that turned out to be **already built** (not gaps): the
«صندلی‌های تخصیص‌یافته» allocated-seats tab (`GET
/agency-portal/allotments`, wired since Phase 13 Part C /
`AgencySeatsPage.tsx`) and the «وب‌سرویس» self-service purchase flow
(Phase 23, above) — `docs/features/agency-portal.md`'s deferred list
still named both as unbuilt; that's now corrected there.

New endpoints, `backend/src/modules/agencies/` — same `AGENCY_TAB_ROLES`
guard as every other staff-side request-review pair here (credit-requests,
webservice-requests), no per-method narrowing:

- `GET /agencies/:id/documents` — this agency's uploaded documents,
  newest first, with the same `file: { fileName, sizeBytes, mimeType }`
  shape `GET /agency-portal/documents` already returns.
- `PATCH /agencies/:id/documents/:docId/decide` — `{ approve: boolean }`.
  404 if the document doesn't belong to `:id`; 409 if already decided
  (conditional `updateMany` guards a concurrent double-decision race,
  same pattern as `decideCreditRequest`/`decideWebserviceRequest`). No
  step-up required — unlike credit-limit changes or API-key issuance,
  approving/rejecting a document changes no money, capacity, or access;
  it only unblocks a human reading the file. `AgencyDocument` has no
  `decidedById`/`decidedAt` columns (unlike the other two request
  models), so only `status` is written — a schema gap, not a bug: adding
  those columns is a trivial follow-up if audit trail granularity beyond
  the existing `AuditLog(category=AGENCY)` row is ever needed.

Frontend: `AgencyDetailPage.tsx` (Senior/Finance panels' overview tab,
Commercial panel's مالی sub-tab — matching where creditCard/invoicesSection
already live for Commercial) gained a «مدارک آپلودشده» card: doc-type
label, file name, Jalali upload date, status pill, تأیید/رد buttons on
`PENDING` rows only. `EMPLOYEE` never fetches or sees this card (matches
the endpoint's role gate — no `EmployeePermission` key currently grants
document review).

Frontend (credit/webservice requests): `AgencyDetailPage.tsx`
(Senior/Finance overview + Commercial مالی sub-tab) gained
«درخواست‌های افزایش اعتبار» and «درخواست‌های خرید وب‌سرویس» cards —
same approve/reject pattern as documents; webservice approval reuses the
existing step-up gate (`API_KEY_ROTATE`) because it issues a real API key.

## Phase 40 — ترجیح زبان نمایش (display-language preference storage)

First concrete step of the multi-language (fa/en/ar) + responsive redesign
the user is bringing in (design bundle: public site + پنل کاربر + پنل
آژانس only — staff/executive panels stay Persian-only, out of scope here
and in every phase after). This phase builds ONLY the storage/sync
plumbing for a language preference — no page has translated strings yet;
that's separate, larger work. Explicitly NOT mock data: the value is a
real DB column with a real endpoint, reachable from a real, tested
frontend hook.

- `User.preferredLocale` (new column, enum `Locale` = `FA`/`EN`/`AR`,
  `@default(FA)`) — the DB row is only the **cross-device sync point for a
  logged-in USER/AGENCY**. An anonymous visitor's choice has no `User` row
  to attach to, so it lives in `localStorage` (`blujet_lang`, matching the
  design bundle's own key) until they log in.
- `GET /auth/me` (existing) now does a fresh DB read instead of echoing
  the JWT payload verbatim, and includes `preferredLocale` — a locale
  change happens far more often than a short-lived access token gets
  refreshed, so baking it into the JWT would go stale.
- `PATCH /auth/me/locale` (new, any authenticated role — harmless
  self-scoped data, no need to gate to USER/AGENCY at the API level even
  though only those two frontends currently expose a language switcher)
  — `{ locale: 'FA'|'EN'|'AR' }`. Not audited: a display preference isn't
  a security/financial/admin event per CLAUDE.md's audit-log rule scope.

Frontend: `frontend/src/hooks/useLocale.tsx` (`LocaleProvider`/`useLocale`,
mounted in `App.tsx` inside `AuthProvider`) — `localStorage` is always the
first-read source (avoids a flash of the wrong language before any server
round-trip); on login, if the DB's `preferredLocale` differs from the
current `localStorage` value, the DB wins (the device now represents that
account); `setLocale()` writes `localStorage` immediately and — only when
authenticated — fires `PATCH /auth/me/locale` to sync the DB (fire-and-forget,
a failed sync just retries on the next explicit change).

**Deliberately deferred to later phases**: actual translated strings for
any real page, the language switcher UI itself, RTL/LTR direction
switching, the responsive breakpoint work, and the split forgot-password
mechanism (email+code for EN vs. phone+OTP for FA/AR, confirmed from the
design bundle) — this phase is the storage layer those all depend on, not
the features themselves.

## Phase 41 — public i18n + responsive shared shell foundation

Frontend-only phase, no new/changed endpoints. Builds the shared dictionary
(`frontend/src/lib/i18n.ts`) and breakpoint hook (`frontend/src/hooks/
useIsMobile.ts`) that `PublicPageShell`/`PublicHeader`/`PublicFooter` now
use for locale-aware direction/font/strings and a real
`matchMedia`-tracked mobile layout, plus the language switcher UI (desktop
dropdown + mobile off-canvas cycle) wired to the existing `useLocale()`
from Phase 40. See `docs/features/i18n-responsive-foundation.md` for the
full checklist. Per-page body translation is out of scope for this phase.

## Phase 42 — صفحه اصلی (Home) real i18n + responsive body content

Frontend-only, no new/changed endpoints. First per-page translation built
on Phase 41's shared shell: `HomeSearchPage` now renders through
`PublicPageShell`, translates every marketing/search string into fa/en/ar
(extracted from `design-reference-v2/صفحه اصلی.dc.html`, not invented),
and collapses to the mobile layout via `useIsMobile()`. New shared money
helpers in `frontend/src/lib/fa-format.ts`: `arDigits`, `formatToman`,
`formatLocalePercent` — for locale-aware digit/separator display of a
plain toman amount (distinct from `faMoney`, which is specifically the
rial→toman API-value converter). Real prices stay in toman across all
three locales — the design mock's EN-mode USD prices were NOT replicated,
since the backend only ever charges IRR. See
`docs/features/home-page-i18n-responsive.md` for the checklist, including
the known limitation that the real airport dropdown has no `cityEn`/
`cityAr` column yet and falls back to `cityFa` for any city not in the
page's small hardcoded marketing-card city map.

## Phase 43 — نتایج پرواز (Results) real i18n + responsive body content

Frontend-only, no new/changed endpoints. Third page translated (after the
shared shell in Phase 41 and صفحه اصلی in Phase 42): `ResultsPage`
translates its search summary bar, price-calendar strip, filter sidebar,
AI price radar, sort tabs, mock flight schedule, real bookable result
cards, and both price-lock modals into fa/en/ar, extracted from
`design-reference-v2/نتایج پرواز.dc.html` and `site-data.js`'s `arDeep`
dictionary where available. Real cabin prices and price-lock amounts (raw
IRR from the API) now render via a new `localeMoney(amountRial, locale)`
helper in `frontend/src/lib/fa-format.ts` — same rial→toman division as
`faMoney`, but locale-aware digit/separator output. Server-provided error
messages (e.g. a 409 "already locked" response) are still passed through
verbatim, never routed through the page dictionary. Layout stacks to a
single column (filters above results) on mobile via the shared
`useIsMobile()` hook. See `docs/features/results-page-i18n-responsive.md`.

## Phase 44 — مقاصد (Destinations) real i18n + responsive body content

Frontend-only, no new/changed endpoints. Fourth page translated. Skipped
تکمیل خرید this round — the real `CheckoutPage.tsx` functionally overlaps
with پرداخت, which the user explicitly excluded from this refresh pending
a corrected upload, so مقاصد (unambiguously in scope) was picked instead.
`DestinationsPage` translates its hero/search box, region tabs,
destination mosaic (badges, duration, weekly frequency, price), empty
state, map band (stats, city pins), and popular-routes band into
fa/en/ar — extracted from `design-reference-v2/مقاصد.dc.html`'s own
`isEN`/`isAR` ternaries (this page's mock has by far the most complete
three-way translation coverage of any page seen so far) and `site-data.js`'s
`arDeep` dictionary for the rest. Mock catalog/route/pin data restructured
from Persian-only pre-formatted strings to locale-neutral shape (per-locale
name objects + a plain numeric toman price), so the search filter also now
matches against the active locale's city name rather than always Persian.
Destination mosaic and map band collapse to a narrower layout on mobile via
the shared `useIsMobile()` hook. See
`docs/features/destinations-page-i18n-responsive.md`.

## Phase 45 — باشگاه مشتریان (Club) real i18n + responsive body content

Frontend-only, no new/changed endpoints. Fifth page translated.
`PublicClubPage` translates its hero, stats strip, three membership
tiers, four card-issuance steps, four earn-points cards, three
member-services cards, and the logged-in member banner into fa/en/ar —
extracted from `design-reference-v2/باشگاه مشتریان.dc.html`'s own `isEN`
ternaries and `site-data.js`'s `arDeep` dictionary, which had unusually
complete coverage for this page (tier perks, card steps, earn/services
cards all matched exactly). Fixed a real cross-test-file mock-leak bug in
`PublicInfoPages.test.tsx`: a prior phase's `mockLocale('ar')` spy on
`useLocale()` wasn't restored between tests, so it leaked from the last
`DestinationsPage` test into every subsequent test in the shared file —
fixed with `vi.restoreAllMocks()` in the shared `beforeEach`. Stats
strip/card-steps/earn/services grids collapse on mobile via the shared
`useIsMobile()` hook. See `docs/features/club-page-i18n-responsive.md`.

## Phase 46 — پشتیبانی (Support) real i18n + responsive body content

Frontend-only, no new/changed endpoints. Sixth page translated.
`SupportPage` translates its hero, four category cards, all five FAQ
question/answers, the ticket form, and the three direct-contact cards
into fa/en/ar — extracted from `design-reference-v2/پشتیبانی.dc.html`'s
own `isEN` ternaries (whose fa strings matched the shipped app's content
exactly) and `site-data.js`'s `arDeep` dictionary, which had complete
coverage for this page. The ticket `subject` submitted to the real backend
always stays the canonical Persian string regardless of the active
display locale — only the dropdown's visible label translates via a
separate label map — since staff view tickets in the Persian-only admin
queue and introducing translated subject text into stored tickets would be
a real regression. FAQ search now matches the active locale's text.
Category-card grid and the FAQ/contact two-column layout collapse on
mobile via the shared `useIsMobile()` hook. See
`docs/features/support-page-i18n-responsive.md`.

## Phase 47 — قوانین و مقررات (Terms/Travel Info) real i18n + responsive body content

Frontend-only, no new/changed endpoints. Seventh page translated.
`TravelInfoPage` translates its hero, all six rule sections (title +
bullet items), and the refund-variance warning note into fa/en/ar. Unlike
every prior page, this one needed zero hand-translation:
`design-reference-v2/قوانین و مقررات.dc.html` defines complete `dataFA`/
`dataEN`/`dataAR` arrays for every section and bullet, and the fa content
matched the shipped app byte-for-byte. The TOC + section-body two-column
layout collapses to a single column on mobile via the shared
`useIsMobile()` hook. See `docs/features/travel-info-page-i18n-responsive.md`.

## Phase 48 — درباره ما (About) real i18n + responsive body content

Frontend-only, no new/changed endpoints. Eighth page translated.
`AboutPage` translates its hero, stats strip, mission/vision cards, and
the three values cards into fa/en/ar — extracted from `design-reference-v2/
درباره ما.dc.html`'s own `isEN` ternaries and `site-data.js`'s `arDeep`
dictionary, both complete for this page's fa content, so nothing needed
hand-translation. Stats strip, mission/vision cards, and values cards
collapse on mobile via the shared `useIsMobile()` hook. See
`docs/features/about-page-i18n-responsive.md`.

## Phase 49 — تماس با ما (Contact) real i18n + responsive body content

Frontend-only, no new/changed endpoints. Ninth page translated.
`ContactPage` translates its hero, four contact-channel cards, and the
message form into fa/en/ar. EN strings came from `design-reference-v2/
تماس با ما.dc.html`'s own `isEN` ternaries, complete and matching the
shipped app's fa content. Unlike most prior pages, this page's design
source has no `isAR` branch at all and `arDeep` only covers a couple of
generic words — every Arabic string here was hand-translated fresh, same
quality bar as every phase (no silent Persian fallback like the design
mock's own Arabic mode would produce). Channels + form two-column layout
collapses to a single column on mobile via the shared `useIsMobile()`
hook. See `docs/features/contact-page-i18n-responsive.md`.

## Phase 50 — ورود و ثبت‌نام (CustomerLoginPage) real i18n + responsive strings

Frontend-only, no new/changed endpoints. Tenth page translated.
`CustomerLoginPage` translates its login/signup tabs, user/agency toggle,
subtitles, phone/password/OTP fields, resend-code countdown, agency-signup
fields, and every error message into fa/en/ar. Unlike every prior page,
`design-reference-v2/ورود و ثبتنام.dc.html` has a structurally different
field layout from the real app (email+password-first with Google sign-in
and a 5-digit OTP in the design, vs. the real app's phone+OTP-first
6-digit flow with no Google sign-in) — so most strings were hand-translated
to match the real app's actual fields, while concepts that do line up
1:1 (tab labels, the agency-activation note, the resend label) reused the
design bundle's own `isEN`/`arDeep` wording. Also fixes a test mock-leak
bug: `PublicMockPages.test.tsx` bundles `CustomerLoginPage`/`AboutPage`/
`NotFoundPage` in one file, and the new `mockLocale('ar')` test's
unrestored `useLocale` spy was leaking into the next describe block's
fa-only `AboutPage` test. Fixed with a targeted `afterEach` that restores
only the `useLocale` spy (not the OTP mocks, which are plain `vi.fn()`s
that would break under a blind `vi.restoreAllMocks()`). See
`docs/features/customer-login-page-i18n-responsive.md`.

## Phase 51 — فراموشی رمز: real email password-reset path + i18n

Unlike Phases 42–50, this page needed real new backend work, not just
translation — flagged earlier in `PLAN.md` as tangled with a decision to
support a REAL email+code reset path alongside the existing phone+SMS OTP
one, since a customer's account may only have a verified email (Phase 17)
reachable at reset time. Offered in **every** locale, not gated to en/ar —
restricting a security recovery method by the page's display language
would be an arbitrary, fragile restriction unrelated to which identifier
the account actually has verified.

### `backend/src/modules/auth/` (additions)

| Method | Path                                                | Auth                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | --------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/password-reset/email/request`                | public, `@Throttle` 5/min | `{ email }` (`@IsEmail`) → looks up a `USER`-role account with that **exact, verified** email (`emailVerifiedAt IS NOT NULL`); 401 `NOT_FOUND` if none matches, 403 `ACCOUNT_SUSPENDED` if inactive. Deliberately does **not** upsert/create an account the way `requestOtp` does for phone — inventing an account for an arbitrary submitted email would let anyone probe or claim an address that isn't theirs. Issues a `TwoFactorChallenge(purpose: PASSWORD_RESET_EMAIL)` and delivers the code via the existing `TwoFactorProvider.sendCode` (same interface Phase 17's email verification already uses with `phone: null`). |
| POST   | `/auth/password-reset/email/verify`                 | public, `@Throttle` 5/min | `{ challengeId, code }` → same challenge/attempts/expiry rules as `otp/verify`, scoped to `PASSWORD_RESET_EMAIL` only (a `CUSTOMER_OTP_LOGIN` or `EMAIL_VERIFY` challenge id is rejected here, and vice versa). On success, logs the customer in exactly like `otp/verify` does, so the frontend immediately calls the existing `POST /auth/set-password` (no current-password check) — same handoff Phase 21 established for the phone path.                                                                                                                                                                                      |
| GET    | `/auth/_test/last-password-reset-email-code/:email` | E2E only                  | Non-production escape hatch mirroring `_test/last-otp/:phone`; 404s in production.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Frontend

`ForgotPasswordPage.tsx` gains a phone/email identifier toggle at its
first step (`fp-method-phone`/`fp-method-email` test ids) and a full
fa/en/ar `STR` dictionary; every byte-critical fa string the existing
tests assert (`'رمز عبور باید حداقل ۸ کاراکتر باشد.'`,
`'تکرار رمز با رمز جدید یکسان نیست.'`, the `'ورود به حساب'` link) stays
unchanged. `useAuth()` gains optional `requestPasswordResetEmail`/
`verifyPasswordResetEmail`, mirroring `requestOtp`/`verifyOtp`. All 5
pre-existing tests pass unmodified; 3 new tests (email happy path, en, ar).
See `docs/features/forgot-password-email-reset-i18n.md`.

## Phase 52 — پنل کاربر (AccountPage) real i18n

Frontend-only, no new/changed endpoints — every tab already reads from
real endpoints added in earlier phases (bookings, wallet, club points,
price locks, refunds, profile, privacy export/delete). Twelfth page
translated, and the largest so far: 7 tabs. EN strings extracted from
`design-reference-v2/پنل کاربر.dc.html`'s own `isEN` ternaries (rich
coverage); AR mixes the design's own partial `isAR` coverage with fresh
hand-translation. The «قفل قیمت» (price lock) tab has no design
counterpart at all — a real feature unique to this app — so its strings
are hand-translated to match the actual implementation. Status badge maps
(`STATUS_LABEL`, `REFUND_STATUS_LABEL`, `LOCK_STATUS_LABEL`) and
`TIER_LABEL`/`CABIN_LABEL` were restructured from flat fa strings to
`Record<StoredLocale, string>`; the toman currency word stays
`'تومان'`/`'Toman'`/`'تومان'` in every locale (Arabic keeps the
transliterated word), consistent with the pricing-honesty rule from
earlier phases (real toman amounts, never a fake currency). All 12
pre-existing tests pass unmodified; 2 new tests (en, ar). See
`docs/features/account-page-i18n-responsive.md`.

## Phase 53 — پنل آژانس: shared shell + login/signup real i18n (foundation)

Frontend-only, no new/changed endpoints. First agency-portal phase of the
arc — a shared-shell foundation like Phase 41, covering
`AgencyPortalShell.tsx` (sidebar nav + sign-out), `AgencyLoginLayout.tsx`
(the B2B-partner login shell), and `AgencyLoginPage.tsx` (login form,
signup form, OTP step, done state). Unlike every prior phase, **no
design-mock counterpart exists for the login/signup screen** —
`design-reference-v2/پنل آژانس.dc.html`'s `isEN`/`isAR` ternaries only
cover the post-login dashboard content, since the design never specified
an agency login mechanism (per the ⚑ product decision already recorded
above in this file's Agency Portal section). The shell's nav labels reuse
the design's own `navMeta` EN wording where the concept lines up 1:1; AR
there and everything in the login/signup screen is hand-translated,
reusing `CustomerLoginPage.tsx`'s exact wording for the concepts that
overlap (license number, manager name, terms checkbox). All 3 pre-existing
tests pass unmodified; 2 new tests (en, ar). See
`docs/features/agency-portal-shell-login-i18n.md`.

## Phase 54 — پنل آژانس: Dashboard tab real i18n

Frontend-only, no new/changed endpoints — `AgencyDashboardPage.tsx`
already reads real data from `GET /agency-portal/dashboard` (Phase 9).
Second agency-portal page of the arc. Most strings are hand-translated
(no usable match in the design bundle's `isEN`/`isAR` ternaries for this
page's specific KPI/credit copy); the sales chart's Jalali month labels
reuse `design-reference-v2/وضعیت پرواز.dc.html`'s own established
romanized EN names (`Farvardin`, `Ordibehesht`, ...) and its AR names,
which are identical to the Persian names verbatim — there is no separate
Arabic name for a Jalali month, same reasoning as "تومان" staying
unchanged in Arabic elsewhere. The pre-existing test passes unmodified; 2
new tests (en, ar). See `docs/features/agency-dashboard-page-i18n.md`.

## Phase 55 — پنل آژانس: Credit & Balance tab real i18n

Frontend-only, no new/changed endpoints. Third agency-portal page.
`AgencyCreditPage.tsx` translates its credit KPIs, invoices table,
credit-increase request list, ledger, and credit-increase request modal
into fa/en/ar. EN strings mostly extracted from
`design-reference-v2/پنل آژانس.dc.html`'s own rich `isEN` vocabulary for
this exact tab (`creditBalanceTitle`, `creditLimitLabel`,
`payFromCreditLabel`, `recentActivityTitle`, etc.); AR mixes the design's
partial coverage with hand-translation. This page keeps its own local
invoice/credit-request status label maps rather than translating the
shared `frontend/src/features/agencies/agency-labels.ts` module, which
the staff-side `AgencyDetailPage.tsx` depends on and which stays
Persian-only (staff panels aren't locale-switchable per CLAUDE.md). Both
pre-existing tests pass unmodified; 2 new tests (en, ar). See
`docs/features/agency-credit-page-i18n.md`.

## Phase 56 — پنل آژانس: Sales & Reports tab real i18n

Frontend-only, no new/changed endpoints — `AgencySalesPage.tsx` already
reads real data from `GET /agency-portal/sales` (Phase 9). Fourth
agency-portal page. Heading and KPI labels reuse
`design-reference-v2/پنل آژانس.dc.html`'s own `isEN` vocabulary for this
exact tab (`reportKpis`'s KPI labels, the "Sales per flight" section
label); AR is hand-translated. The issued-tickets table's booking-status
labels are this page's own local map, kept separate from
`AccountPage.tsx`'s `STATUS_LABEL` since the two use different (compact
vs. verbose) fa wording for the same statuses. The pre-existing test
passes unmodified; 2 new tests (en, ar). See
`docs/features/agency-sales-page-i18n.md`.

## Phase 57 — پنل آژانس: Inbox & Messages tab real i18n

Frontend-only, no new/changed endpoints — `AgencyInboxPage.tsx` already
reads/writes real data via the `agency-portal` inbox endpoints. Fifth
agency-portal page. Most strings reuse
`design-reference-v2/پنل آژانس.dc.html`'s own `isEN` vocabulary for this
exact tab (`inboxTitle`, `replyPlaceholder`, `sendReplyLabel`,
`noMessagesLabel`); AR is hand-translated. The pre-existing test passes
unmodified; 2 new tests (en, ar). See
`docs/features/agency-inbox-page-i18n.md`.

## Phase 58 — پنل آژانس: Profile & Documents tab real i18n

Frontend-only, no new/changed endpoints. Sixth agency-portal page.
`AgencyProfilePage.tsx` translates its agency-info fields,
document-upload form, and submitted-documents list into fa/en/ar. Field
labels and document-status wording match
`design-reference-v2/پنل آژانس.dc.html`'s own `isEN` `profileFields`/
`documents` sample data for this exact tab; AR is hand-translated. Keeps
its own local tier/document-type/status label maps rather than
translating the shared `agency-labels.ts` module (same reasoning as
Phase 55). The pre-existing test passes unmodified; 2 new tests (en, ar).
See `docs/features/agency-profile-page-i18n.md`.

## Phase 59 — پنل آژانس: Allocated Seats tab real i18n

Frontend-only, no new/changed endpoints. Seventh agency-portal page.
`AgencySeatsPage.tsx` translates its info banner, per-flight allotment
cards (Allocated/Sold/Remaining labels, Active/Released badge), and empty
state into fa/en/ar. The info banner and metric labels match
`design-reference-v2/پنل آژانس.dc.html`'s own `isEN` `seatsInfoBanner`/
`allocatedLabel`/`soldLabel`/`remainingLabel` vocabulary for this exact
tab; AR is hand-translated. This page had no test file before this phase;
`AgencySeatsPage.test.tsx` was created from scratch with 4 tests (fa
happy-path, fa empty state, en, ar). See
`docs/features/agency-seats-page-i18n.md`.

## Phase 60 — پنل آژانس: Web Service (B2B API) tab real i18n

Frontend-only, no new/changed endpoints. Eighth and final agency-portal
page, completing the agency-portal i18n arc (Phases 53–60).
`AgencyWebservicePage.tsx` translates the webservice purchase flow (info
banner, scope/duration selection, pending/rejected states, active-
connection summary) into fa/en/ar. Several labels match
`design-reference-v2/پنل آژانس.dc.html`'s own `isEN` vocabulary for this
exact tab (`wsInfoBanner`, `wsPendingTitle`, `wsPendingBadge`,
`wsNewPurchaseTitle`, `wsNewPurchaseSub`, `wsTypeLabel`,
`wsDurationLabel`, `wsPayableLabel`, `wsSubmitLabel`, `wsActiveTitle`,
`wsActiveBadge`, `wsBaseUrlLabel2`); the real scope names, 1/3/12-month
plans, and correspondence-based key delivery wording have no design
counterpart and are hand-translated, as is all AR text. All 4
pre-existing tests pass unmodified; 2 new tests (en, ar). See
`docs/features/agency-webservice-page-i18n.md`.

## Phase 61 — صفحه 404 real i18n

Frontend-only, no new/changed endpoints. First page of the post-agency-
portal i18n continuation — a small, standalone static page unrelated to
the excluded checkout/payment flow. `NotFoundPage.tsx` translates its
heading, body copy, both links, and error-code footer into fa/en/ar; the
wrapping `dir` attribute is now locale-aware. `design-reference/صفحه
404.dc.html` has no `isEN`/`isAR` sample data at all, so all EN/AR text
is hand-translated. This page had no test file before this phase;
`NotFoundPage.test.tsx` was created from scratch with 3 tests (fa, en,
ar). See `docs/features/not-found-page-i18n.md`.

## Phase 62 — صفحه تعمیر و نگهداری real i18n

Frontend-only, no new/changed endpoints. Another small, standalone
static page (served manually during planned downtime), unrelated to the
excluded checkout/payment flow. `MaintenancePage.tsx` translates its
badge, heading, body copy, ETA notice, and support-contact footer into
fa/en/ar; the wrapping `dir` attribute is now locale-aware.
`design-reference/در حال تعمیر و نگهداری.dc.html` has no `isEN`/`isAR`
sample data, so all EN/AR text is hand-translated. The support phone
number keeps its Persian-digit literal in every locale, matching the
convention from `SupportPage.tsx` (Phase 46). This page had no test file
before this phase; `MaintenancePage.test.tsx` was created from scratch
with 3 tests (fa, en, ar). See `docs/features/maintenance-page-i18n.md`.

## Phase 63 — وضعیت پرواز real i18n

Frontend-only, no new/changed endpoints. `FlightStatusPage.tsx` (real
flight-status lookup, Phase 22) translates its hero title/subtitle, mode
toggle, field labels, result card, and status pill into fa/en/ar. Most
labels reuse `design-reference-v2/وضعیت پرواز.dc.html`'s own
`isEN`/`isAR` vocabulary for this exact page; origin/destination labels
reuse the `lblOrigin`/`lblDestination` convention from
`HomeSearchPage.tsx` (Phase 42), as does the `CITY_NAMES` airport-name
map. The status pill required a `Record<string, Tr>` keyed by the exact
fa string the backend returns (not a 3-way status-enum map), since the
backend's `DEPARTED` status covers two distinct fa strings
("فرود آمد"/"در حال پرواز") depending on arrival time — the fa string
itself is the identity fallback so fa output stays byte-identical. All 5
pre-existing tests pass unmodified; 2 new tests (en, ar). See
`docs/features/flight-status-page-i18n.md`.

## Phase 64 — مدیریت رزرو real i18n

Frontend-only, no new/changed endpoints. `ManageBookingPage.tsx` (real
anonymous PNR + last-name self-service, Phase 19) translates its lookup
form, booking-detail card, refund modal, and refund-done summary into
fa/en/ar. Most labels reuse
`design-reference-v2/مدیریت رزرو.dc.html`'s own `isEN` vocabulary for
this exact page; that design file has no Arabic sample data at all, so
all AR text is hand-translated. The cabin label reuses the `CABIN_LABEL`
map convention from `ResultsPage.tsx` (Phase 43). The raw
`booking.status` enum value is still displayed verbatim in every locale
(pre-existing gap, unrelated to i18n scope). All 4 pre-existing tests
pass unmodified; 2 new tests (en, ar). See
`docs/features/manage-booking-page-i18n.md`.

## Phase 65 — قوانین باشگاه مشتریان (Club Tier Rules)

Found during the earlier design-bundle audit: `design-reference-v2/پنل
مدیر بازرگانی.dc.html` has a `clubrules` tab
("تعیین حد نصاب امتیاز برای هر سطح عضویت باشگاه مشتریان — برای همه اعضا
یکسان اعمال می‌شود"). The CEO design sidebar (`پنل مدیر عامل.dc.html`)
has no `clubrules` entry — so this tab/API is COMMERCIAL_MANAGER only.

Today `ClubMember.level` (SILVER/GOLD/PLATINUM) is set once at creation
and only ever changed by an explicit `PATCH /club/members/:id/level`
staff action (Phase 5) — there is no threshold anywhere in the codebase
that ties a member's accumulated `points` to their tier. The frontend's
GOLD/PLATINUM point ranges shown as marketing copy on `PublicClubPage.tsx`
and `HomeSearchPage.tsx` (`5,000–15,000` / `above 15,000`) are hardcoded
display strings with no backend enforcement behind them at all.

This phase makes that real: a manager-editable threshold config,
consumed by `ClubPointsService.syncCache` (booking-engine) so a member's
tier is recomputed from these exact thresholds every time their points
balance changes (a real purchase earning points, or a redemption) — not
just a passive settings screen.

### New: `GET /club/tier-rules`, `PATCH /club/tier-rules`

- Roles: `COMMERCIAL_MANAGER` only (see access-list note above).
- `GET` returns the single `ClubTierRule` row (seeded once via
  `prisma/seed.ts`, lazily created on first read if somehow absent):
  `{ goldMinPoints, platinumMinPoints, cardRequestMinPoints, updatedAt,
updatedByLabelFa }`.
- `PATCH` body: `{ goldMinPoints, platinumMinPoints, cardRequestMinPoints }`
  (all non-negative integers). Validation, matching the design's implicit
  ordering constraint (`crGoldMin` must leave room below `crPlatMin`):
  `0 <= goldMinPoints < platinumMinPoints`. `cardRequestMinPoints` has no
  ordering constraint relative to the tier thresholds (the design shows
  it as an independent field) — just `>= 0`.
- On save: updates the singleton row, records an audit-log entry
  (category `CLUB`, action `'تغییر قوانین باشگاه مشتریان'`, detail names
  the actor + before/after values), matching `ClubService`'s existing
  audit pattern (`updateLevel`, `issueCardDirect`).
- `SILVER`'s threshold is always `0` and is never stored or editable —
  matching the design's own disabled, hardcoded `"۰"` input for that
  field.
- The response also includes a computed `preview` array (3 rows:
  `{ tier, minPoints, maxPoints | null }`) so the frontend doesn't have
  to duplicate the range-computation logic — mirrors the design's own
  read-only "پیش‌نمایش سطوح" (tier preview) table.

### `ClubPointsService.syncCache` — real tier auto-recompute

- After writing the new `points` cache value (unchanged from today), it
  now also loads the current `ClubTierRule` row and sets
  `ClubMember.level` to the highest tier whose `minPoints <= points`
  (`PLATINUM` > `GOLD` > `SILVER`, `SILVER` always the floor). This runs
  inside the same Prisma transaction as the points-ledger write, so tier
  and points always change atomically.
- This only affects members going forward (a rules save does **not**
  retroactively recompute every existing member's tier — the design's
  own clubrules screen has no bulk-recompute action, so this stays
  scoped to what's actually designed: the config is applied the next
  time each member's points change).
- `cardRequestMinPoints` is stored and returned by `GET`/`PATCH`, and is
  now consumed by `GET /my/club/membership` + `POST /my/club/card-request`
  (member-initiated card-request flow in the user panel). Staff-side
  referral of SUBMITTED requests (site-admin track) remains a separate gap.

See `docs/features/club-tier-rules.md` for the acceptance checklist.
New frontend page `ClubTierRulesPage.tsx` (route `clubrules`, CEO +
COMMERCIAL_MANAGER only) renders the threshold form and the read-only
tier-preview table. Backend: 13 new/extended e2e tests in
`club.e2e-spec.ts` (GET/PATCH access control, validation, audit log, and
a real points-credit that recomputes `ClubMember.level` end-to-end) + an
8-case unit spec (`club-tier.spec.ts`) for `resolveTierForPoints`'s
boundary logic. Frontend: 4 new Vitest/RTL tests
(`ClubTierRulesPage.test.tsx`) covering rendering, client-side
validation, a real save, and a real server-error message. No new
Playwright E2E script this phase — consistent with this session's recent
phase cadence (Phases 51–64), which relies on the real-DB Jest e2e suite
plus Vitest/RTL rather than a dedicated Playwright script per small
feature.

## Phase 66 — نظرسنجی مسافران (Passenger Satisfaction Survey)

Found across three design files: `پنل مدیر IT.dc.html` (a `survey` tab
that **creates/configures** the survey — enable toggle, question list
CRUD, a stats card, a recent-responses feed) and `پنل مدیر عامل.dc.html`
/ `پنل مدیر ارشد.dc.html` / `پنل رئیس هیئت مدیره.dc.html` (each has its
own read-only `survey` tab: one row per flight with response count +
average rating, and a "تحلیل با هوش مصنوعی" button that summarizes that
flight's comments). The IT file's own subtitle for the tab states the
split explicitly: _"ایجاد و پیکربندی نظرسنجی رضایت پس از پرواز — نتایج
نزد مدیران ارشد"_. Confirmed via each file's own `roleDefs.access`
array: `survey` appears for `ceo`, `senior`, and `super` (`super` is
`BOARD_CHAIR`'s own role key inside `پنل رئیس هیئت مدیره.dc.html`) —
i.e. `CEO`, `SENIOR_MANAGER`, `BOARD_CHAIR` — and separately for the IT
manager's own file. No other role's design file mentions a `survey` tab.

### Scope decisions (read before reviewing the schema)

- **SMS-only delivery.** The design's own copy says "پیامک/ایمیل" in
  passing, but `Passenger` has no email field anywhere in the schema
  (only `mobileEnc`) and no signal anywhere else in the codebase ever
  collects passenger email. Rather than invent an email field/flow this
  feature doesn't need, survey invites are SMS-only — an explicit,
  documented scope decision, not a silent drop.
- **One overall rating + one comment per response, not per-question
  scoring.** The IT-configurable question list (5 default items) is
  real, but the design's own aggregation logic
  (`site-data.js`'s `getSurveyFlights()`) and its `surveyResponses` shape
  (`{ id, flightNo, route, airline, date, rating, comment }`) only ever
  track a single `rating` (1–5) and a single free-text `comment` — the
  configured questions function as on-screen writing prompts for the
  passenger, not as separately-scored dimensions. The schema matches
  what the design actually implements, not an invented per-question
  rating table.
- **Lazy materialization, no cron — implemented via the survey module's
  own reads, not the three originally-drafted call sites.** This
  codebase has zero scheduler infrastructure by design (see
  `flight-lifecycle.util.ts`'s own comments) — every `SCHEDULED →
DEPARTED` and `TICKETED → FLOWN` transition is computed on-read. The
  draft above proposed hooking into `materializeFlownBookings`'s three
  existing call sites (`reporting.service.ts`, `flightops.service.ts`,
  `flights.service.ts`); the actual implementation instead adds a new
  `materializeSurveyInvites(prisma, sms)` (in
  `backend/src/modules/survey/survey-lifecycle.util.ts`) that itself
  calls `materializeFlownBookings` first, then creates a `SurveyInvite`
  - sends the SMS for every `FLOWN` booking that doesn't have one yet
    (skipped entirely while `SurveySettings.enabled` is false). This is
    called from `SurveyService.getStats()` and `SurveyService.getResults()`
    — the IT-manager stats screen and the exec results screen, i.e. the
    two places this data is actually read — rather than reaching into
    three unrelated existing services and adding a new `SmsModule`
    dependency to each. Same lazy, no-cron principle; simpler blast
    radius. A booking with no contact phone still gets its `SurveyInvite`
    row (so the token exists), it just never receives the SMS
    (`SmsInvite.smsSentAt` stays null) — `SmsService.send` already handles
    a null phone gracefully (logs a `FAILED` `SmsLog` row, never throws).
- **New AI provider, not ml-service.** CLAUDE.md's "ML Service Rules"
  scopes the FastAPI `ml-service` to exactly two endpoints
  (`price-suggestion`, `recommendations`) — "nothing else lives here."
  Free-text comment summarization doesn't fit either, so this phase adds
  a second, separate `AiProvider` (`SurveySummaryProvider`) under
  `backend/src/modules/ai/`, following the same interface/graceful-
  degradation pattern as `PriceSuggestionProvider` but calling the
  Anthropic Messages API directly — matching the design's own literal
  `window.claude.complete(prompt)` call. Gated by an `ANTHROPIC_API_KEY`
  env var; returns `null` (never throws) when the key is absent, the
  call times out, or the vendor errors — callers show "خلاصه‌ای از
  نظرات این پرواز در دسترس نیست." exactly like the design's own fallback
  string.
- **Real AI usage logging (closes a pre-existing gap).** CLAUDE.md
  requires "usage logging (user, tokens, cost) to the database" on every
  AI endpoint; the existing Phase 6 pricing-AI feature never actually
  implemented this (no such table exists anywhere). That gap is
  pre-existing and out of scope to retrofit here, but this new endpoint
  gets it done properly: a new `AiUsageLog` row is written after every
  real Anthropic call, using the **real** `usage.input_tokens` /
  `usage.output_tokens` the Anthropic API returns in its response (not
  an estimate), plus the acting user id and a timestamp. Cost is left
  `null` (no pricing-per-token table exists to compute it from, and
  inventing one is out of scope) — logged as a documented gap rather
  than a fabricated number.

### New: `SmsMessageType` value `'SURVEY_INVITE'`

Same extension point already used for `'OTP'`/`'TEMP_PASSWORD'` — the
SMS body is a short Persian message containing the survey link
(`{FRONTEND_URL}/survey/{token}`). New env var `FRONTEND_URL` (falls
back to `http://localhost:5173` in dev if unset) — no existing var in
`.env.example` served this purpose; needed to build a link inside an SMS
body rather than just delivering a code, unlike existing OTP messages.
Unlike the draft's assumption, `SmsMessageType` **is** also a Prisma
enum (`SmsLog.messageType`), not just the TS union in
`sms-provider.interface.ts` — both were extended with `SURVEY_INVITE` in
the same migration that added the new tables.

### New (IT_MANAGER only): `GET /survey/settings`, `PATCH /survey/settings`

### New (IT_MANAGER only): `GET/POST/DELETE /survey/questions`, `/survey/questions/:id`

- Roles: `IT_MANAGER` only (matches the design's own tab — no other role
  can configure the survey).
- `GET /survey/settings` → `{ enabled, title, updatedAt, updatedByLabelFa }`.
- `PATCH /survey/settings` body: `{ enabled?, title? }` — either field
  optional, matching the design's separate toggle vs. title-is-fixed-copy
  behavior (title isn't actually editable in the design's own markup,
  but the DTO allows it since the settings row already carries the
  field — kept simple rather than special-casing one column read-only).
- `GET /survey/questions` → ordered list `{ id, label, order }[]`.
- `POST /survey/questions` body `{ label }` → appends with the next
  `order`.
- `DELETE /survey/questions/:id` → removes it (matches the design's
  per-row remove button; no edit-in-place action exists in the design).
- `GET /survey/stats` → `{ flightsWithSurvey, totalResponses, avgRating,
recentResponses: { id, flightNo, route, rating, comment, at }[] }`
  (latest 8, matches the design's `.slice(0, 8)`), IT_MANAGER only —
  mirrors the design's `surveyStats` box + recent-responses feed.

### New (public, no auth): `GET /survey/:token`, `POST /survey/:token`

- `GET` resolves a `SurveyInvite` by its opaque `token`; 404 if unknown,
  409 (`SURVEY_ALREADY_SUBMITTED`) if a `SurveyResponse` already exists
  for it, 409 (`SURVEY_DISABLED`) if `SurveySettings.enabled` is false
  (two new `ErrorCode` values, `common/errors.ts`). On success, returns
  the active question list (labels only, for display as writing
  prompts) plus minimal flight context (`flightNo`, `originCityFa`,
  `destCityFa`, `departureAt`) — no PII, no booking/passenger detail
  beyond what's needed to show "پرواز فلان به فلان".
- `POST` body: `{ rating: 1-5, comment?: string (max length enforced) }`.
  Creates the `SurveyResponse`, sets `SurveyInvite.respondedAt`.
  Idempotent on the token: a second `POST` to an already-answered invite
  409s rather than creating a duplicate response.
- No auth: the token itself is the credential (same posture as
  `مدیریت رزرو`'s PNR+passenger-id lookup) — tokens are opaque UUIDs,
  unguessable, single-use once answered.
- Rate-limited per-IP (same posture as other public/anonymous endpoints
  per CLAUDE.md's Security Rules).

### New (CEO / SENIOR_MANAGER / BOARD_CHAIR, read-only): `GET /survey/results`, `POST /survey/results/:flightInstanceId/analyze`

- Roles: `CEO`, `SENIOR_MANAGER`, `BOARD_CHAIR` only — read-only, no
  config access (matches the design: these three panels render the
  results table but never call anything resembling
  `saveSurveySettings`).
- `GET /survey/results` → one row per **flight instance** (not per
  recurring `flightNo` — two different calendar-date departures of the
  same `flightNo` must never be merged into one row, unlike a literal
  reading of the design's own `getSurveyFlights()`, which only ever
  groups its flat demo data by `flightNo`) that has at least one
  response: `{ flightInstanceId, flightNo, originCityFa, destCityFa,
departureAt, count, avgRating }` — count/avgRating computed by a real
  SQL `GROUP BY` (`$queryRaw`, corrected during the post-merge senior
  review from an earlier version that loaded every response row and
  grouped it in a JS `Map`), never in the browser, per CLAUDE.md's
  reporting rule. No `airline` field: this is a
  single-tenant system (`Flight` has no airline column at all) — the
  design's demo data shows several airlines purely as illustrative mock
  content, not a real multi-airline concept. If `SurveySettings.enabled`
  is false, returns `{ disabled: true, flights: [] }` so the frontend
  shows the design's own "نظرسنجی پس از پرواز توسط مدیر IT غیرفعال
  است." banner instead of an empty-state.
- `POST /survey/results/:flightInstanceId/analyze` → calls
  `SurveySummaryProvider.summarize(comments)` with that flight
  instance's non-empty comments, using the design's own `analyzeSurvey()`
  prompt (two-sentence Persian summary for senior managers) **plus an
  explicit prompt-injection guard added during a post-merge senior
  review** — the comment list is framed as untrusted passenger data the
  model must never treat as instructions, since it's attacker-
  controlled free text concatenated straight into the prompt (see
  `docs/features/passenger-survey.md`'s "Post-merge senior review"
  section for the full list of review findings and fixes). Returns
  `{ summary }` — `summary` is always a string
  (the provider's `null` on failure is mapped to the same fallback
  string the design itself uses client-side,
  `"خلاصه‌ای از نظرات این پرواز در دسترس نیست."`, computed server-side
  this time instead of client-side, and no `AiUsageLog` row is written
  for a fallback). Writes one `AiUsageLog` row per successful call, with
  the **real** `input_tokens`/`output_tokens` from the Anthropic
  response. Per CLAUDE.md's AI rules: rate limited (the app's global
  `ThrottlerGuard`, same posture the existing Phase 6 pricing-AI
  endpoint relies on — no extra per-endpoint throttle was added, for
  consistency), input size capped (comments truncated to 30 before being
  sent), the returned summary is treated as untrusted display text on
  the frontend (rendered as plain text, never as HTML/markdown), and it
  can never itself change any booking, price, or survey data —
  advisory-only, same posture as the existing pricing AI.

See `docs/DB_SCHEMA.md`'s Phase 66 section for the new `SurveySettings` /
`SurveyQuestion` / `SurveyInvite` / `SurveyResponse` / `AiUsageLog`
models, and `docs/features/passenger-survey.md` for the acceptance
checklist (all items checked off with their proving test names).
Frontend: new public `SurveyPage.tsx` (route `/survey/:token`,
**fa-only** — unlike the retrofitted public pages from the i18n arc
(Phases 41–64), this is a brand-new page with no exported design file to
extract en/ar vocabulary from; a documented, bounded scope decision, not
a silent gap), a new `SurveyRouter.tsx` behind the `survey` tab key that
renders `SurveyConfigPage.tsx` for `IT_MANAGER` and `SurveyResultsPage.tsx`
for `CEO`/`SENIOR_MANAGER`/`BOARD_CHAIR` (same role-branching pattern as
the existing `LogsRouter.tsx`/`SecurityRouter.tsx`). Backend: 12 new e2e
tests (`survey.e2e-spec.ts`) covering every endpoint above, plus a 5-case
unit spec for `SurveySummaryProvider` (missing key, empty comments, non-2xx
status, network failure, real success path — all via a mocked
`global.fetch`, closing the same "AI provider has no unit test" gap the
existing Phase 6 `MlPriceSuggestionProvider` still has). Frontend: 10 new
Vitest/RTL tests across the three new pages. No new Playwright E2E script
this phase — same cadence as Phases 51–65.

## Phase 67 — فرصت‌های شغلی (Careers)

**Correction (post-implementation):** an earlier draft of this section
claimed two dedicated public design files existed for the careers
listing/application pages. Re-verified directly against
`design-reference/` before finishing this phase: **no such files exist
in the bundle.** The only real design source is a small "فرصت‌های شغلی"
card grid inside `پنل ادمین سایت.dc.html` (job title/dept/city + type
badge + "ویرایش" link, alongside the same panel's image-library section)
— posting create/edit only, no delete, matching the design's own
`onEdit` action. The design has **no application-review UI at all**
(confirmed via grep for "متقاضی"/"رزومه" across every panel file — zero
matches for job applicants). The public listing page, the public
application form, and the entire SITE_ADMIN application-review flow
(list/detail/refer/hire/reject) below were therefore built by extension
— not lifted from a design file — using this codebase's existing visual
language (same components/colors/RTL/Jalali conventions as every other
public page and admin review screen, e.g. `SupportTicketsPage.tsx`'s
list+detail+refer pattern) rather than inventing a new one. This was
presented to and approved by the user before implementation began.
Confirmed via grep across every other executive-panel design file: **no
other role's design mentions job postings or applications at all** —
this stays SITE_ADMIN-only.

### Scope decisions

- **Job-posting CRUD folds into one new `jobapps` SITE_ADMIN tab**,
  rather than waiting on the much larger, still-entirely-unbuilt
  "تنظیمات سامانه" content tab the design physically places the
  create/edit job modal inside (banner, blog, media, social links, app
  download links, support contact display, announcement bar — none of
  which have any backend anywhere in this codebase; Phase 18 explicitly
  deferred all of it, "blog/media ... left out entirely"). Job postings
  and job applications are a self-contained, fully-specified pair of
  concerns with no real dependency on those other content-settings
  widgets, so combining posting-management and application-review under
  one dedicated tab is the correct scope boundary — not a reason to
  build the entire unrelated settings tab, and not a reason to leave
  careers unbuilt until that tab exists.
- **Real resume upload/storage — closes a real gap in the mock.** The
  design's own application-form component lets the applicant pick a PDF
  file (`onFileChange` stores only `file.name` in local state for
  display) but its `addJobApplication(...)` call never actually includes
  the file at all — the mock's own resume upload is decorative and
  never persisted anywhere, not even in the browser mock's own
  in-memory store. Since resume upload is clearly the substantive point
  of a job-application form (not decorative like the design's banner/
  blog image slots), the real implementation stores the uploaded PDF for
  real and lets SITE_ADMIN download it from the application detail view.
- **Not reusing `FilesModule`/`StoredFile` for resumes.** That model's
  `ownerId` is a required FK to `User`; a job applicant is anonymous (no
  login anywhere in this flow, matching the design). Widening
  `StoredFile.ownerId` to nullable to accommodate this would touch the
  already-tested referrals/cartable/agency-document upload paths for a
  case they were never designed for. Instead, `JobApplication` gets its
  own small set of resume columns (`resumeFileName`, `resumeMimeType`,
  `resumeSizeBytes`, `resumePath`) and a minimal, self-contained
  disk-write helper — same on-disk storage mechanism, no shared-service
  risk. 3 MB PDF-only limit, matching the design's own stated copy
  ("حداکثر ۳ مگابایت") — stricter than `FilesService`'s general 5 MB
  cap, deliberately, since this is a public, unauthenticated upload
  surface.
- **`getJob(id) || getActiveJobs()[0]` fallback is NOT replicated.** The
  mock's own application-form component silently falls back to the
  first active job when the `?job=` query param is missing or invalid —
  meaning a stale/mistyped link would silently let someone apply to the
  wrong posting. The real `GET /careers/jobs/:id` 404s on an unknown or
  inactive job id instead; this is a correctness fix over a genuine
  mock bug, not an invented behavior.
- **Referral target list is computed, not hardcoded.** The design's own
  referral dropdown lists real `COMMERCIAL_MANAGER`/`FINANCE_MANAGER`
  staff by name plus two fixed labels, "مدیر ارشد" and "مدیر عامل" — both
  of which map cleanly onto this codebase's existing singleton
  `SENIOR_MANAGER`/`CEO` accounts (exactly one of each is ever seeded).
  So the real referral-target list is `User.findMany` scoped to
  `COMMERCIAL_MANAGER` + `FINANCE_MANAGER` (active) plus the singleton
  `CEO`/`SENIOR_MANAGER` users — a real, queryable set, not an invented
  free-text field. Referring an application is a display-only "who's
  handling this" label (matches the design exactly: no other panel's
  design file has any awareness of job applications, so there is no real
  access grant or notification tied to the referral — same posture as
  the already-shipped `ClubCardRequest.assignedTo` field).
- **No delete action.** The design's admin job cards only ever show
  "ویرایش" (edit) and an active/inactive toggle — never a delete button.
  `DELETE` is not implemented; deactivating a posting is the only
  removal path, matching the design 1:1.

### New: `CareersSettings` — `GET /careers/settings` (public), `PATCH /careers/settings` (SITE_ADMIN)

- Singleton (same pattern as `ClubTierRule`/`SurveySettings`):
  `{ enabled: boolean }`. Controls only whether the public footer shows
  the "فرصت‌های شغلی" link — matches the design exactly (the careers
  listing page itself has no "disabled" state at all; direct navigation
  always works regardless of this flag).
- `PATCH` writes an audit-log entry under a new `AuditCategory.CONTENT`
  value (mirrors the design's own `_logReport("content", ...)` calls).

### New (public, no auth): `GET /careers/jobs`, `GET /careers/jobs/:id`, `POST /careers/jobs/:id/apply`

- `GET /careers/jobs` → active postings only:
  `{ id, title, dept, city, type }[]` (`type` is one of `FULL_TIME` |
  `REMOTE` | `PART_TIME`, mapped to the design's `تمام‌وقت`/`دورکاری`/
  `پاره‌وقت` labels on the frontend, same convention as `CabinClass`).
- `GET /careers/jobs/:id` → full posting detail incl. `generalReqs`/
  `specialReqs` string arrays (parsed from the admin's newline-separated
  textarea, matching the design's own `.join("\n")`/split convention).
  404 for an unknown or inactive job id (see scope decision above).
- `POST /careers/jobs/:id/apply` — `multipart/form-data`: personal info
  (name, national ID, father's name, birth date — parsed from a Jalali
  string input to a real `DateTime` at the edge, same convention as
  every other date field in this codebase; birth province/city,
  residence province/address), `gender` (`FEMALE`|`MALE`), `marital`
  (`SINGLE`|`MARRIED`), `military` (`CONSCRIPT`|`EXEMPT`|`WAIVED` +
  optional `exemptionType` text), `phone`, `email`, `skills`,
  `otherLangs`, repeatable `eduEntries`/`workEntries`/`langEntries`
  (stored as `Json`, same pattern as `SupportTicket.history`/
  `ClubCardRequest.history` for this kind of flexible, never-deeply-
  queried structure), and a required PDF `resume` file (≤3 MB). Creates
  a `JobApplication` with `status: SUBMITTED`, snapshotting the job's
  current `title` (`jobTitleSnapshot`) so the applicant record still
  shows a real title even if the posting is later edited or deactivated
  — matches the design's own denormalized `a.jobTitle` field. Rate
  limited per-IP (same posture as `manage-booking`/`contact`).
  National ID is encrypted at rest (`nationalIdEnc` + `nationalIdHash`
  for the admin search box), same pattern as `Passenger`/`ClubMember`.

### New (SITE_ADMIN only): `GET/POST/PATCH /careers/postings`

- `GET /careers/postings` → all postings (active + inactive).
- `POST /careers/postings` body `{ title, dept, city, type,
generalReqs, specialReqs, description?, imageFileId? }` → creates,
  `active: true` by default. `imageFileId` from `POST /files`.
- `PATCH /careers/postings/:id` body: any subset of the create fields
  plus `active?` (the design's per-card "غیرفعال کردن آگهی"/"فعال کردن
  آگهی" toggle folds into this same endpoint rather than a separate
  route, since it's just one more editable field) and optional
  `description` / `imageFileId` (null clears image).
- `GET /careers/media/:fileId` (public) streams a posting cover image.
- Both write an audit-log entry (`AuditCategory.CONTENT`).

### New (SITE_ADMIN only): `GET /careers/applications`, `GET /careers/applications/:id`, `GET /careers/applications/:id/resume`, `PATCH /careers/applications/:id/refer`, `PATCH /careers/applications/:id/hire`, `PATCH /careers/applications/:id/reject`

- `GET /careers/applications` → list with `q` (matches design's search
  across name/national-id/phone/email) and `jobTitle` filters, each row:
  `{ id, name, jobTitle, nationalIdMasked, phone, email, at, status,
hasResume, eduCount, workCount, assigneeLabelFa }`.
- `GET /careers/applications/:id` → full detail incl. decrypted-for-
  display fields, `eduEntries`/`workEntries`/`langEntries`,
  `history: { step, label, at }[]`, and the computed referral-target
  list (see scope decision above).
- `GET /careers/applications/:id/resume` → streams the stored PDF
  (`Content-Disposition: attachment`), 404 if no resume was stored.
- `PATCH /careers/applications/:id/refer` body `{ assigneeId }` →
  `status: REFERRED`, appends a history entry
  (`"ارجاع به {name} توسط ادمین سایت"`). Only legal from `SUBMITTED` or
  `REFERRED` (matches the design's `canForward`/`canAct` guards) —
  otherwise 409.
- `PATCH /careers/applications/:id/hire` → `status: HIRED`, appends a
  history entry. Same legality guard.
- `PATCH /careers/applications/:id/reject` → `status: REJECTED`, same.
- All four mutating endpoints write an audit-log entry
  (`AuditCategory.CONTENT`).

See `docs/DB_SCHEMA.md`'s Phase 67 (DRAFT) section for the new
`CareersSettings` / `JobPosting` / `JobApplication` models, and
`docs/features/careers.md` for the acceptance checklist. **No code has
been written for this phase yet — awaiting explicit user approval per
CLAUDE.md workflow rule 1.**

## Phase B — EMPLOYEE cartable (پنل کارمند.dc.html)

Closes the Phase 18 deferral where `cartable` appeared in the design's
permission list but had no real backend gate for `EMPLOYEE`. New catalog
keys `ct_list` (view) and `ct_process` (mark done + message manager) in
both commercial and finance depts; `EMPLOYEE_SECTION_NAV.cartable` wires
the tab when either key is granted.

### `backend/src/modules/cartable/` (EMPLOYEE additions)

| Method | Path                             | Access                  | Notes                                                                                      |
| ------ | -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/cartable`                      | EMPLOYEE + `ct_list`    | Same self-scoped list as exec roles.                                                       |
| PATCH  | `/cartable/:id/approve`          | EMPLOYEE + `ct_process` | Employee UI «انجام شد ✓» maps here (note required server-side; frontend sends `انجام شد`). |
| GET    | `/cartable/manager-recipients`   | EMPLOYEE + `ct_process` | Exec managers (+ IT_MANAGER, SITE_ADMIN) with `isOwnManager` for the employee's dept.      |
| POST   | `/cartable/manager-message`      | EMPLOYEE + `ct_process` | `{ toId, body }` → cartable task for target manager (`sourceType: EMPLOYEE_MESSAGE`).      |
| GET    | `/cartable/manager-message/sent` | EMPLOYEE + `ct_process` | Caller's last 20 sent messages.                                                            |

Reject/transfer/chair-permission endpoints stay exec-only (class-level
`@Roles(...EXEC_ROLES, 'SITE_ADMIN')` unchanged on those handlers).

### `backend/src/modules/panels/`

| Method | Path                       | Access   | Notes                                                                                                                             |
| ------ | -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/panels/employee-context` | EMPLOYEE | `{ dept, deptLabelFa, rank, permissionLabelsFa[], permissionKeys[] }` for dashboard chips and permission-aware employee surfaces. |

The employee cartable loads its self-scoped task list independently from the
manager messaging endpoints. `ct_list` therefore remains a usable read-only
surface; the composer, sent messages and task completion controls are requested
and rendered only when `permissionKeys` contains `ct_process`.

Schema: `CartableSourceType` gains `EMPLOYEE_MESSAGE` (migration
`20260731120000_employee_cartable_source_type`).

See `docs/features/employee-cartable.md` for the acceptance checklist.

## Phase D — SITE_ADMIN blog CMS

First slice of the پنل ادمین سایت.dc.html content-management deferrals
(Phase 18 left `blog`/`media` out entirely). **Blog tab only** — the
full `media` tab (banners, destinations, image library, app links) stays
deferred to a later sub-phase.

### Admin (`SITE_ADMIN`, `blog` tab)

| Method | Path                    | Access     | Notes                                                                                                                               |
| ------ | ----------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/blog/admin/stats`     | SITE_ADMIN | KPI row: `{ publishedCount, draftCount, totalViews, commentCount }` — `commentCount` is always `0` until a comments feature exists. |
| GET    | `/blog/admin/posts`     | SITE_ADMIN | All non-deleted posts; optional `?category=NEWS\|GUIDE\|DEST\|OFFERS\|all`.                                                         |
| GET    | `/blog/admin/posts/:id` | SITE_ADMIN | Full row for edit modal.                                                                                                            |
| POST   | `/blog/admin/posts`     | SITE_ADMIN | Create — `{ title, body, category, status?, coverFileId?, scheduledAt?, slug? }`.                                                   |
| PATCH  | `/blog/admin/posts/:id` | SITE_ADMIN | Update any field; status transitions set/clear `publishedAt`/`scheduledAt`.                                                         |
| DELETE | `/blog/admin/posts/:id` | SITE_ADMIN | Soft-delete (`deletedAt`).                                                                                                          |

Cover images reuse existing `POST /files` (`StoredFile` FK on `BlogPost`).
Audit log category `CONTENT` on create/update/delete.

### Public (no auth)

| Method | Path                   | Access | Notes                                                         |
| ------ | ---------------------- | ------ | ------------------------------------------------------------- |
| GET    | `/blog/posts`          | public | Published + due scheduled posts only; optional `?category=`.  |
| GET    | `/blog/posts/:slug`    | public | Detail; increments `viewCount`. Draft/future-scheduled → 404. |
| GET    | `/blog/covers/:fileId` | public | Serves cover bytes only when attached to a visible post.      |

### Explicit deferrals

- Comments (`commentCount` KPI is a placeholder)

Public pages: `/blog` + `/blog/:slug` — see `docs/features/public-blog.md`.
See `docs/features/site-admin-blog.md` for the admin acceptance checklist.

## Phase E — SITE_ADMIN media CMS

**Scope:** image library, hero/announcement/promo banners, popular destinations,
popular routes. Deferred: social links (settings tab), app download links,
support contact, job postings block, static site pages list.

### Admin (`SITE_ADMIN`, `media` tab)

| Method                | Path                               | Auth       | Description                                                           |
| --------------------- | ---------------------------------- | ---------- | --------------------------------------------------------------------- |
| GET                   | `/site-content/admin/library`      | SITE_ADMIN | Image library rows (linked `StoredFile`).                             |
| POST                  | `/site-content/admin/library`      | SITE_ADMIN | Add — `{ storedFileId, label? }` from `POST /files`.                  |
| DELETE                | `/site-content/admin/library/:id`  | SITE_ADMIN | Soft-delete library asset.                                            |
| GET                   | `/site-content/admin/blocks`       | SITE_ADMIN | Hero, announcement, promo blocks (auto-seeded defaults).              |
| PATCH                 | `/site-content/admin/blocks/:key`  | SITE_ADMIN | Update block — `HERO_BANNER` \| `ANNOUNCEMENT_BAR` \| `PROMO_BANNER`. |
| GET/POST/PATCH/DELETE | `/site-content/admin/destinations` | SITE_ADMIN | Popular destination cards CRUD.                                       |
| GET/POST/PATCH/DELETE | `/site-content/admin/routes`       | SITE_ADMIN | Popular route chips CRUD.                                             |

### Public

| Method | Path                          | Auth   | Description                                                                          |
| ------ | ----------------------------- | ------ | ------------------------------------------------------------------------------------ |
| GET    | `/site-content/home`          | public | Blocks + destinations + routes for home page wiring.                                 |
| GET    | `/site-content/media/:fileId` | public | Serves bytes when file is in library, a block, destination, or published blog cover. |

Home page reads `GET /site-content/home` for announcement/hero/promo/routes/destinations.
See `docs/features/site-admin-media.md` for the acceptance checklist.

## Phase F — SITE_ADMIN settings (app links + support contact)

Completes Phase E deferrals for app download links and public support
phone/email (social links already in settings).

### Admin (`SITE_ADMIN`, `settings` tab)

SITE_ADMIN may PATCH only: `socialLinks`, `supportEmail`, `supportPhone`,
`appDownloadLinks` (all other keys → 403).

`appDownloadLinks` shape: `[{ id: 'app_store'|'google_play'|'bazaar_myket', name, url }]`.

### Public

| Method | Path                        | Auth   | Description                                         |
| ------ | --------------------------- | ------ | --------------------------------------------------- |
| GET    | `/settings/app-links`       | public | Store links with non-empty URLs (https-normalized). |
| GET    | `/settings/support-contact` | public | `{ phone, email }` from system settings.            |

Home page app band reads `GET /settings/app-links`.
Contact page phone/email cards read `GET /settings/support-contact`.
See `docs/features/site-admin-settings-links.md`.

## Phase G — Contact page support contact wiring

See `docs/features/contact-support-contact-wiring.md`.

## Phase H — Destinations page CMS highlights

Reuses `GET /site-content/home` (no new endpoints). Destination cards on
`/destinations` override price/image by airport code; «مسیرهای پرتردد»
uses CMS route highlights with static fallbacks.

See `docs/features/destinations-cms-wiring.md`.

## Phase I — SITE_ADMIN static site pages CMS

Reuses `SystemSetting` keys (`aboutUsText`, `contactAddress`, `termsText`,
`homeHeroTitle`, `homeHeroSubtitle`). SITE_ADMIN may PATCH these from the
media tab «صفحات سایت» section.

| Method | Path                     | Auth   | Description                            |
| ------ | ------------------------ | ------ | -------------------------------------- |
| GET    | `/settings/site-content` | public | Static page copy for public rendering. |

See `docs/features/site-admin-static-pages.md`.

# Operational account bootstrap (2026-08-05)

Initial management-panel accounts are created only through the offline
`accounts:bootstrap:prod` operation documented in `docs/RUNBOOK.md`. It adds no
HTTP endpoint: account owners, usernames, roles, and 2FA mobile numbers arrive
through standard input on the server, and one-time temporary passwords are
returned only after an atomic database commit. Normal account administration
continues through the authenticated `/admins` endpoints.
Because staff 2FA is mandatory, the same offline operation verifies that an
active Kavenegar configuration exists and can establish its initial encrypted
API key when the database is clean; the key is never part of an API payload.

## Temporary panel UAT access (Kavenegar recovery window)

`POST /auth/staff/login` normally returns
`{ loginMode: "TWO_FACTOR", challengeId }`. Only a reserved, unexpired
production-UAT account may instead return
`{ loginMode: "TEMPORARY_PASSWORD_ONLY", accessToken, user,
temporaryAccessExpiresAt }` and set the refresh cookie directly. The bypass is
account-scoped and audited. Access starts with a seven-day deadline; each
owner-approved offline extension may add seven days exactly once, with a hard
maximum of 35 days from account creation. It returns
`TEMPORARY_ACCESS_EXPIRED` after its deadline. Ordinary staff 2FA is unchanged.
Temporary UAT credentials use a 16-character, letters-and-digits-only format.
The owner-approved one-time format migration is an offline operation (there is
no password-rotation HTTP endpoint), preserves the existing access deadline,
and revokes active refresh sessions after replacing the Argon2 hashes.

## Owner super-admin password-only access (2026-08-06)

One production owner account may be marked `isSuperAdmin=true`. It keeps the
database role `SITE_ADMIN`, but `RolesGuard` grants it every **management
staff** role protected endpoint. This elevation never grants `USER` or
`AGENCY` tenant/owner endpoints directly. `PanelAccessGuard` also permits the owner to
recover a disabled management panel. Every elevated login is audited.

`POST /auth/staff/login` returns
`{ loginMode: "PASSWORD_ONLY", accessToken, user }` for this account after a
valid Argon2 password and sets the normal refresh cookie directly; no OTP
challenge is created. The first session has `mustChangePassword=true`, so all
routes except `/auth/me`, `/auth/change-password`, and logout remain blocked
until the owner replaces the one-time bootstrap password. The new password is
stored only as an Argon2 hash.

Creation/rotation has no public HTTP endpoint. The production-only offline
command `npm run accounts:bootstrap:super-admin:prod -- --execute` requires
`SUPER_ADMIN_BOOTSTRAP_CONFIRM=CREATE_OR_ROTATE_OWNER_SUPER_ADMIN`,
`SUPER_ADMIN_PHONE`, and optionally `SUPER_ADMIN_USERNAME` (default
`superadmin`). It refuses to convert an unrelated existing identity and emits
the generated one-time password once after the transaction commits.

### Temporary Sandbox tenant preview

When `SANDBOX_SUPER_ADMIN_TENANT_ACCESS=true`, the owner may explicitly select
an existing active customer or agency account in the management sidebar. The
server issues a non-refreshable 15-minute access token whose `sub` and `role`
belong to that selected account, while the owner's refresh cookie remains
unchanged. Starting the preview is recorded as a `SECURITY` audit event. The
UI shows a persistent Sandbox banner and returns to the owner by refreshing
the unchanged owner session.

| Method | Path                            | Auth                             | Description                                                              |
| ------ | ------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/auth/sandbox/tenant-accounts` | owner super-admin + Sandbox flag | Lists up to 200 active `USER`/`AGENCY` accounts available for preview.   |
| POST   | `/auth/sandbox/impersonate`     | owner super-admin + Sandbox flag | Accepts `{ targetUserId }` and returns a 15-minute preview access token. |

This switch defaults to `false` in Compose and must be set back to `false`
before go-live. Turning it off immediately blocks creation of new preview
tokens; already-issued preview tokens expire within 15 minutes.

## Phase 68 — complete multi-role sandbox UAT

### Canonical customer completion

- `GET /profile` keeps its response and additionally returns
  `profileIncomplete` and `missingProfileFields`. `completionPct` is computed
  only on the server from five equally weighted fields: `fullName`,
  `nationalId`, `birthDate`, `passportNo`, and verified email.
- `GET /customers`, `GET /customers/incomplete-count`, and
  `GET /customers/:id` allow `SITE_ADMIN|SENIOR_MANAGER`. The senior-manager
  view is read-only and masks national ID; all incomplete flags/counts use the
  same five-field server helper. Other roles remain forbidden.

### Ordered dual agency approval

- `PATCH /agencies/requests/:id/approve` allows
  `COMMERCIAL_MANAGER|FINANCE_MANAGER` but is stage-aware:
  - COMMERCIAL_MANAGER records the first approval and returns
    `{ stage: "AWAITING_FINANCE", request }`; it creates no account.
  - FINANCE_MANAGER is rejected until commercial approval exists. Its approval
    creates User + AgencyProfile + AgencyCreditLine atomically, marks the
    request APPROVED, sends the temporary password once, and returns
    `{ stage: "APPROVED", agencyId, tempPassword }`.
- Request list/detail responses expose `approvalStage`,
  `commercialApprovedAt`, and `financeApprovedAt` (actor IDs are retained for
  audit but are not required by the UI).

### Agency allotment sale

- `POST /agency-portal/allotments/:allotmentId/bookings` — AGENCY only;
  header `Idempotency-Key` is optional but recommended. Body:
  `{ cabin: ECONOMY|BUSINESS, passengers: [{ fullName, nationalId?, mobile?, seatCode }] }`.
  The allotment determines the flight and price (`contractPriceIrr` when set,
  otherwise the registered live cabin price). A successful call atomically
  checks ownership, active/release state, physical seats, remaining allotment,
  and remaining agency credit; then creates an `AGENCY/TICKETED` booking,
  passengers, and agency SALE ledger entry. Returns booking detail including
  `allotmentId`.
- Failure codes: 404 missing allotment/flight, 403 ownership or temporary UAT
  read-only account, 409 released/exhausted/seat conflict/insufficient credit,
  and 400 invalid cabin/passenger/national ID.

## Phase 69 — Aircraft catalog, charter/agency seat commitments, CEO approval simplification

Branch: `agent/commercial-operations-backend`. Backend/migrations/tests/docs
only — no frontend, workflow, or deploy changes.

### FIRST cabin class

- `CabinClass` gains `FIRST` alongside `ECONOMY|COMFORT|BUSINESS` everywhere
  a cabin enum is validated (flight definitions, fare rules, bookings, price
  locks, saved flights, agency allotment bookings, search). `AircraftSeatMap`
  gains an optional `firstRowStart/End` + `firstColsLeft/Right` band, same
  shape as the pre-existing `COMFORT` band — nullable, no existing aircraft
  affected (MD-80 unchanged).

### `backend/src/modules/flights/` — Aircraft definition catalog (new)

Normalized aircraft catalog derived from (and kept in sync with) the
existing `AircraftSeatMap` band-description model, so every pre-existing
search/booking/seatmap code path keeps working unmodified for both new and
existing aircraft.

- `GET /flights/aircraft` — `SENIOR_MANAGER|COMMERCIAL_MANAGER|EMPLOYEE`
  (`fl_view`). Lists all `AircraftDefinition` rows with their `AircraftCabin`
  capacities.
- `GET /flights/aircraft/:id` — same roles/permission. Full detail including
  every generated `AircraftSeat` row.
- `POST /flights/aircraft` — `fl_manage`. Body: `code` (unique), `model`,
  `title`, `status?`, `totalCapacity`, and business/comfort/first/economy
  `rowStart/rowEnd/colsLeft/colsRight` (mirrors `AircraftSeatMap`'s shape) +
  optional `excludedSeatCodes`. Validates the derived per-cabin seat counts
  sum to `totalCapacity`, at least one cabin has seats, and no duplicate
  seat labels. On success, transactionally creates `AircraftDefinition` +
  `AircraftCabin` rows + `AircraftSeat` rows, **and** upserts a matching
  legacy `AircraftSeatMap` row (keyed by `code`) so the new aircraft is
  immediately bookable through the existing search/reservation/booking
  code — no other module needed changes. 400 on validation failure, 409 on
  duplicate `code`.
- `PUT /flights/aircraft/:id` — `fl_manage`. Same body/validation; bumps
  `version`, replaces the cabin/seat rows, and updates the linked
  `AircraftSeatMap` row. Existing aircraft (e.g. the seeded `Airbus A320` /
  `MD-80`) are untouched unless explicitly edited through this endpoint.

### `backend/src/modules/flights/` — Charter / agency seat commitments (new)

A capacity/financial-declaration layer, additive alongside the pre-existing
`AgencyAllotment` (which continues to drive actual per-ticket agency-channel
booking unchanged). A commitment reserves seats out of a cabin's
`cabinCapacities` so online (SYSTEM-channel) sale can never consume them.

- `GET /flights/:instanceId/commitments` — `fl_view`. Lists ACTIVE +
  CANCELLED `charter` and `agency` commitments for the instance; `agency`
  rows are enriched with `agencyName`/`agencyLicenseNo`.
- `GET /flights/:instanceId/commitments/summary` — `fl_view`. Per-cabin
  `{ cabin, totalCapacity, charterCommitted, agencyCommitted, sold,
availableOnline }` plus an instance-wide aggregate row.
  `availableOnline = totalCapacity - charterCommitted - agencyCommitted -
sold`, floored at 0.
- `POST /flights/:instanceId/commitments/charter` — `fl_manage`. Body:
  `{ cabin, seats, amountIrr, periodStart?, periodEnd?, idempotencyKey? }`.
  Row-locks the flight instance; rejects with 400 if the cabin isn't
  configured or the period falls outside `[now, departureAt]`; rejects with
  409 if `existing committed + seats` would exceed the cabin's configured
  capacity **or** its physical seat-map ceiling. Creates a `CharterCommitment`
  row, a `LedgerEntry` (`type: COMMITMENT`), and an audit-log entry.
  `idempotencyKey` replay returns the original row (no duplicate).
- `POST /flights/:instanceId/commitments/agency` — `fl_manage`. Same as
  charter plus a required `agencyId` (an `AgencyProfile.userId`); 404 if the
  agency doesn't exist.
- `DELETE /flights/:instanceId/commitments/charter/:id` and
  `.../agency/:id` — `fl_manage`. Idempotent cancel (re-cancelling an
  already-CANCELLED commitment returns the same 200 result, no error);
  writes an audit-log entry only on the transition that actually cancels it.

**Online-availability enforcement (hard backend rule, not cosmetic):**
`SearchService.seatsLeftForCabin` now subtracts each cabin's sum of ACTIVE
charter + agency commitments (`commitment-capacity.util.ts`'s
`sumActiveCommittedSeats`) from the physical/configured seat count shown in
`GET /search/flights` and the 1-stop connection builder. `BookingService
.createBooking` performs the same subtraction inside its row-locked
transaction and rejects a SYSTEM-channel booking with
`409 { code: "POOL_EXHAUSTED" }` if it would consume committed capacity —
independent of, and in addition to, the pre-existing whole-flight
`publicPoolLimit` check.

### `backend/src/modules/pricing/` — CEO approval without step-up/OTP

- `PATCH /pricing/proposals/:id/register` and `.../reject` no longer accept
  or require `stepUpChallengeId`/`stepUpCode` — CEO approval/rejection of a
  flight-definition pricing proposal is a same-session action gated only by
  `@Roles('CEO')` + the existing JWT/RBAC guard stack. `RegisterProposalDto`
  / `RejectProposalDto` had the two step-up fields removed; `reject` still
  requires a non-empty `rejectionReason`.

### `backend/src/modules/flights/flight-definition.service.ts` — search-cache fix

- Approving a CEO revision (`PENDING_REVISION → APPROVED`) that changes the
  flight's `departureAt` and/or route now busts **both** the old and the new
  `search:flights:{origin}:{dest}:{date}` Redis cache keys
  (`SearchService.invalidateForRouteDate`, new). Previously only the
  post-update key was invalidated, so a moved flight could keep appearing
  under its old date in `GET /search/flights` for up to the 5-minute cache
  TTL.

### Migrations

- `1786521600000-AircraftDefinitionCatalog` — `FIRST` cabin enum value;
  `AircraftStatus`/`AircraftSeatSide` enums; `aircraft_seat_maps` FIRST band
  columns + `aircraftDefinitionId`; `flight_instances.aircraftDefinitionId`;
  new tables `aircraft_definitions`/`aircraft_cabins`/`aircraft_seats`;
  backfills one `AircraftDefinition` (+ cabins + seats) per pre-existing
  `aircraft_seat_maps` row (never invents data — MD-80's band values are
  read, never written); best-effort links existing `flight_instances` to the
  backfilled catalog by aircraft-type code match.
- `1786608000000-CharterAgencySeatCommitments` — `COMMITMENT` ledger-entry
  enum value; `CommitmentStatus` enum; `charter_commitments` and
  `agency_seat_commitments` tables.
- Both migrations are additive/reversible (`down()` implemented) and do not
  rewrite existing `flight_instances`/`agency_allotments`/`aircraft_seat_maps`
  data. `aircraftDefinitionId`/`createdById`/`updatedById`/`agencyId` and
  similar back-reference columns on the five new entities are intentionally
  **plain columns with no DB-level FK constraint** — mirrors the codebase's
  established TS2589 type-recursion-avoidance convention (no ORM relation
  metadata for these columns) and keeps `schema-parity.e2e-spec.ts` green,
  which derives its expected schema purely from entity relation metadata.

## Phase 70 — API contract completion for frontend PR #126

Branch: `agent/commercial-operations-backend` (continuation of Phase 69, no
new branch). Backend/migrations/tests/docs only — no frontend, workflow, or
deploy changes; not merged/deployed by this phase.

**Full endpoint-by-endpoint contract (paths, DTOs, enums, error codes,
sample payloads) lives in `docs/api-contract-pr126.md` — read that file
first when wiring up the frontend.** Summary of what changed:

- **Aircraft**: canonical `/flights/aircraft-definitions*` routes added
  alongside the existing `/flights/aircraft*` (same handlers, both work);
  detail response now embeds the full `seatMap`. MD-80 unchanged.
- **Commitments**: unified `GET/POST /flights/:instanceId/commitments` +
  `DELETE .../commitments/:id` (was split charter/agency endpoints);
  `contractPriceIrr`/`startDate`/`releaseAt` field renames (migration
  `RenameCommitmentFields`); new `GET .../commitments/summary` capacity
  breakdown; fixed a real overbooking bug where already-sold seats weren't
  counted against commitment capacity.
- **CEO approve/reject**: confirmed and permanently alias-locked — no
  step-up/OTP on `PATCH /pricing/proposals/:id/{register,approve,reject}`;
  new `.../approve` canonical alias for `.../register`.
- **Search/publish status**: `definitionStatus`/`publishStatus` added to
  every search result row and to `GET /flights/:id/definition`;
  `publishStatus` is a pure derived mapping (`toPublishStatus()`), the DB
  enum itself was not renamed. Verified end-to-end (THR→MHD): create →
  propose → CEO approve → publish → search → visible with the right
  status, cache invalidated for both old/new route+date keys.
- **Notifications**: new module and table (migration `Notifications`) —
  `GET /notifications`, `GET /notifications/unread-count`,
  `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`;
  idempotent via `dedupeKey`; wired into commitments, pricing, access
  revocation, cartable transfer, and agency-request create/refer.
- **Access revocation**: `JwtAuthGuard` now re-checks live `User.isActive`
  (+ `AgencyProfile.suspendedAt` for role `AGENCY`) on every authenticated
  request, not just at login — an already-issued access token stops
  working on its very next use after a block/suspend, returning
  `403 { code: "ACCESS_REVOKED" }`. Refresh tokens are also revoked
  immediately. Covered for manager/employee/agency block-suspend paths.
- **Audit logs**: `GET /audit/manager-reports`, `/audit/logs`,
  `/audit/system-events` gained pagination (`page`/`limit`) and
  `actor`/`action`/`resource`/`dateFrom`/`dateTo` filters, returned via a
  new `meta: {total,page,limit}` sibling field — `data`'s existing array
  shape is unchanged (fully backward compatible).
- **Cartable/referrals**: `POST /agencies/requests` (public submission) now
  creates a cartable task + notification for every active SITE_ADMIN, not
  just on manual referral; new `GET /cartable/:id` (detail + history,
  marks read) and `GET /cartable/unread-count`; migration
  `CartableTaskReadAt` adds the `readAt` column; `PATCH
/agencies/requests/:id/{refer,reject}` are now transaction+lock
  concurrency-safe (previously a plain read-then-write race) and `refer`
  now also notifies the target.
- **Careers**: `generalReqs`/`specialReqs` are now guaranteed real arrays
  (never `null`) in both `GET /careers/jobs/:id` and
  `GET /careers/postings`; new general-purpose `DELETE /files/:id`
  (owner-only, safe/idempotent, used for job-posting cover images among
  other attachment types — deleting one clears
  `JobPosting.imageFileId` via `ON DELETE SET NULL`).
- **Sandbox active-flight purge**: new local/CI-only maintenance script
  (`backend/src/database/sandbox-active-flight-purge.ts`, `npm run
data:purge:sandbox-flights[:execute]`) — deletes a specific flight (by
  `flightNo`) or all flights and every dependent row (instances, bookings,
  passengers, seat locks, cabin fares/fare rules, commitments, allotments,
  survey rows) in the correct FK-safe order inside one transaction. Refuses
  to run outside a non-production sandbox (`NODE_ENV≠production` +
  `AUTH_SANDBOX_ENABLED=true` — the inverse gate of the existing
  production-only `uat-demo-data-purge`/`uat-flight-catalog-cleanup`
  scripts), requires a real actor + confirmation phrase to execute, always
  reports counts before deleting (dry-run is the default), never deletes
  the immutable ledger/wallet/club-points rows (only detaches them via
  `ON DELETE SET NULL`, matching CLAUDE.md's ledger-immutability rule), and
  writes both an `AuditLog` row and a sentinel JSON file on every real
  execution. **Not run against any real database in this phase** — only
  exercised via its own e2e tests against disposable, test-created fixture
  flights.

### Migrations

- `1786694400000-RenameCommitmentFields` — renames
  `periodStart→startDate`, `periodEnd→releaseAt`, `amountIrr→contractPriceIrr`
  on `charter_commitments`/`agency_seat_commitments`.
- `1786780800000-Notifications` — `NotificationCategory` enum;
  `notifications` table.
- `1786867200000-CartableTaskReadAt` — adds `cartable_tasks.readAt`.
- All three are additive/reversible (`down()` implemented), rewrite no
  existing row data, and follow the same plain-column/no-DB-FK convention
  as Phase 69 where applicable.

## Phase 71 — Flight approval workflow (operations → CEO → PUBLISHED)

See `docs/features/flight-approval-workflow.md`.

- Role `OPERATIONS_MANAGER` added (seed user `ops` / `Blujet@1404`).
- `definitionStatus` gains `PENDING_OPERATIONS`, `OPERATIONS_REJECTED`,
  `PUBLISHED`. Legacy `APPROVED` rows are data-migrated to `PUBLISHED`
  (enum value `APPROVED` may remain unused in Postgres).
- CEO `PATCH /pricing/proposals/:id/register` (and `/approve`) sets
  `definitionStatus=PUBLISHED`, `publishedAt`, `publishedByUserId`, bumps
  `version`, records a CEO `FlightReview`, and invalidates search cache.
- CEO proposal lists/counts expose only `PENDING_CEO`/`PENDING_REVISION`
  rows; drafts and operations-pending proposals are not visible there.
- Commercial `PATCH /pricing/flights/:flightInstanceId/price` updates a
  published sale price with optimistic-version checking and immutable history.
- Public `GET /search/flights` sellability uses `PUBLISHED` (+ revision
  snapshot rule). Response continues to expose derived `publishStatus`.
- Deferred stubs only (next phase): pricing-alerts rule engine, loans
  module, transactional outbox for domain events
  (`flight.submitted_to_operations`, …).
- Migration: `1786953600000-FlightApprovalWorkflow`.

# 2026-08 management panel hardening

- `GET /panels/access-flags` includes `OPERATIONS` for CEO and senior-manager
  actors. `PATCH /panels/access-flags/OPERATIONS` controls the
  `OPERATIONS_MANAGER` panel.
- A protected panel request made while its flag is disabled returns HTTP `403`
  with `{ "code": "ACCESS_REVOKED", "message": "اجازه دسترسی برای شما امکان‌پذیر نیست." }`.
  Disabling access revokes current refresh-token sessions for the affected role.
- `GET /pricing/ceo` returns registered proposals only while
  `approvedAt >= now - 3 days`; records remain available through audit/history
  endpoints after leaving this screen.
- CEO pricing workflow tasks are excluded from generic `GET /cartable`; pricing
  review is served exclusively by `/pricing/ceo`.
- `GET /flights/:id/history` is the canonical lifecycle feed for active-history
  and completed-flight detail views. It includes manager reviews and relevant
  flight/pricing audit entries.
- Low-sales responses may include `suggestedPriceIrr`, `reasonFa`, `factorsFa`,
  `confidence`, and `generatedAt`. Missing fields mean no current ML suggestion;
  consumers must show a graceful advisory-unavailable state.

## Phase 72 — V4 backend gaps (schedule templates, bank loans, destination stats)

See `docs/features/v4-backend-gaps.md`. Does **not** change OPERATIONS_MANAGER
panel or MD-80 seat maps. Commercial → CEO pricing register path unchanged.

### Seasonal schedule templates

| Method | Path                                                  | Roles                                  | Notes                                                                                                                                                                                                                                                                                              |
| ------ | ----------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/flights/schedule-templates/preview`                 | COMMERCIAL/SENIOR/EMPLOYEE+`fl_manage` | Preview occurrences (no persist)                                                                                                                                                                                                                                                                   |
| POST   | `/flights/schedule-templates`                         | same                                   | Create + materialize; `idempotencyKey` required                                                                                                                                                                                                                                                    |
| GET    | `/flights/schedule-templates`                         | + `fl_view`                            | Paginated list                                                                                                                                                                                                                                                                                     |
| GET    | `/flights/schedule-templates/resolve?flightNo=XY1234` | + `fl_view`                            | Resolve the active route template plus all future non-cancelled dated occurrences for Add Flight selection. `occurrences[]` contains `{ id, departureAt, arrivalAt, definitionStatus, publicSaleEnabled, version }`; `nextFlightInstanceId` / `nextDepartureAt` remain for backward compatibility. |
| GET    | `/flights/schedule-templates/:id`                     | + `fl_view`                            | Detail + instanceCount                                                                                                                                                                                                                                                                             |
| POST   | `/flights/schedule-templates/:id/deactivate`          | + `fl_manage`                          | Cancel future unsold instances; keep sold history                                                                                                                                                                                                                                                  |

Amounts are IRR integer strings. Cabin capacities are read from the aircraft
definition (MD-80 maps are never rewritten).
Creation materializes one `FlightInstance` per matching operating date. Every
new occurrence starts with `definitionStatus=DRAFT` and
`publicSaleEnabled=false`; public and agency sale surfaces remain closed until
the existing approval/publication workflow explicitly enables the instance.

### Bank loans (adapter only)

| Method | Path                             | Roles         | Notes                                   |
| ------ | -------------------------------- | ------------- | --------------------------------------- |
| POST   | `/me/loan-applications`          | USER          | Create via bank API; idempotent         |
| GET    | `/me/loan-applications`          | USER          | Own list                                |
| GET    | `/me/loan-applications/:id`      | USER          | Own detail + `displayStatus`            |
| POST   | `/me/loan-applications/:id/sync` | USER          | Poll bank status                        |
| GET    | `/admin/loan-applications`       | SITE_ADMIN    | Read-only list                          |
| GET    | `/admin/loan-applications/:id`   | SITE_ADMIN    | Read-only detail                        |
| POST   | `/webhooks/bank-loans`           | public + HMAC | Header `X-Bank-Signature: sha256=<hex>` |

Env: `BANK_LOAN_API_BASE_URL`, `BANK_LOAN_API_KEY`, `BANK_LOAN_WEBHOOK_SECRET`,
`BANK_LOAN_TIMEOUT_MS`. No hard-coded bank name/URL. No local mock bank
responses — tests mock the provider at the HTTP/provider boundary.

Bank status → displayStatus: SUBMITTED/PENDING→awaiting_bank,
UNDER_REVIEW→under_review, APPROVED→approved, REJECTED→rejected,
DISBURSED→disbursed, CANCELLED→cancelled, FAILED→failed, else→unknown.

### Destination stats

| Method | Path                              | Auth   | Notes                                                                                                                   |
| ------ | --------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | `/site-content/destination-stats` | public | `{ activeDestinations, domesticDestinations, internationalDestinations }` from catalog ∩ published flights; zeros valid |
| GET    | `/site-content/home`              | public | Also includes `destinationStats`                                                                                        |

## Passenger-aware public booking (2026-08-10)

- `GET /search/flights` additionally accepts `adults` (minimum 1), `children`, and `infants`. Each cabin keeps `priceIrr` as the adult unit fare and adds `totalPriceIrr` for that passenger mix.
- `POST /bookings` passengers additionally send `passengerType: ADULT|CHILD|INFANT`, ISO `birthDate`, optional `gender: male|female`, optional `passportNo`, and optional `seatCode`. `nationalId` remains optional for passport-based travellers. A seat is required for adults/children and omitted for lap infants. `gender` and encrypted `passportNo` are persisted on the resulting `Passenger` row.
- The server classifies age at `FlightInstance.departureAt`: infant `<2`, child `2..11`, adult `>=12`. A type mismatch and more lap infants than adults return `VALIDATION_FAILED`.
- Public SYSTEM fares use adult 100%, child 50%, infant 10%; CHARTER child fares use 100%. Payment re-price repeats the same passenger-aware calculation.

## Route cabin pricing and smart distance (2026-09-01)

- Aircraft cabin payloads and responses include `defaultClassCode` (1–3 Latin
  letters/numbers). When omitted on create/update, the backend applies the
  standard mapping `FIRST=F`, `BUSINESS=C`, `COMFORT=W`, `ECONOMY=Y`.
- `POST /flights/schedule-templates/preview` and
  `POST /flights/schedule-templates` accept every `cabinCapacities[]` row as
  `{ cabin, seats, basePriceIrr }`. The current panel always supplies each
  positive IRR price; an older client that omits it inherits
  `agencyPriceIrr`. Each resolved cabin price must not exceed
  `legalCeilingIrr`.
- `POST /flights/routes/distance-suggestion` accepts
  `{ originAirportId, destinationAirportId }` and returns an advisory
  `{ distanceKm, source, confidence, generatedAt }`, or `data: null` when the
  configured AI provider is unavailable. The endpoint never writes route data.
- Route preview/create additionally accepts `distanceKm` (positive integer)
  and `distanceSource: AI|MANUAL`. The selected value is persisted on both the
  canonical `Route` and the seasonal-template snapshot; AI output is never
  applied without the operator submitting the route form.
- Materialization creates one unreleased `FareRule` per occurrence/cabin using
  the aircraft cabin's `defaultClassCode` and that cabin's base price. Existing
  publication and channel-release gates remain authoritative. Template and
  occurrence snapshots return the resolved `defaultClassCode` beside each
  cabin for auditability.

## Manager panel permission restrictions

- `POST /admins` accepts `permissions` as an optional list of manager-panel permission keys.
- `PATCH /admins/:id/permissions` replaces that list and requires the existing `ADMIN_ROLE_CHANGE` step-up challenge.
- A `null` permission list preserves the role's legacy/default access. An explicit list can only restrict the account's existing role; it never grants access that the role guard does not already allow.
- The restriction is enforced both in `GET /panels/nav` and by `PanelAccessGuard` for mapped management APIs. Known keys are: `flights`, `agencies`, `reports`, `finance`, `refunds`, `club`, `content`, `support`, `admins`, and `settings`.

## Agency seat requests and desktop checkout (2026-08-11)

- `GET /agency-portal/seat-requests` (`AGENCY`) returns only the caller's own
  seat-request history, including route, selected flights, invoice metadata,
  price, term, and decision status. The agency id always comes from the JWT;
  no client-supplied tenant id is accepted.

- `GET /agency-portal/seat-request-options` (`AGENCY`) returns every future,
  CEO-approved/published flight instance that has a fare class. Each response row is one
  flight occurrence plus one fare class and includes `cabin`, `fareClassCode`,
  `agencySeatsReleased`, `agencySeatsAllocated`, `availableToRequest`, and the
  commercial `agencyReleasePriceIrr`. Availability is derived from the released
  class quota minus active paid/credit agency allotments for that exact
  flight/class; physical aircraft capacity remains a hard upper bound. Expired
  public holds and draft bookings never consume the agency release. Rows with
  zero commercial release remain visible with `availableToRequest: 0` and a
  null release price so the agency is informed about every active flight; the
  existing request validation prevents submission until commercial capacity
  and price are available.
- The agency portal's **Active flights** projection combines this published
  catalogue with the caller's active allotments. A catalogue row without an
  allotment is displayed with honest zero allocated/sold values and opens the
  request form preselected for that exact flight/cabin/class. An existing
  class-bound allotment suppresses the matching zero-allocation catalogue card.
- `POST /agency-portal/seat-requests` (`AGENCY`) accepts
  `{ flightInstanceId, cabin, fareClassCode, seats, preferredWeekdays?, termMonths?, payMethod? }`, validates the
  current capacity again, persists a structured `agency_seat_requests` row
  (plus `agency_seat_request_flights`), and creates a cartable notification
  for every active `COMMERCIAL_MANAGER` (`sourceId` = the structured row id).
  `termMonths` accepts `0 | 1 | 3 | 6 | 12`; `0` means one week. The request
  includes every matching occurrence of the same route/flight/aircraft/class
  within the selected term and preferred weekdays. A pending request does not
  reserve inventory. `payMethod` accepts `INVOICE | CREDIT` and defaults to
  `INVOICE`. Commercial approval revalidates every selected occurrence under
  database row locks: CREDIT approval atomically checks the ledger-derived
  remaining credit and activates one class-bound `AgencyAllotment` per
  occurrence; INVOICE approval creates one unpaid invoice and moves the request
  to `PENDING_FINANCE`. Paying that invoice revalidates the released quotas and
  atomically activates the allotments. Repeated approval/payment cannot create
  duplicate allotments.
- Guest desktop checkout now completes phone/OTP authentication inside the
  results-page modal and resumes the stored flight/cabin/passenger selection.
  Mobile retains its existing login-or-sign-up choice. Desktop passenger,
  extras, review, and payment pages share one four-step progress contract.

## Direct agency B2B reservation API (2026-08-12)

This integration sells only blujet-owned internal inventory. It intentionally
does not call GDS, NIRA, or a bank/payment gateway.

All routes require an active `X-API-Key`. A suspended/expired key or a disabled
agency fails closed. `SEARCH_ONLY` can search; `SEARCH_BOOK` and `FULL` can use
agency allotments, reserve, retrieve ticketed reservations, and read credit.

| Method   | Path                                        | Scope            | Notes                                                           |
| -------- | ------------------------------------------- | ---------------- | --------------------------------------------------------------- |
| POST     | `/api/v2/accounting/getAuthorizeToken`      | any active key   | Validate API key; no secondary token                            |
| POST     | `/api/v2/flight/FlightSearch`               | any active key   | Published internal inventory only                               |
| GET      | `/api/v2/flight/:flightInstanceId/SeatMap`  | any active key   | Live internal seat map                                          |
| GET      | `/api/v2/flight/Allotments`                 | SEARCH_BOOK/FULL | Caller-owned allotment IDs and remaining capacity               |
| POST     | `/api/v2/flight/Book`                       | SEARCH_BOOK/FULL | Requires `Idempotency-Key`; transactional credit/inventory lock |
| GET      | `/api/v2/flight/Bookings/:bookingReference` | SEARCH_BOOK/FULL | Caller-owned booking only                                       |
| POST     | `/api/v2/flight/AirDemandTicket`            | SEARCH_BOOK/FULL | Returns the already-ticketed allotment booking                  |
| GET/POST | `/api/v2/accounting/myCredit`               | SEARCH_BOOK/FULL | Real agency limit, usage, and remaining credit                  |

Booking input uses `{ allotmentId, cabin, passengers[] }`. Each passenger has
`fullName`, `passengerType`, `birthDate`, and a `seatCode` except lap infants.
The existing reservation engine validates age at departure, locks the
allotment/credit/seat rows, debits the agency ledger, and returns the same result
for a repeated idempotency key.

## Commercial active-inventory projection (2026-08-13)

`GET /flights/overview` exposes only commercially sellable instances in its
`active` and `future` arrays. Every active row also returns `salesHealth` with
`isWeak`, `occupancyPct`, `hoursToDeparture`, `thresholdPct`, `windowHours`, and
a Persian reason. This server decision is separate from the persisted advisory
`aiSuggestion`; the browser must not recompute weak-sale eligibility from its
own clock.

# Senior Manager panel completion (2026-08)

- `GET /panels/nav` returns the approved Senior Manager sidebar without `customers`, `reservation`, or `aircraft`.
- `POST /admins` returns the one-time initial credential in `tempPassword` after step-up verification; the account is persisted with `mustChangePassword=true`.
- Manager permission payloads additionally accept `dashboard`, `priorities`, `approvals`, and `cartable`; `dashboard` and `cartable` are enforced by the server navigation/access guard.

# Commercial panel design refresh — backend (2026-08-18)

Implemented on `cursor/backend-commercial-overhaul-20260818` (from
`claude/frontend-overhaul-20260816`). Frontend mock adapters are swapped
for real `api/agencies.ts` / `api/ancillary-services.ts` calls.

## Commercial partner-list monthly metrics (2026-08-21)

`GET /agencies` keeps its existing role gates and adds two fields to every
agency row for the Commercial Manager partner-list design:

- `monthlyTicketsSold` is a number derived from passengers on that agency's
  `PAID`/`TICKETED` bookings created during the current server month.
- `monthlySalesIrr` is a decimal IRR string derived only from current-month
  immutable `LedgerEntry(type=SALE, bookingId IS NOT NULL)` rows.

Empty aggregates return `0` / `"0"`. No client-side summing or mock fallback is
used.

## Cross-agency invoice aggregate (used by: AgenciesListPage "همه فاکتورها")

| Method | Path                 | Roles                | Notes                                                                                                                                      |
| ------ | -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/agencies/invoices` | `COMMERCIAL_MANAGER` | Server-side `SELECT` over existing `agency_invoices` (no new table). Optional `?status=UNPAID\|PAID\|VOIDED`. Amounts are decimal strings. |

**OVERDUE vs VOIDED:** `AgencyInvoiceStatus` is `UNPAID | PAID | OVERDUE | VOIDED`.
OVERDUE is **never** mapped to VOIDED. The UNPAID filter/response includes both
`UNPAID` and `OVERDUE` (issued / still payable). VOIDED is a new enum value for
the باطل‌شده tab; existing create/pay/remind flows still write UNPAID/PAID.
`descriptionFa` is an optional column; when null the aggregate returns `فاکتور آژانس`.

## Manager-side seat-request queue

`POST /agency-portal/seat-requests` now inserts `agency_seat_requests` +
`agency_seat_request_flights` and keeps the cartable task as a notification
(`sourceType='AGENCY_REQUEST'`, `sourceId` = the structured row id).

**termMonths:** accepted values are `0 | 1 | 3 | 6 | 12` (smallint); `0` means
one week. The legacy
portal contract was `3|6|12`; the commercial UI uses `1|3|12`. `6` remains
valid. Omitted term is stored as null and listed as `1` (تک‌پرواز).

| Method | Path                                 | Roles                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/agencies/seat-requests`            | `COMMERCIAL_MANAGER`, `FINANCE_MANAGER` | Read-only structured queue for finance; decision remains commercial-only. Money fields are decimal strings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| PATCH  | `/agencies/seat-requests/:id/decide` | `COMMERCIAL_MANAGER`                    | `{ approve: boolean, dueAt?: string }`. Runs in a transaction with `SELECT … FOR UPDATE`. Only `PENDING` may be decided; repeats return `409 CONFLICT`. CREDIT approval validates credit + class quota and creates the class-bound allotments immediately. INVOICE approval creates exactly one `AgencyInvoice`, links it, and moves to `PENDING_FINANCE`; allotments are created only by successful payment. Rejection creates no invoice/allotment. Cartable tasks for that `sourceId` are closed and audit records the transition. Missing `dueAt` defaults to +7 days. |

### Flight lifecycle and aircraft-derived capacity (2026-08-21)

- Sell-out is an inventory state (`derivedStatus=FULL`), not a lifecycle
  transition. A sold-out `SCHEDULED` instance remains in active inventory
  until `departureAt`; the lifecycle worker changes it to `DEPARTED`, and only
  then can passenger/booking projections become `FLOWN`.
- Schedule-template and flight-definition capacity is read from the selected
  `AircraftDefinition` cabin map. Commercial users do not enter a second total
  seat count; they only configure sellable quantities by fare class and channel
  (public/agency/charter), all bounded by the aircraft cabin capacities.
- Updating an agency fare-class release is serialized with request activation.
  The release cannot be reduced below already activated agency allotments and
  cannot exceed the still sellable capacity of that fare class.
- When `GET /flights/overview` detects occupancy below 60% during the final
  seven days, it emits one idempotent SYSTEM warning per flight/recipient to
  active `COMMERCIAL_MANAGER`, `FINANCE_MANAGER`, `SENIOR_MANAGER`, `CEO`, and
  `BOARD_CHAIR` accounts. Repeated overview reads do not duplicate the alert.

## Ancillary services pricing — manager + public

Distinct from `webservice-pricing` (B2B API plans) and complementary to
`travel_extra_settings` (checkout purchase ids). Mapped built-in OTHER keys
overlay checkout extras: baggage→EXTRA_BAGGAGE, meal→SPECIAL_MEAL,
insurance→TRAVEL_INSURANCE, cip→CIP, refund-fee→REFUND_FEE,
seat-selection→SEAT_SELECTION and pet→PET. Seat-type rows are manager-only.
Wheelchair and custom OTHER rows appear on the public ancillary list. Product
policy keeps `seat-selection` and `pet` enabled and purchasable; attempts to
disable/delete either rule return `VALIDATION_FAILED`.

| Method | Path                               | Roles                | Notes                                                                                                                                                                                             |
| ------ | ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/ancillary-services`              | `COMMERCIAL_MANAGER` | `{ seatServices, otherServices }`.                                                                                                                                                                |
| PATCH  | `/ancillary-services/:key/price`   | `COMMERCIAL_MANAGER` | `{ priceIrr: string }` (≥ 0 decimal string).                                                                                                                                                      |
| PATCH  | `/ancillary-services/:key/enabled` | `COMMERCIAL_MANAGER` | `{ enabled: boolean }`; `seat-selection` and `pet` cannot be disabled.                                                                                                                            |
| POST   | `/ancillary-services`              | `COMMERCIAL_MANAGER` | `{ titleFa, descriptionFa?, priceIrr }` → OTHER + `isCustom=true`.                                                                                                                                |
| DELETE | `/ancillary-services/:key`         | `COMMERCIAL_MANAGER` | Custom only; built-ins return `VALIDATION_FAILED`.                                                                                                                                                |
| GET    | `/public/ancillary-services`       | public               | Enabled OTHER services only: `key`, `titleFa`, `descriptionFa`, `priceIrr`. Checkout continues to use `GET /public/travel-costs`, whose prices/enabled flags overlay this table for mapped codes. |
| GET    | `/public/ancillary-services/seat-types` | public          | Current enabled `seat-normal`, `seat-legroom`, and `seat-window-aisle` rows used by the public seat picker. Prices are reloaded and validated again by booking creation. |

Selected seat codes are classified on the server from the aircraft layout.
Booking creation reloads the current seat-type catalogue and snapshots the
matching charges in `extraServices`; client-supplied seat prices are never
accepted. Those charges are included in `extrasIrr` and the final `priceIrr`.

## Panel nav

`GET /panels/nav` for `COMMERCIAL_MANAGER` includes
`{ key: 'ancillary-services', labelFa: 'خدمات', implemented: true }`.

## Site-admin rules editor and loan projection (2026-08-20)

| Method | Path                                    | Roles        | Notes                                                                                                                                    |
| ------ | --------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/settings/site-rules`                  | `SITE_ADMIN` | Returns the seven ordered rule categories from the server-owned `siteRules` setting.                                                     |
| PATCH  | `/settings/site-rules`                  | `SITE_ADMIN` | Accepts `{ categories: [{ id, title, text }] }`; requires each fixed id exactly once, persists atomically, and audits the update.        |
| GET    | `/settings/site-rules/public?locale=fa` | public       | Returns the saved Persian rules. Non-Persian locales return no editable override so the client retains its approved translated fallback. |

`GET /admin/loan-applications` and
`GET /admin/loan-applications/:id` remain read-only and additionally return
`customer: { id, fullName, phone }` from the related real user when present.
No loan decision endpoint is introduced.

## IT Manager — webservices policy depth (2026-08-20)

Extends `AgencyApiKey` with `capabilities`, `environment`, `flightDomain`,
`ipWhitelist`, `rateLimitPerMinute`. Partner guard enforces IP whitelist and
per-key Redis rate limit. Coarse `scope` remains the partner-route gate;
capabilities drive the IT UI and availability tester.

| Method | Path                                            | Roles        | Notes                                                                                                                    |
| ------ | ----------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/it/webservices`                               | `IT_MANAGER` | Overview includes policy fields; `errorRatePct` is always `null` (no invented rate).                                     |
| POST   | `/it/webservices/clients`                       | `IT_MANAGER` | Issue key with optional environment/domain/capabilities/IP/rate/expiry. One ACTIVE/SUSPENDED key per agency+environment. |
| PATCH  | `/it/webservices/clients/:id`                   | `IT_MANAGER` | Status/rotate **or** policy fields (capabilities sync coarse scope).                                                     |
| POST   | `/it/webservices/clients/:id/test-availability` | `IT_MANAGER` | `{ flightNo }`. Requires `AVAILABILITY` capability; returns real seatsLeft for next SCHEDULED instance.                  |

## Phase 32 — granular employee permissions wired to operational endpoints

The action-level keys exposed by `GET /it/permissions` are now connected to
the corresponding guarded handlers. `EmployeePermissionGuard` continues to
apply only to users with role `EMPLOYEE`; manager roles retain their existing
role-based access.

- Commercial: route creation/management (`rt_*`), aircraft definitions
  (`ac_*`), flight views and allocation (`fl_*`), operations read/submit
  (`op_*`), travel costs (`fl_costs`), ancillary services (`sv_*`), webservice
  pricing (`ws_*`), club tier rules (`cl_rules_*`) and sales reporting
  (`rp_sales`).
- Finance: credit and agency settlement (`cr_*`), finance reports and their
  export (`rp_finance`, `rp_exports`), plus existing refund/invoice/cartable
  permissions.
- IT: users, services, security sessions/policy and audit-log export
  (`us_*`, `sv_*`, `sc_*`, `lg_*`).

Legacy section grants remain accepted as compatibility bundles. A new action
grant does not imply an unrelated action; only the documented read
prerequisite is expanded. No reservation seat-lock permission is added for
`IT_MANAGER`.

## Aircraft cabin capacity and per-route activation (2026-08-24)

- `POST|PUT /flights/aircraft` keeps the existing seat-band payload and adds
  `cabinCapacities: [{ cabinType: FIRST|BUSINESS|COMFORT|ECONOMY, capacity }]`.
  Positive rows must be unique, sum to `totalCapacity`, and cannot exceed the
  matching cabin bands in the submitted physical map. The response continues
  to expose the persisted `AircraftCabin[]` rows.
- Route-template preview/create accepts `cabinCapacities` and persists only the
  cabins activated for that route. Add Flight reads those rows as authoritative
  maxima. Its submitted
  `cabinCapacities` contains only cabins explicitly activated for the flight;
  each quantity must be `1..aircraftCabin.capacity`. A cabin absent from the
  aircraft or with zero capacity is rejected server-side.

## Passenger validation and adjacent extra seat (2026-08-24)

- Checkout validates guest and signed-in passenger data before opening OTP or
  advancing: first name, last name, gender, complete birth date, and either a
  checksum-valid Iranian national ID or a passport are required. The passenger
  form renders field-specific localized inline errors.
- `POST /bookings` and the agency-allotment booking endpoint accept
  `passengers[].extraSeatRequested`. For a seated passenger the booking
  transaction reserves an immediate adjacent seat in the same row, cabin and
  aisle side. If the initially selected seat is isolated, the transaction uses
  another free adjacent pair; `409 POOL_EXHAUSTED` is returned only when no pair
  exists.
- The EXST is charged at one base fare without a second tax or baggage
  entitlement. Booking detail returns `extraSeatCode` and `extraSeatFareIrr`.
  Capacity, fare-bucket usage, seat maps, agency allotments, and the two-seats-
  per-national-ID rule all count the EXST as an occupied seat.

## Customer loan eligibility and agency seat-order workflow (2026-08-25)

### Customer bank profile — `USER`

| Method | Path                                    | Behavior                                                                                                       |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/me/loan-profile`                      | Returns the user's account-opening and credit-assessment state, masked customer number and eligible IRR limit. |
| POST   | `/me/loan-profile/account-opening`      | Creates an idempotent account-opening request through the configured bank adapter.                             |
| POST   | `/me/loan-profile/account-opening/sync` | Polls the bank; stores an encrypted customer number only when returned by the bank.                            |
| POST   | `/me/loan-profile/eligibility`          | Starts credit assessment for a validated bank customer number.                                                 |
| POST   | `/me/loan-profile/eligibility/sync`     | Polls the bank assessment and exposes the real eligible IRR limit when decided.                                |

`POST /me/loan-applications` now requires an `ELIGIBLE` loan profile and rejects
an amount above `eligibleAmountIrr`. The bank customer number is decrypted only
at the adapter boundary. A `DISBURSED` bank event continues to credit the wallet
exactly once through `bank_loan_wallet_credits` and `wallet_entries`.

### Agency seat order — `AGENCY`

`GET /agency-portal/seat-request-options` returns only future, scheduled,
CEO-approved occurrences that are present in commercial Active Flights and
have an active agency fare release. The client groups these rows by exact flight
number/route/aircraft/cabin/fare class; therefore the month/day boxes for a
flight such as `XY1235` are derived exclusively from the approved Add Flight
occurrences of `XY1235`. `POST /agency-portal/seat-inquiry` is the
reservation source of truth. `POST /agency-portal/seat-requests` additionally
accepts `selectedFlightInstanceIds`; every id must belong to the confirmed
route/class series and have enough live request capacity. `CREDIT` is accepted
only when the active agency credit line covers the server-computed total.

## Channel inventory and message attachments (2026-08-27)

- `PATCH /flights/:instanceId/fare-rules/:ruleId/site-price`
  accepts `priceIrr`, `reason`, and optional `seats`. `seats` is the public-site
  ceiling for that fare class. Site and agency ceilings are independent and
  each may be as high as `FareRule.seatsAllocated`.
- `PUT /flights/:instanceId/fare-rules/:ruleId/channel-release` remains a
  compatibility operation. The Commercial UI uses the independent site-price
  and agency-release endpoints so either channel may be opened or closed alone.
- Public search, price-calendar results, and `POST /bookings` use the remaining
  site release (`siteSeatsReleased - active SYSTEM passengers`) and still obey
  the smaller physical/commercial cabin ceiling. A cabin with no site release
  is omitted from public search.
- Both channels consume the same live reservation inventory. Active public
  holds/sales reduce agency request capacity; active agency allotments reserve
  only their unconsumed remainder from public availability. Flight and fare
  rows are transactionally locked again at booking/allotment activation, so
  simultaneous public and agency attempts cannot oversell the aircraft.
- `POST /agency-portal/seat-inquiry` returns `suggestedSeats` and
  `canFulfillRequested`. If the request exceeds the live agency release,
  `suggestedSeats` is the largest currently orderable quantity. The subsequent
  seat request remains transactionally revalidated.
- Agency inbox messages, employee-to-manager messages, and manager cartable
  messages accept `attachmentIds: string[]`. Every id must belong to the sender.
  Message/history responses resolve those ids to file metadata, and
  `GET /files/:id` authorizes the sender, recipient/assignee, agency participant,
  or staff participant as applicable.
## Commercial channel visibility and sold-seat controls (2026-08-27)

- `GET /flights/:instanceId/commercial-control` returns `publicSaleEnabled`,
  `agencySaleEnabled`, and per fare class `soldSeats`, `siteSoldSeats`, and
  `agencySoldSeats`, plus `sharedSeatsRemaining`, `siteSeatsAvailable`,
  `agencySeatsAvailable`, and `agencySeatsCommitted`. Sold counts are derived
  from paid/ticketed passenger seats; live availability additionally includes
  current holds and active allotments and is never an editable counter.
- `PATCH /flights/:instanceId/sales-visibility` controls public search/sale only.
- `PATCH /flights/:instanceId/agency-sales-visibility` independently controls
  whether an otherwise active and sellable flight is listed in the agency seat
  request catalogue. Disabling it also rejects direct agency inquiries.
- `GET /agency-portal/seat-request-options` and
  `POST /agency-portal/seat-inquiry` apply the agency visibility gate in
  addition to schedule, approval, departure, and sale-window checks.

## Wallet purchase accounting (2026-08-30)

- `POST /bookings/:id/pay` with `paymentMethod=WALLET` debits the immutable
  wallet ledger, transitions the booking to `TICKETED`, and writes the
  booking-linked `SALE` ledger entry inside one database transaction. A
  successful wallet response additionally returns `walletBalanceIrr` so
  persistent clients can replace stale cached balances immediately.
- `GET /my/wallet` returns `{ balanceIrr, entries }`. Each entry contains
  `id`, `type`, `signedAmountIrr`, `bookingId`, optional `pnr`, and `createdAt`.
  Both balance and history are derived from immutable `wallet_entries` rows.

### Purchase integrity and persisted e-tickets (2026-08-31)

- `POST /bookings` rejects duplicate passenger identities on the same flight,
  including identities already present in an active booking. An adjacent EXST
  remains part of the same passenger row.
- `POST /bookings/:id/pay` issues one persisted e-ticket per passenger in the
  same transaction as wallet debit, SALE ledger creation, booking transition,
  and the payment idempotency claim.
- Every booking detail response exposes `passengers[].ticketNo` and
  `passengers[].ticketIssuedAt` after ticketing.
- Purchases performed by an authenticated agency account are attributed to the
  agency channel and appear in its wallet, sales, and finance projections.
- `GET /agency-portal/seat-request-options` includes every live sellable
  cabin/fare class; a missing dedicated agency release makes the requestable
  quantity zero but does not hide the active flight.

## Internal cartable support assignment and agency bulletins (2026-08-28)

### Support-ticket boundary

- `GET /support-tickets`, `GET /support-tickets/:id`, and
  `POST /support-tickets/:id/replies` remain available to staff roles, but
  SITE_ADMIN sees the complete support queue while every other manager or
  employee is server-scoped to `forwardedToId = actor.id`.
- `GET /support-tickets/forward-targets` and
  `PATCH /support-tickets/:id/forward` are SITE_ADMIN-only. Creating a staff-side
  ticket and changing support status are also SITE_ADMIN-only operations.
- Requester replies do not clear the assignee. The exact assignee therefore
  continues the same conversation from the internal cartable after a customer
  or agency follow-up.

### Agency notices — `SITE_ADMIN`

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/agency-bulletins/recipients` | Lists active, non-suspended agency accounts eligible to receive a bulletin. |
| GET | `/agency-bulletins/admin` | Lists persisted notice/amendment dispatch history grouped by dispatch id. |
| POST | `/agency-bulletins/admin` | Sends `NOTICE` or `AMENDMENT` to `ALL` active agencies or an exact validated `SELECTED` recipient list. |

Each target receives an ordinary recipient-owned notification with
`entityType = AGENCY_BULLETIN`; the existing `/notifications` read and read-
receipt endpoints remain the agency delivery API. No audience is inferred in
the browser.

## Requester ticket feedback and agency financial events (2026-08-28)

- `PATCH /my/support-tickets/:id/feedback` accepts `{ satisfied: boolean }`
  only from the authenticated USER or AGENCY that owns an `ANSWERED` ticket.
  A satisfied response closes the ticket. A dissatisfied response reopens the
  same ticket for staff follow-up without changing its tracking code,
  assignee, conversation, or attachments.
- An `ANSWERED` ticket with no requester response for five complete days is
  closed automatically by the support lifecycle worker. Automatic and manual
  feedback transitions are appended to history. Closed tickets remain in
  `/my/support-tickets` and the staff queue and remain searchable by tracking
  code.
- Internal cartable messages continue to accept owned `attachmentIds`. Image
  attachments are returned with MIME metadata and rendered as previews; other
  documents remain downloadable. Manager-message access uses the `cartable`
  panel permission rather than the unrelated support permission.
- `GET /agency-portal/financial-events` returns a newest-first, read-only
  timeline built only from persisted agency invoices, ledger entries, and
  credit requests. Invoice issue/payment, sales, refunds, settlements,
  commissions, commitments, and credit decisions are represented without
  browser-generated or mock rows.
# Public flight-search invariants

- `GET /search/flights` accepts `origin`, `dest`, `date`, and `cabin`. The response contains only flights whose requested cabin is published and currently has capacity; the API does not substitute another cabin.
- `GET /search/price-calendar` and `POST /search/advisory` accept the same cabin and compute alternatives only for that cabin; their cache keys include the cabin.
- Public travel-extra, ancillary-service, and seat-service responses expose localized `titleFa`, `titleAr`, `titleEn`, `descriptionFa`, `descriptionAr`, and `descriptionEn` values when applicable, so checkout does not display Persian fallback content in Arabic/English.
- Booking creation accepts only explicitly selected extras and priced seat selections. The booking snapshot persists localized extra labels; payment and invoice views render those persisted selected rows rather than reconstructing or charging the full service catalog.

## Approved central PSS/CRS contract

This contract is implemented incrementally. Slice 0 provides the independent
service shell and capability endpoint; reservation, inventory and document
endpoints remain disabled until their acceptance slices pass. It replaces
direct website ownership of inventory and reservation writes only after a
reconciled, feature-flagged cutover. All paths below are internal-only unless
explicitly labelled as a partner NDC facade. Every command requires
`Idempotency-Key` and propagates `X-Request-Id`; service-to-service
authentication is mandatory.

### Service control API (Slice 0 implemented)

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | `/health/live` | Internal-network liveness without business or secret data. |
| GET | `/health/ready` | Internal-network readiness with independent PSS database check. |
| GET | `/internal/v1/capabilities` | Authenticated truthful rollout flags; `salesEnabled` remains false before cutover. |
| POST | `/internal/v1/reconciliation/shadow` | Compares a website source-of-truth count snapshot with PSS shadow tables; returns per-metric deltas and always keeps cutover false when schema/data differ. |

The shadow request contains non-negative integer counts for `orders`,
`travellers`, `heldOrders`, `ticketedOrders` and `inventoryTransactions` plus
`capturedAt`. It contains no passenger PII. The response includes the PSS
snapshot, missing-table names, per-metric deltas and `cutoverReady`; missing
tables are discrepancies, never implicit zero agreement.

### Internal offer and availability API

| Method | Path | Behaviour |
| --- | --- | --- |
| POST | `/internal/v1/offers/search` | Returns priced, expiring offers for ordered one-or-more-segment itineraries from authoritative inventory. |
| POST | `/internal/v1/offers/:offerId/reprice` | Revalidates fare, tax, currency and every segment's inventory version immediately before hold/payment. |
| GET | `/internal/v1/flights/:flightInstanceId/seatmap` | Returns PSS-authoritative held/sold/blocked seat state. |

An offer contains `offerId`, `expiresAt`, `currency`, ordered `segments`,
traveller pricing, fare/tax/ancillary breakdown, baggage terms and an opaque
integrity token. An offer is never itself inventory authorization.

### Internal reservation/order API

| Method | Path | Behaviour |
| --- | --- | --- |
| POST | `/internal/v1/orders` | Atomically holds every segment and creates one PNR. |
| GET | `/internal/v1/orders/:reference` | Retrieves by internal id or PNR, including travellers, segments, documents, coupons and servicing history. |
| POST | `/internal/v1/orders/:id/payment-confirmations` | Records a verified external payment reference and fulfils/tickets exactly once. |
| POST | `/internal/v1/orders/:id/cancel` | Cancels an eligible unticketed order and releases all held inventory. |
| POST | `/internal/v1/orders/:id/void` | Voids eligible accountable documents within the configured window. |
| POST | `/internal/v1/orders/:id/refunds/quote` | Quotes full or selected-traveller/segment/document refund without mutation. |
| POST | `/internal/v1/orders/:id/refunds` | Applies an approved quote, coupon states and balanced financial reversal exactly once. |
| POST | `/internal/v1/orders/:id/exchanges/quote` | Prices replacement itinerary and residual/add-collect amount. |
| POST | `/internal/v1/orders/:id/exchanges` | Issues replacement documents and marks prior documents/coupons exchanged atomically. |

Existing `/bookings`, `/manage-booking`, `/reservation` and agency endpoints
remain compatibility facades and must delegate to this API after cutover.

### Accountable document API

| Method | Path | Behaviour |
| --- | --- | --- |
| POST | `/internal/v1/document-stocks` | Loads an approved ticket or EMD stock block; privileged and audited. |
| GET | `/internal/v1/document-stocks` | Returns remaining/consumed/quarantined stock without exposing secrets. |
| GET | `/internal/v1/tickets/:documentNumber` | Returns immutable ticket plus ordered flight coupons. |
| POST | `/internal/v1/emd` | Issues an EMD for an eligible paid ancillary from accountable stock. |
| GET | `/internal/v1/emd/:documentNumber` | Returns EMD document, coupons, associations and lifecycle. |

Production ticket/EMD issuance fails closed when no valid stock block exists.

### Nira integration API

| Method | Path | Behaviour |
| --- | --- | --- |
| POST | `/internal/v1/nira/flights/:id/submissions` | Creates a PNL/ADL/manifest submission from PSS coupon state. |
| GET | `/internal/v1/nira/submissions/:id` | Returns correlation, attempt, acknowledgement and reconciliation status. |
| POST | `/internal/v1/nira/submissions/:id/replay` | Privileged audited replay of retryable/dead-letter submissions. |

Exact payload and acknowledgement DTOs remain blocked until the airline
provides the vendor contract and sandbox.

### NDC 24.1 partner facade

Planned message families are `AirShopping`, `OfferPrice`, `OrderCreate`,
`OrderRetrieve`, `OrderChange` and `OrderCancel`. The facade maps messages to
the internal APIs above and owns no inventory or order state. It must not be
described as certified before named-partner conformance succeeds.
