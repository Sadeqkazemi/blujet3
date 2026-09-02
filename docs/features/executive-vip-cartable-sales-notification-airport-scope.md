# Executive VIP, cartable history, sales controls and public scoping

## Acceptance checklist

- [x] CEO, board chair and senior manager can add a VIP customer manually.
- [x] CEO, board chair and senior manager can deactivate a VIP customer after confirmation; deleting VIP membership is not available and the action is audited.
- [x] Every generic cartable detail shows the chronological message/decision history returned by the API.
- [x] Flight workflow cartables show the existing workflow notes/history alongside the pending decision.
- [x] Agency seat release controls live under **Flight details → Information and sales**, not under the Agency tab.
- [x] Agency/customer notification APIs return only notifications whose domain is allowed for the authenticated audience, in addition to enforcing recipient ownership.
- [x] Customer and agency public headers never mix management-panel notifications into their notification list or count.
- [x] Domestic search shows Iranian airports only.
- [x] International search shows Iranian international airports and all foreign airports, excluding Iranian domestic-only airports.
- [x] The user profile/header does not display the Silver (`نقره‌ای`) label.
- [x] Agency seat allocation never exposes free/requestable inventory figures; availability is still validated server-side during inquiry and purchase.

## Notes

- Notification audience filtering is enforced on the backend. Frontend filtering is only a second presentation guard.
- Airport classification uses the persisted `isInternational` foreign-airport flag. Iranian international airports are identified by the catalog's international airport name so manually activated catalog records continue to work without a second source of truth.
- Deactivating a VIP membership suspends all club benefits while preserving the underlying customer account, bookings, wallet, points, card requests and audit records. A later manual add with the same national ID reactivates that same membership instead of creating a duplicate.
