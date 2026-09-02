# Feature: کیف پول (top-up) و قفل قیمت هوشمند — frontend closure (Phase 34)

Scope note: this doc covers only the **wallet top-up** and **price-lock**
slice of the public-site customer track. The wider public-site feature set
(search, seat/passenger checkout, payment, e-ticket, GDPR, refunds, promo
codes, club points) predates this doc and has no `docs/features/*.md`
acceptance checklist of its own — that is pre-existing documentation debt
from whichever earlier phase first shipped it, not introduced or fixed
here; closing it fully is a separate, larger task.

Backend for both wallet and price-lock (`backend/src/modules/booking-engine/
wallet.service.ts`, `price-lock.service.ts`, `wallet-points-lock.controller.ts`)
already existed and was already e2e-tested (`backend/test/purchase-extras
.e2e-spec.ts`). What this phase closes:

- **Wallet top-up UI** turned out to already exist (`AccountPage.tsx`'s
  کیف پول tab) — contradicting a stale `PLAN.md` note that called it
  missing. Found and fixed one real bug in it (see below); no new UI
  needed beyond that fix.
- **Price-lock UI** was genuinely missing entirely. The only trace was a
  "🔒 قفل قیمت" button on `ResultsPage.tsx`'s **mock/demo** flight cards
  (`MOCK_FLIGHTS`) — it never called any of the three real endpoints, and
  opened a dead-end modal with no path back to a real booking.

## What was built

- **`GET /my/price-locks`** (`price-lock.service.ts`'s `listMine`) now
  joins and returns `flight: { flightNo, originCode, destCode,
  departureAt }` alongside the existing raw fields — additive, no schema
  change (existing `FlightInstance → Flight → Route` relations only).
  Needed because the previous raw-ids-only shape gave the frontend no way
  to show a customer which flight a lock belongs to (the exact same
  "resolve raw ids into displayable metadata" pattern as Phase 29's
  referral-attachment fix).
- **`Booking.isPriceLocked`** (new field on every `toDetail()` response —
  `GET /bookings/:id`, `GET /bookings/me`, `POST /bookings`, `POST
  /bookings/:id/pay`'s embedded booking, `POST /manage-booking/lookup`)
  — `true` when the booking consumed an active price lock. Needed so the
  frontend can show "این رزرو با قیمت قفل‌شده انجام شده" instead of the
  lock being invisible after checkout.
  - **Bug found and fixed while wiring this**: `BookingService
    .createBooking()`'s `booking` object is fetched (with the `priceLock`
    relation included) **before** the same transaction's
    `tx.priceLock.updateMany(...)` claims the lock — so a naive
    `!!booking.priceLock` read a stale pre-claim snapshot and was always
    `false` for a booking that had, in fact, just consumed a lock. Caught
    by this phase's own e2e test (`purchase-extras.e2e-spec.ts`: "a
    booking created against an active lock is flagged isPriceLocked").
    Fixed by using the already-resolved `usableLock` variable (known
    before the transaction starts) to set the flag directly, rather than
    trusting the stale relation snapshot.
- **`frontend/src/api/publicSite.ts`**: `fetchMyPriceLocks()`,
  `createPriceLock(flightInstanceId, cabin)`, `cancelPriceLock(id)`.
- **`AccountPage.tsx`**: new «قفل قیمت» tab — lists the customer's locks
  (route, flight number, Jalali departure, locked price, fee, status,
  expiry), lets them cancel an `ACTIVE` one. Trips tab now shows a
  «🔒 قیمت قفل‌شده» badge on a booking with `isPriceLocked: true`.
  - **Bug found and fixed while wiring this**: `onTopup`'s existing
    handler used `Number(topupAmount) * 10` directly instead of the
    shared `parseTomanToRial` helper — every other money-input field in
    the codebase goes through that helper specifically to handle Persian
    digits and `٬` separators; typing an amount with Persian digits (as
    the field's own placeholder — «مثلاً ۵۰۰۰۰۰» — invites) silently
    produced `NaN` (`Number('۵۰۰۰۰۰')` is `NaN`), which then failed the
    `!amountToman` guard with a generic Persian error rather than
    actually charging the wrong amount — not a money-safety bug, but a
    real, silently-broken input path. Fixed by routing through
    `parseTomanToRial`, matching every other amount field.
- **`ResultsPage.tsx`**: the real (bookable) result cards now have their
  own «🔒 قفل قیمت» button per cabin, separate from the untouched
  mock-card button. Click behavior:
  - Not signed in → redirected to `/signin`, remembering the exact search
    (`state: { from: '/results?<query>' }`), same redirect-then-return
    pattern as `AccountPage.tsx`.
  - Signed in, not gold/platinum tier → an info modal directing to
    `/club` (mirrors the existing mock modal's copy/behavior, now
    reachable from a real, working button).
  - Signed in, gold/platinum tier → calls `POST /my/price-locks`
    directly (no separate confirm step — locking is free to attempt and
    the price is deterministic) and shows the real locked price, fee, and
    expiry on success, or the backend's own Persian error message
    (e.g. an already-active lock for that flight+cabin) on failure.

## Price-lock fee charging (updated 2026-08-20)

`PriceLockService.create()` computes `feeIrr` (flat 3% of the live cabin
price) and **debits the member wallet** inside the same transaction
(`WalletEntry` type `PURCHASE`, `bookingId=null`, `feeCharged=true`).
Cancel refunds the fee via `TOPUP` when `feeCharged` is true. Insufficient
wallet balance returns 409.

## Acceptance checklist

Proven by `backend/test/purchase-extras.e2e-spec.ts` (2 new tests) and
`frontend/src/features/public-site/{AccountPage,ResultsPage}.test.tsx`
(4 + 4 new tests).

- [x] `GET /my/price-locks` returns each lock's flight route/number/Jalali
      departure alongside its own fields — `purchase-extras.e2e-spec.ts:
      'GET /my/price-locks includes the locked flight route/number/departure, not just raw ids'`
- [x] A booking created against an active lock is `isPriceLocked: true`;
      an ordinary booking is `false` — `purchase-extras.e2e-spec.ts:
      'a booking created against an active lock is flagged isPriceLocked; an ordinary booking is not'`
- [x] AccountPage's قفل قیمت tab lists a real lock (route, price, fee,
      status, expiry) and can cancel an active one —
      `AccountPage.test.tsx: 'switches to the price-locks tab...'` +
      `'cancelling an active price lock updates its status in place'`
- [x] A trip that used a lock shows the «🔒 قیمت قفل‌شده» badge —
      `AccountPage.test.tsx: 'shows the price-locked badge on a trip whose booking used a lock'`
- [x] Wallet top-up converts Persian-digit توman input correctly (the
      fixed bug) — `AccountPage.test.tsx: 'tops up the wallet using
      Persian-digit input...'`
- [x] An unauthenticated visitor clicking the real lock button is
      redirected to `/signin`, remembering the search —
      `ResultsPage.test.tsx: 'redirects an unauthenticated visitor to /signin, remembering the search'`
- [x] A signed-in non-gold customer sees the club-membership notice
      without any API call — `ResultsPage.test.tsx: 'shows the
      club-membership notice for an authenticated non-gold customer, without calling the API'`
- [x] A signed-in gold-tier customer locking a real cabin sees the real
      locked price/fee/expiry — `ResultsPage.test.tsx: 'a gold-tier
      customer locking a real cabin sees the locked price, fee, and expiry'`
- [x] A failed lock attempt (e.g. already active) surfaces the backend's
      Persian error message — `ResultsPage.test.tsx: 'shows the server
      error message when locking fails...'`

### Deferred (documented, not dropped)
- Lock-fee charging mechanism (see ⚑ above) — needs a product decision.
- A "top up enough to cover this purchase" inline deep-link from
  `CheckoutPage`'s wallet payment option when the balance is insufficient
  — a small UX polish item, not a missing feature (the core top-up flow
  works standalone via the کیف پول tab).
- Backfilling `docs/features/<name>.md` for the rest of the public-site
  track (search/checkout/payment/e-ticket/GDPR/refunds/promo/club) — a
  separate, larger documentation-debt task, out of scope here.
