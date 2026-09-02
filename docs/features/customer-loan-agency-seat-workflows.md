# Customer loan eligibility and agency seat-order workflows

## Customer loan and credit

- [ ] A USER can declare whether they are already a Saman Bank customer.
- [ ] A bank customer enters a customer number before credit assessment; the
      number is encrypted at rest and only a masked suffix is returned to the UI.
- [ ] A non-customer can submit an account-opening request, poll its real bank
      status, and continue only after the bank returns a customer number.
- [ ] Credit assessment is submitted to the configured bank adapter and may be
      refreshed without inventing a local decision.
- [ ] While account opening or credit assessment is pending, later controls are
      disabled and the current stage is visible.
- [ ] The requested loan amount is enabled only after the bank returns an
      eligible IRR limit, and cannot exceed that limit.
- [ ] A bank `DISBURSED` result credits the customer wallet once through the
      existing immutable wallet/loan-credit ledgers.
- [ ] Ownership, validation, retry and idempotency failures have regression
      coverage.

## Agency allocated-seat ordering

- [x] Published flight information is read-only; the initial editable control
      is the requested seat count.
- [x] Capacity is confirmed only from the reservation inquiry endpoint.
- [x] Day and month selection is revealed only after inquiry confirmation.
- [x] Active flight days are blue, agency-selected days are green, and inactive
      days stay disabled.
- [x] Actual active calendar months are shown as month boxes; selecting a month
      filters the occurrence list used by the order.
- [x] The only source for those month/day boxes is the occurrence list created
      by Add Flight and admitted to Active Flights after CEO approval. All
      occurrences are grouped by exact flight number, route, aircraft, cabin
      and fare class; for example, selecting `XY1235` can never show a date
      belonging to another flight number.
- [ ] The order summary lists every selected occurrence and the server-computed
      total before submission.
- [ ] Cash/invoice payment is available; credit payment is enabled only when an
      active agency credit line covers the order total.
- [ ] After submission the created order is reloaded and shown immediately in
      the agency request list.
- [ ] The server rejects unconfirmed/mismatched occurrences and insufficient
      agency credit regardless of the UI state.
