# Site admin and finance hardening

## Scope

This release verifies the production-data workflows requested for the site admin and finance panels. No demonstration rows or client-side financial calculations are introduced.

## Acceptance matrix

| Area | Acceptance condition |
| --- | --- |
| Agency and web-service requests | Agency submissions are persisted, visible to authorized staff, and decisions update the originating request. |
| Flights | Site-admin flight views consume the flight APIs and published-flight state. |
| Notifications | The bell contains persisted unread notifications only. Opening an item waits for the read acknowledgement, removes it locally, and therefore decrements the badge. |
| Customer club | Club balances, card requests, rules and history come from club endpoints. |
| Bank loans | Customer and admin loan pages consume the bank-loan workflow; bank decisions and wallet credit remain server-authoritative and idempotent. |
| Refunds | Customer request, site-admin review/referral and finance payment remain one persisted refund lifecycle. |
| Cartable and tickets | Detail views mark items read; transfers and referrals remain recipient-scoped and auditable. |
| Site management | Text, banner/media, footer/social and public settings remain API-backed. |
| Finance | Sales charts use ledger/booking data for day, month, quarter, six-month and year periods; agency settlements and staff reports are server-derived. |
| Public footer | Desktop layout uses the full web grid; the mobile accordion branch is unchanged. |
| Customer login | The shared locale font stack is used, including the bundled variable Vazirmatn font. |

## Regression gates

- Frontend focused component and workflow tests.
- Backend focused E2E suites for reporting, notifications, refunds, support tickets, cartable, loans, club, site content and agencies.
- Frontend and backend production builds.
- Lint on changed files and whitespace validation.
