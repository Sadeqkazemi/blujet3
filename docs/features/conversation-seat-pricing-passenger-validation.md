# Conversation center, seat-type pricing, and deferred passenger validation — acceptance checklist

## Scope

This change covers three related production defects reported on 2026-08-27:

1. customer support, agency inbox, and staff cartable history must use a consistent conversation-oriented design;
2. commercial ancillary prices for the three seat types must affect the public seat picker and the authoritative booking total;
3. passenger fields must not turn red while the customer is still entering data.

## Customer and agency support conversations

- [x] The customer `پیام به پشتیبانی` and agency `صندوق پیام` show status counters for open, in-progress, answered, and closed tickets.
- [x] Each ticket is shown as an independent row/card with subject, tracking code, status, and a view action.
- [x] Opening a ticket shows the initial request, subsequent requester/staff replies, timestamps, and attachments in chronological order.
- [x] An authenticated customer or agency can reply only to a ticket owned by that account.
- [x] A reply can include at most one owned uploaded file; attachment ownership is checked server-side.
- [x] A requester reply moves a non-closed ticket to `OPEN`; a staff reply moves it to `ANSWERED`.
- [x] Closed tickets keep their history and cannot accept a new reply.
- [x] Existing tickets whose history contains only legacy action records still render without data loss.
- [x] Staff cartable history uses the same conversation/timeline visual language and retains existing action controls and attachments.

## Tracking, admin reply, and tenant isolation follow-up

- [x] Customer and agency ticket centers can search their own tickets by tracking code or subject without exposing another account's records.
- [x] The site-admin ticket table search is proven to filter by tracking code, not merely render a search field.
- [x] Opening a ticket in the site-admin panel shows the complete chronological requester/staff conversation and attachments.
- [x] A site admin can write a reply, optionally attach one owned file, send it, and immediately see the updated `ANSWERED` conversation.
- [x] Closed tickets hide/disable the reply composer in both account and admin views.
- [x] Looking up a ticket through `GET /my/support-tickets/:id` returns `404` when the ticket belongs to another customer or agency.
- [x] A round-trip regression covers requester reply → admin reply → requester-visible chronological conversation.

## Seat-type pricing

- [x] The public checkout receives the current enabled commercial seat-service catalogue (`seat-normal`, `seat-legroom`, `seat-window-aisle`).
- [x] A seat is classified deterministically: exit/extra-legroom rows use `seat-legroom`; window/aisle positions use `seat-window-aisle`; other seats use `seat-normal`.
- [x] The seat picker displays the current seat-type catalogue and selected-seat subtotal, and the pricing sidebar includes that subtotal.
- [x] Disabled seat types cannot be selected.
- [x] The booking request sends seat codes only and never trusts a client-supplied seat-type amount.
- [x] The backend reloads current seat-service prices, validates the selected seat codes/types, snapshots the charges, and includes them in `extrasIrr` and the final booking price.
- [x] Changing a seat-type price in the commercial services panel changes a newly created booking total without requiring a deployment.
- [x] The amount shown in checkout is computed from the same live catalogue that the server authoritatively reloads when storing the booking.

## Passenger validation timing

- [x] Typing into any passenger field does not immediately mark untouched or partially entered fields red.
- [x] The primary `تأیید و ادامه` action remains available while the form is incomplete.
- [x] Validation runs when the customer presses `تأیید و ادامه`.
- [x] Missing fields are then marked and the customer remains on the passenger step.
- [x] When all other fields are valid but the Iranian national-ID checksum is invalid, only the national-ID field receives its national-ID validation error.
- [x] Correcting the fields clears their errors and allows checkout to proceed.

## Verification

- [x] Backend support-ticket and booking-pricing unit tests pass.
- [x] Frontend support center, cartable timeline, seat picker, and checkout passenger regression tests pass.
- [x] Frontend and backend lint/build/type-check pass.
- [x] A local RTL smoke test confirms the public shell; authenticated screenshot states are covered by component/API regressions because the local backend fixture was unavailable during browser QA.
- [x] Full frontend suite: 172 files / 891 tests passed with bounded worker concurrency.
- [x] Full backend suite: 83 suites / 304 tests passed.
- [x] Support authorization metadata proves requester routes are limited to `USER|AGENCY` and staff replies to `SITE_ADMIN`.
