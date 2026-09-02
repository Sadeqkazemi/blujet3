# Agency inbox redesign — local acceptance checklist

## Scope

The agency inbox is redesigned as a light, RTL-first message center that fits
the approved agency portal shell. Existing support-ticket and commercial
message APIs remain the only data sources; the UI must not introduce mock
messages, counters, or timestamps.

## Acceptance checklist

- [x] The page clearly separates support tickets from commercial correspondence.
- [x] Each section shows only counters derived from its real API response.
- [x] Support status cards are interactive filters and can be toggled back to all tickets.
- [x] Ticket search continues to work by tracking code and subject.
- [x] Ticket details show chronological messages, timestamps, status, and attachments.
- [x] The agency can create a support ticket and reply with an optional attachment.
- [x] Commercial messages render as a responsive master-detail conversation layout.
- [x] The agency can reply to a commercial message with an optional attachment.
- [x] Empty, loading, validation, and API error states use the light agency palette.
- [x] Persian/Arabic remain RTL, English remains LTR, and all existing translations stay available.
- [x] The redesign is responsive on desktop and mobile without horizontal overflow.
- [x] Focused component tests, frontend lint/type-check, and production build pass.
- [ ] A local authenticated browser smoke test confirms the agency inbox layout and interactions.

## Delivery boundary

This change is intentionally local-only. It must not be merged or deployed
until the user reviews and approves the local result.
