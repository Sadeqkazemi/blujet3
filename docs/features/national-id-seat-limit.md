# National ID seat limit — acceptance checklist

Rule: on one flight, a given Iranian national ID may identify at most **one
passenger**. Repeating the same personal information in a second passenger row
is forbidden. One adjacent EXST may still be attached to that passenger; it is
not another passenger and does not produce another ticket.

## Backend
- [ ] In-request: a duplicate passenger national ID → `400 VALIDATION_FAILED`
      — `national-id-seat-limit.spec.ts`
- [x] Infants (no seat) do not count — `national-id-seat-limit.spec.ts`
- [x] Cross-booking on same `flightInstanceId` (active DRAFT/HELD/PAID/TICKETED) counted via `nationalIdHash` — `assertNationalIdSeatLimitForFlight` in `booking.service` (public + agency allotment)
- [x] Enforced inside booking transaction after flight row lock
- [ ] An adjacent EXST is allowed for the single passenger and is ignored by
      passenger-identity uniqueness checks.
- [x] Expired HELD bookings do not consume the limit

## Frontend
- [ ] Checkout blocks step advance / submit when the same national ID appears
      in more than one passenger row — `CheckoutPage` +
      `national-id-seat-limit.ts`
- [x] Guest checkout validates missing/invalid identity fields before opening
  the OTP dialog and shows a localized inline error on the exact field
