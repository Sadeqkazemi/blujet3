# Feature: agency support-ticket submission

## Acceptance checklist

- [x] An authenticated `AGENCY` can list, view, and create only its own support tickets through `/my/support-tickets`.
- [x] Tickets created by an agency are stored in the `AGENCY` department queue and carry an agency-specific submission-history entry.
- [x] The agency inbox exposes a localized support-ticket composer with requester name, phone, subject, and message validation.
- [x] A successful submission displays the tracking code, closes the composer, and refreshes the agency's ticket list.
- [x] A failed ticket request does not break the existing commercial-message inbox and displays a localized error.
- [x] Existing customer support-ticket behavior and agency commercial messaging remain unchanged.
- [x] After a staff answer, the requester can mark the answer satisfactory or unsatisfactory; the former closes and the latter reopens the same tracked ticket.
- [x] An answered ticket with no requester activity for five days closes automatically and remains searchable by tracking code.

## Regression coverage

- [x] Frontend component tests cover opening, validating, and successfully submitting an agency support ticket.
- [x] Backend E2E coverage proves that an authenticated agency can create/list its ticket and that it is routed to `dept=AGENCY`.
- [x] Targeted tests, lint, type checks, and production builds pass.
