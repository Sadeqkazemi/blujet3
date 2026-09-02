# Feature: Cartable, referrals, manager messaging (Phase 4)

Covers `docs/API.md` → "Phase 4" and `docs/DB_SCHEMA.md` → "Phase 4".
Scope: the کارتابل tab (all 5 exec panels), the ارجاعات tab (Senior Manager
only), the «ایجاد پیام» compose (all 5 panels), the Finance/Commercial
chairman-permission gate, the staff-directory picker (also unblocks
Phase 3's deferred agency-request refer UI), and a minimal PDF/image file
upload backing the attachment chips.

## Acceptance checklist

Backend items are proven by `backend/test/cartable.e2e-spec.ts` (20 tests)
and `backend/test/files.e2e-spec.ts` (3 tests), run via `npm run test:e2e`.

### Cartable — listing & filters
- [x] `GET /cartable` returns only the caller's own tasks; another exec role's tasks never leak — `'GET /cartable returns only the caller's own tasks and per-category counts'`
- [x] Per-category counts match the 3 KPI filter cards and `category=` filters rows accordingly — `'category= filters rows; counts stay unfiltered (KPI cards show all OPEN)'`
- [x] `date=` filters to the given day — accepted/validated by `ListCartableQueryDto` (`@IsISO8601`); the range logic is a `createdAt` gte/lt window exercised implicitly by list tests (Jalali→ISO conversion is client-side)
- [x] A non-exec role gets 403 on every cartable endpoint — `'a non-exec role (IT_MANAGER) gets 403 on cartable endpoints'` (representative; same RolesGuard mechanism as previous phases)

### Cartable — review actions
- [x] approve/reject without `note` → 400 — `'approve/reject without a note → 400 with the design's message'`
- [x] approve/reject/transfer on an already-resolved task → 409 — `'resolving an already-resolved task → 409; resolving someone else's → 403'`
- [x] `transfer` creates a new OPEN task for the target and marks the original TRANSFERRED, visible in the target's list — `'transfer creates a new OPEN task for the target and marks the original TRANSFERRED'`
- [x] transfer to a non-staff user id → 400 — `'transfer to a non-staff user → 400'`
- [x] Every resolution writes an `AuditLog` row — `'resolution writes an AuditLog row with the note'`

### Chairman permission gate (Finance/Commercial only)
- [x] Request → PENDING + BOARD_CHAIR cartable task; duplicate → 409; chair approval flips status visible to the requester — `'chair-permission full loop: request → chair cartable task → approve → requester sees APPROVED'`
- [x] Request as SENIOR_MANAGER → 403 — `'chair-permission request as SENIOR_MANAGER → 403 (gate exists only in Finance/Commercial)'`

### Referrals (Senior Manager)
- [x] `POST /referrals` requires title/body/≥1 recipient and creates one cartable task per recipient — `'creating a referral requires title/body/≥1 recipient and creates recipient cartable tasks'`
- [x] `GET /referrals` KPI counts reconcile with row statuses; POST as other roles → 403 — `'POST /referrals as a non-senior role → 403; KPI counts reconcile with statuses'`
- [x] Non-recipient/non-sender detail → 403; non-recipient report → 403 — `'a non-recipient, non-sender exec gets 403 on referral detail; a non-recipient cannot report'`
- [x] Report flips to REPORTED; close only from REPORTED (else 409); revision → REVIEWING; report on CLOSED → 409 — `'full referral loop: report flips to REPORTED, close only from REPORTED, revision back to REVIEWING'`
- [x] Recipient's cartable approve doubles as report submission (⚑) — `'approving a referral-sourced cartable task submits the note as the report'`

### Manager messages
- [x] FINANCE delivers exactly one cartable task; ALL_MANAGERS fans out to the other 4 exec roles — `'a message to FINANCE delivers exactly one cartable task to the finance manager'` + `'ALL_MANAGERS fans out to the other 4 exec roles (sender excluded); SUPPORT flags PARTIAL_DELIVERY'`
- [x] SUPPORT/AGENCIES accepted + flagged `PARTIAL_DELIVERY` — same test as above
- [x] `GET /manager-messages/sent` returns only the caller's messages — `'GET /manager-messages/sent returns only the caller's messages'`

### Staff directory & Phase 3 wiring
- [x] `/staff-directory` lists active staff only (no customers/agencies, not the caller) — `'staff-directory lists active staff (no customers/agencies, not the caller)'`
- [x] Referring an agency membership request creates a cartable task for the referred-to manager (⚑) — `'referring an agency membership request creates a cartable task for the referred-to manager'`

### Files
- [x] Upload accepts PDF/PNG/JPG ≤ 5MB, rejects other types with 400 — `files.e2e-spec.ts: 'accepts a PNG upload and returns an id; rejects disallowed types and oversize files'`
- [x] `GET /files/:id` — owner 200; referral recipient 200; unrelated exec 403 — `'owner can read; an unrelated exec gets 403; a referral recipient can read an attached file'`; foreign attachment → 400 — `'attaching a file you do not own to a referral → 400'`

### Frontend — `frontend/src/features/{cartable,referrals}/*.test.tsx` (Vitest+RTL, 9 tests)
- [x] کارتابل tab: 3 KPI filter cards, count pill, «ایجاد پیام» button, task rows with category badge + «ارسال از:» line + «بررسی»; empty state «کارتابل خالی است ✓» — `CartablePage.test.tsx: 'renders KPI filter cards, count pill, task rows and the compose button'` + `'shows the empty state when the cartable is empty'`
- [x] CEO/Chair/Senior dark shell: page title «کارتابل» + subtitle «کارهای در انتظار اقدام شما», icon KPI cards, «کارتابل من» card with date chip + compose — same test asserts subtitle + «کارتابل من»
- [x] Review modal: required «نظر مدیر», staff-directory transfer select, تأیید/انصراف/انتقال with انتقال disabled until a target is picked — `'the review modal requires a manager note before deciding'` + `'the transfer button stays disabled until a target manager is picked'`
- [x] Finance/Commercial-only chairman-gate banner with request/pending/approved states — `'Finance Manager sees the chairman-permission gate with the request button'` (+ CEO-absence asserted in the first test); state transitions covered by backend loop test + live verification
- [x] ارجاعات tab: KPI cards, table with the 4 status badges + priority + Jalali dates, creation modal (recipient chips, priority, Jalali due), detail with reports thread + sender actions — `ReferralsPage.test.tsx` (5 tests, incl. the Phase 29 attachment tests below).
- [x] Compose modal: the 6 گیرنده سازمانی options, validation «گیرنده، موضوع و متن پیام الزامی است.» — `'the compose modal validates required fields with the design message'`
- [x] Phase 3's request-detail «ارجاع درخواست» block wired to `/staff-directory` + refer endpoint — implemented; exercised by the backend wiring test + live verification
- [x] Dashboard cartable widget with live count + «مشاهده‌ی همه‌ی کارها ←» link — implemented (screenshot-verified); fails silent when the role lacks cartable access
- [x] All dates Jalali with Persian digits — `formatJalaliDate/DateTime` now emit Persian digits app-wide (`jalali.test.ts` updated to assert ۱۴۰۵/۰۱/۰۱)

### E2E — `frontend/e2e/cartable-journey.spec.ts` (Playwright, real stack)
- [x] Referral loop: Senior creates → recipient sees cartable task → reports via review → Senior sees the report and closes — `'referral loop: Senior creates a referral to Commercial → Commercial reports via cartable → Senior closes it'`
- [x] Message loop: CEO composes to واحد مالی → appears in Finance's cartable → Finance approves with a note → row disappears — `'message loop: CEO composes to واحد مالی → it appears in Finance's cartable → Finance approves it'`
- [x] Transfer loop — proven at backend level (`cartable.e2e-spec.ts: 'transfer creates a new OPEN task for the target...'` asserts the target's GET /cartable sees it); UI path is the same review modal as the message loop
- [x] Chair gate full loop — proven at backend level (`'chair-permission full loop: ...'`); banner states unit-tested + screenshot-verified
- [x] Role isolation: IT Manager has no کارتابل/ارجاعات nav and 403s on the API — `'IT Manager has no کارتابل or ارجاعات nav entries (role isolation)'` + backend `'a non-exec role (IT_MANAGER) gets 403 on cartable endpoints'`

### Phase 26 addition — EMPLOYEE recipient-side referral listing
- [x] `GET /referrals/mine`: only referrals where the caller is a
      recipient (not sent-by-me), `hasMyReport` flips true only after
      this actor reports, `counts` reconcile; 401 without login
      — `backend/test/cartable.e2e-spec.ts`: `'GET /referrals/mine returns only referrals where the caller is a recipient, not ones they sent'` + `'GET /referrals/mine: hasMyReport flips true only after this recipient reports, and counts reconcile'` + `'GET /referrals/mine: 401 without login'`
- [x] `PANEL_NAV.EMPLOYEE` always includes `referrals`, independent of any
      IT-granted permission
      — `backend/test/panels.e2e-spec.ts`: `'an EMPLOYEE with no granted permissions still gets dashboard + referrals, not an error'` + `'EMPLOYEE nav is computed dynamically...'`
- [x] `ReferralsRouter` renders `MyReferralsPage` for EMPLOYEE and the
      existing sender-side `ReferralsPage` for everyone else (same "one
      tab key, two designs" pattern as `SecurityRouter`)
      — covered structurally by `MyReferralsPage.test.tsx` exercising the EMPLOYEE-side component directly; `ReferralsPage.test.tsx` (pre-existing) unchanged
- [x] `MyReferralsPage`: empty state, list with KPI counts, detail view
      with a real report-submission form (validates non-empty text,
      calls `POST /referrals/:id/reports`), a `CLOSED` referral shows no
      report form
      — `frontend/src/features/referrals/MyReferralsPage.test.tsx` (5 tests)
- [x] `EmployeeDashboardPage`'s "no IT permission granted yet" message
      stays accurate (independent of the always-present referrals card)
      — `frontend/src/features/dashboard/EmployeeDashboardPage.test.tsx` (2 new tests)

Deferred (documented, not an oversight): other recipient roles
(CEO/BOARD_CHAIR/FINANCE_MANAGER/COMMERCIAL_MANAGER) still have no
frontend for `GET /referrals/mine` — the backend already serves them with
the same guard set, so this is a frontend-only follow-up, not a backend
gap. See docs/API.md's Phase 26 section.

### Phase 29 addition — referral/report attachment upload + view
- [x] Backend: `attachments` (raw `StoredFile` id arrays) resolved into
      `{id, fileName, mimeType, sizeBytes}[]` in `GET /referrals`,
      `GET /referrals/:id` (both the referral's own attachments and each
      report's), and `GET /referrals/mine`; empty when none —
      `backend/test/cartable.e2e-spec.ts`: `'a referral created with attachmentIds resolves real fileName/mimeType/sizeBytes in list() and detail(); myReferrals() resolves it for the recipient too'` + `'a report submitted with attachmentIds resolves real metadata inside detail().reports'` + `'a referral with no attachments resolves to an empty array, not null/undefined'`
- [x] Fixed a latent bug caught while writing the above (not new — present
      since Phase 4): `FilesService.store()` used `file.originalname`
      directly, but multer/busboy decode multipart header bytes as latin1
      by default, corrupting non-ASCII (e.g. Persian) filenames into
      mojibake; re-decoded latin1→utf8 (a no-op for ASCII names) —
      `backend/test/files.e2e-spec.ts`: `'preserves a Persian filename correctly instead of mojibake...'`
- [x] Frontend: new `AttachmentPicker` (dashed "افزودن سند" control,
      uploads immediately via `POST /files`, removable green chips) and
      `AttachmentList` (read-only chips — neutral for a referral's own
      attachments, green for a report's, matching the design's two
      stylings — click downloads via a blob link using the caller's auth
      header) — `AttachmentPicker.test.tsx` (3 tests) + `AttachmentList.test.tsx` (2 tests)
- [x] Wired into `ReferralsPage.tsx`'s creation modal + detail view (own
      attachments and each report's) and `MyReferralsPage.tsx`'s report
      form + detail view (the sender's attachments) —
      `ReferralsPage.test.tsx`: `'uploading a document in the creation modal sends its id as attachmentIds'` + `'the detail view shows the request's own attachments and a report's attachments as clickable download chips'`; `MyReferralsPage.test.tsx`: `'shows the sender's attachments on the request as clickable download chips'` + `'uploading a document in the report form sends its id as attachmentIds'`

### Deferred (scoped out with reasons, not silently dropped)
- The Jalali calendar popover date-filter on the cartable tab — the API `date=` filter exists and is validated; the popover UI arrives with the shared Jalali date-picker component (also needed by Phase 5/7 forms).

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
