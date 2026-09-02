# Agency inquiry, commercial sales controls, and employee access

## Acceptance checklist

### Agency seat inquiry

- [ ] The inquiry confirmation button is enabled only when the requested seat count is less than or equal to the server-reported available count.
- [ ] An over-capacity inquiry stays red, explains the currently available count, and cannot be confirmed or submitted.
- [ ] Changing the requested count invalidates any older confirmation/result until the latest inquiry completes.

### Commercial flight details

- [ ] `GET /flights/:instanceId/commercial-control` returns the independent public-site and agency visibility flags.
- [ ] Each fare class returns total sold seats plus sold-on-site and sold-by-agency counts derived from paid/ticketed bookings.
- [ ] The public-site release card shows the sold-on-site count.
- [ ] The agency release card shows the sold-by-agency count.
- [ ] `PATCH /flights/:instanceId/agency-sales-visibility` enables/disables agency catalogue visibility without changing public-site visibility.
- [ ] A disabled agency visibility flag removes the flight from agency seat options and rejects direct inquiry.

### IT employee permissions

- [ ] The commercial catalog exposes separate read, public-sale, agency-sale, and agency-allotment permissions while preserving legacy grants.
- [ ] The finance catalog exposes separate dashboard, recent-transactions, settlements, invoice, credit, refund, and report/export permissions.
- [ ] New permissions appear in the employee navigation mapping and include the minimum read prerequisites.
- [ ] Employee API guards accept the new narrow permission keys and continue to accept the legacy umbrella keys.

### Verification

- [x] Backend unit and E2E coverage passes.
- [x] Frontend component tests pass.
- [x] Backend/frontend build, typecheck, and read-only lint pass.
- [x] Manual customer journey: purchase attempt and airline support ticket with attachment.
- [x] Manual agency journey: seat allocation inquiry, ticket purchase, API request, and message with attachment.
