# Passenger fares and checkout hardening

## Scope

- Preserve adult, child and infant counts from search through results, checkout, payment and ticketing.
- Price each passenger on every leg using their age on that leg's departure date.
- Keep public inventory and agency/charter commitments capacity-safe.
- Reuse the existing guest login dialog and the canonical checkout/payment flow.
- Do not change the Operations Manager panel or the MD-80 seat layout.

## Fare rules

- Adult: 100% of the resolved cabin fare.
- Infant under 2: 10% of the adult fare, no seat.
- Child from 2 through 11: 50% for SYSTEM inventory and 100% for CHARTER inventory.
- A passenger who is 12 or older on departure is an adult.
- A round trip classifies and prices passengers independently for each leg.
- One adult may accompany one lap infant. Additional infants require a child ticket and a seat.
- Taxes and active charge rules follow the same passenger multiplier as the fare.

## API contract

- `GET /search/flights` accepts `adults`, `children`, `infants` and returns a passenger-mix total per cabin in addition to the adult unit price.
- `POST /bookings` passengers include `passengerType`, `birthDate`, and an optional `seatCode` (required for adults/children; forbidden for lap infants).
- Booking details expose the persisted passenger type, birth date, seat occupancy and fare snapshot.
- Server-side validation is authoritative and returns `VALIDATION_FAILED` for a DOB/type mismatch or an invalid infant/adult ratio.

## Acceptance checklist

- [ ] Search query retains all passenger counts and cabin.
- [ ] Results total changes when passenger mix changes.
- [ ] RTL results show the aircraft pointing in the route direction.
- [ ] Guest Buy opens the existing login/signup modal and resumes the same checkout.
- [ ] Checkout renders the requested adult/child/infant cards and does not create a seat for a lap infant.
- [ ] DOB is evaluated against departure time, not purchase time.
- [ ] Invalid type/DOB and more lap infants than adults are blocked with a localized notification.
- [ ] Booking price and payment re-price use identical fare multipliers.
- [ ] Physical capacity counts occupied seats, not passenger rows.
- [ ] Agency and charter commitments remain unavailable to public sale.
- [ ] Existing payment screen and stepper are the only checkout completion path.
- [ ] Operations Manager panel and MD-80 seat layout have zero diffs.
