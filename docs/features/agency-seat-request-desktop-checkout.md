# Agency seat request and desktop checkout

## Acceptance checklist

- [x] Agency origin/destination selectors are populated from future active
  commercial routes, including routes whose flight definition is not yet
  published.
- [x] Selecting a destination immediately shows the next matching flight and
  its real capacity; multiple occurrences remain selectable.
- [x] Seat count cannot exceed server-derived available capacity.
- [x] Preferred weekdays and 3/6/12-month term are sent to a real Commercial
  Manager cartable task and audit record.
- [x] Existing finalized agency allotments and ticket-sale flow remain intact.
- [x] Guest desktop purchase opens the phone/OTP modal and resumes checkout
  after verification.
- [x] Desktop passenger information, extras, review, and payment use the same
  four-step progress header from the supplied design.
- [x] Mobile/responsive login and checkout behavior is unchanged.
- [x] Airplane glyphs point right-to-left in Persian/Arabic and left-to-right
  in English.
- [x] Passenger age is evaluated at departure time; the primary adult must be
  fully 12, child/infant boundaries are enforced, and one lap infant per adult
  is allowed.
- [x] No mock route, capacity, passenger, or fare data is introduced.
