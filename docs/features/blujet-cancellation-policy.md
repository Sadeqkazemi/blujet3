# BluJet cancellation policy

This policy is the approved source for customer and Core refund quotes. It is
stored in `payments.refund_penalty_rules` and is applied server-side using
integer IRR arithmetic.

## Acceptance checklist

- [x] More than 72 hours before departure applies a 30% penalty; 24 through 72
      hours applies 50%; 12 through (but not including) 24 hours applies 70%; below 12 hours or
      after departure is non-refundable (`backend/src/modules/refunds/penalty.spec.ts`).
- [x] A cancellation made within 24 hours of purchase uses the 30% bracket
      when at least 12 hours remain; the departure-time policy still wins below
      that safety window (`backend/test/customer-account-refunds.e2e-spec.ts`,
      `backend/src/modules/pss/core-itinerary-refund.service.spec.ts`).
- [x] The customer refund API reads the persisted rules and rejects a request
      below the 12-hour threshold (`backend/test/customer-account-refunds.e2e-spec.ts`).
- [x] Existing rule rows are aligned by an additive, reversible migration;
      no financial rows or refund history are deleted
      (`1791475200000-BluJetCancellationPolicy`).
- [x] The public site rule default states the same percentages and the maximum
      seven-business-day Finance payout window (`settings.service.ts`).

The exact handling of Void, partial coupon servicing and exchange remains a
separate phase; this policy defines cancellation/refund eligibility only.
