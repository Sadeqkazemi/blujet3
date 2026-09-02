# Feature: panel flight workflow completion

Design sources:

- `design-reference-v2/پنل مدیر بازرگانی.dc.html`
- `design-reference-v2/پنل مدیر عامل.dc.html`

## Acceptance checklist

> The flight-city and add-flight form redesigns are intentionally deferred by
> product direction. This change does not modify either form.

### Commercial manager -> CEO approval

- [x] Creating a flight definition also creates its initial pricing proposal
      atomically; a later proposal update may refine the proposed rate but is
      not required for CEO visibility.
- [x] A successful submission creates exactly one pending pricing proposal and
      marks the definition `PENDING_CEO` before returning success.
- [x] A failed definition/charge/proposal validation rolls the whole command
      back; no orphan Draft flight is left behind.
- [x] The CEO pending-count and pricing list expose the submitted flight
      immediately from real database data.
- [x] CEO approval/rejection keeps step-up verification and existing audit
      records.

### Role and panel audit

- [x] Every `implemented: true` server sidebar item has a concrete frontend
      route and never falls through to `ComingSoonPage`.
- [x] All eight roles receive only their designed navigation and server-side
      permissions.
- [x] Empty panels show an honest empty state and contain no production
      mock/filler rows.
- [x] User and agency portal navigation remains responsive and role-isolated.

### Verification

- [x] Backend unit/integration tests cover atomic submission, CEO list/count,
      role navigation and unauthorized roles.
- [x] Existing frontend submission tests remain green without changing the
      current form.
- [x] Role navigation audit, typecheck, lint and builds pass.
