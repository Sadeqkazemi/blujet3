# Seat purchase, wallet, and ticket integrity

## Scope

This change makes the agency catalogue, seat selection, booking identity,
wallet accounting, and ticket issuance one consistent transaction flow.

## Acceptance checklist

- [x] Every future scheduled and published flight with live sellable inventory
      is visible in the agency active-flight/seat-allocation catalogue, even
      when no allotment has previously been assigned to that agency.
- [x] Catalogue availability is calculated by the reservation engine and the
      same flight/cabin/fare-class row is not duplicated by an owned allotment.
- [x] Economy, Business, and First seats that belong to the purchased cabin can
      be selected on MD-80 and generic aircraft maps. Club points do not lock a
      seat in a cabin whose fare is being purchased.
- [x] The same national ID cannot be submitted as two passenger rows on the
      same flight, including across separate active bookings. A passenger may
      still purchase one adjacent EXST seat; EXST stays attached to the same
      passenger and never creates another passenger or ticket.
- [x] Wallet payment locks the booking and wallet owner and atomically commits
      exactly one wallet debit, one sale ledger entry, ticket issuance for
      every passenger, booking status, and payment idempotency record.
- [x] A replay or concurrent wallet payment cannot debit twice, issue duplicate
      tickets, or create duplicate sale ledger entries.
- [x] An agency account buying through the public purchase flow records the
      booking and sale under that agency so its wallet history, sales report,
      and finance transaction projections show the same committed purchase.
- [x] Each passenger receives one persisted, unique e-ticket number. Booking
      and ticket detail responses expose it, and the ticket page renders one
      complete ticket per passenger.
- [x] The airplane marker on every rendered ticket points from origin to
      destination in both RTL and LTR layouts.
- [x] Database-backed integration tests verify balance delta, immutable wallet
      entry, finance ledger, agency sales visibility, passenger/ticket counts,
      seat locks, and idempotent replay.
- [ ] Browser QA covers the real agency active-flight list, Business/First seat
      selection, wallet checkout, purchase history, agency sales, and ticket
      rendering in the local application.

## Out of scope

- External PSP settlement beyond the existing gateway abstraction.
- Assigning one national identity to multiple passenger tickets on one flight.
