# Feature: Refunds — finance approval & payout (Phase 7)

Covers `docs/API.md` → "Phase 7" and `docs/DB_SCHEMA.md` → "Phase 7".
Scope: the Finance Manager's استرداد بلیط tab (review/refer/pay). Customer
submission and site-admin referral live in their own tracks.

## Acceptance checklist

### Backend — listing & detail
- [x] `GET /refunds` returns the request cards + the 3 KPI counts and they reconcile with row statuses
      — `backend/test/refunds.e2e-spec.ts` › "GET /refunds returns the cards + reconciling KPI counts; PII never in the list"
- [x] `GET /refunds/:id` returns the passenger/account panel with the شبا (decrypted for this surface), flight info, and the penalty breakdown; PII columns are encrypted in the DB (verified by reading the row)
      — `backend/test/refunds.e2e-spec.ts` › "detail decrypts the شبا for the finance surface; the DB row stays encrypted"
- [x] Every endpoint 403s for non-FINANCE_MANAGER roles (CEO, Commercial, IT)
      — `backend/test/refunds.e2e-spec.ts` › "every endpoint 403s for non-finance roles"

### Backend — penalty engine
- [x] `computePenalty(hoursLeft)` unit tests: ≥72h→30٪, 24–72h→50٪, 3–24h→70٪, <3h→100٪, boundary values (exactly 72/24/3), and refundable = totalPaid − penalty
      — `backend/src/modules/refunds/penalty.spec.ts` (all cases incl. boundaries + rounding)
- [x] Rules are seeded from `RefundPenaltyRule` (server-side source of truth) — not hardcoded in the handler
      — `backend/prisma/seed.ts` Phase 7 block; `refunds.service.ts` reads `refundPenaltyRule.findMany()` (exercised by `createTestRequest` in the E2E journey)

### Backend — refer & pay
- [x] `refer {assigneeId}` sets the assignee + appends the design's history label, does NOT change status, audited; non-staff assignee → 400
      — `backend/test/refunds.e2e-spec.ts` › "refer sets the assignee + history WITHOUT changing status; non-staff assignee → 400"
- [x] `pay` from FINANCE: one transaction — `LedgerEntry(type=REFUND, −refundableIrr)`, `Booking.status=REFUNDED`, request PAID + processedBy/paidAt + history, `AuditLog(category=REFUND)`
      — `backend/test/refunds.e2e-spec.ts` › "pay is transactional: ledger REFUND row + booking REFUNDED + PAID with processedBy; audited"
- [x] `pay` on SUBMITTED/REVIEW → 409 («در انتظار ادمین»); double-pay → 409 with exactly ONE ledger row (idempotency assertion)
      — `backend/test/refunds.e2e-spec.ts` › "pay on SUBMITTED → 409 «در انتظار ادمین»; double-pay → 409 with exactly ONE ledger row"
- [x] The ledger stays consistent: sum of REFUND entries equals the sum of refundable amounts of PAID requests
      — `backend/test/refunds.e2e-spec.ts` › "the ledger reconciles: sum of REFUND entries equals the paid requests' refundable totals"

### Frontend (Finance panel)
- [x] Tab header with the «{n} در صف پرداخت» pill; 3 KPI cards (در صف پرداخت / پرداخت‌شده / در انتظار بررسی ادمین)
      — `frontend/src/features/refunds/RefundsPage.test.tsx` › "renders KPI cards, Persian-digit amounts and a status pill + action per row state"
- [x] Card list: passenger + ticket id (LTR mono) + route + «ارجاع به:» line + شماره پرواز + مبلغ قابل پرداخت + status pills (ثبت مشتری / بررسی ادمین / آمادهٔ پرداخت / پرداخت شد); «تأیید و پرداخت» only on FINANCE rows, «در انتظار ادمین» static otherwise; empty state «درخواست استردادی ثبت نشده است.»
      — `RefundsPage.test.tsx` › "renders KPI cards, Persian-digit amounts and a status pill + action per row state" + "shows the empty state when no requests exist"
- [x] Detail modal: the three panels (اطلاعات مسافر و حساب / اطلاعات پرواز / مبالغ), «درصد جریمهٔ کنسلی» in red + «مبلغ نهایی قابل پرداخت» in green, refer select fed by /staff-directory with «ثبت و انتقال فرآیند ارجاع», pay button «تأیید، واریز به شبا و بستن پرونده», paid banner «پرداخت شد و پرونده بسته است ✓» (no timeline in this modal — per design)
      — `RefundsPage.test.tsx` › "opening a card shows passenger/account info (شبا), flight info and the penalty breakdown" + "refer requires picking a staffer…" + "paying from the modal…" + "a PAID detail shows the closed-case banner instead of refer/pay actions"
- [x] Money via `faMoney`, dates Jalali, شبا rendered LTR mono
      — `RefundsPage.test.tsx` (asserts ۲٬۱۰۰٬۰۰۰/−۹۰۰٬۰۰۰ toman renderings and the IBAN string; LTR/mono classes in `RefundsPage.tsx`)

### E2E
- [x] Full loop: seeded FINANCE request → finance manager opens the modal → refers to a finance staffer (assignee line appears) → pays → status flips to پرداخت شد, KPI counts update
      — `frontend/e2e/refunds-journey.spec.ts` › "finance journey: KPI cards → detail (شبا + penalty breakdown) → refer → pay → closed case"
- [x] Paying an already-paid request is impossible from the UI (button gone) and the API refuses a replay
      — UI: same E2E journey (reopened modal has no pay/refer buttons); API replay: `backend/test/refunds.e2e-spec.ts` › "…double-pay → 409 with exactly ONE ledger row"
- [x] Role isolation: Commercial Manager has no استرداد بلیط nav entry
      — `frontend/e2e/refunds-journey.spec.ts` › "Commercial Manager gets no refunds surface (role isolation)"

---

Mark each item with its proving test file/name once implemented. Per
`CLAUDE.md`: unchecked items = feature not done.
