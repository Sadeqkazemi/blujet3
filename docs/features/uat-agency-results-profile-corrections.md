# UAT corrections: agency seats, results, and customer profile

## Acceptance checklist

- [x] Changing the requested agency-seat count automatically starts a debounced
  inquiry against the real `POST /agency-portal/seat-requests/inquiry` endpoint;
  no extra click is required — `AgencySeatsPage.test.tsx` › "loads commercial
  routes and sends the selected seat request to the commercial manager".
- [x] Stale inquiry responses cannot replace the response for the latest seat
  count, and loading/error/result states are announced in the inquiry box —
  `AgencySeatsPage.test.tsx` › "ignores a slower response for an older seat
  count".
- [x] The seat-count box stays compact when the inquiry result grows; the two
  boxes no longer stretch each other vertically — asserted by the agency-seat
  request test through the compact `self-start` containers.
- [x] The smart-price radar renders English-only copy in `en` and Arabic-only
  copy in `ar`, including an ML reason that arrives from the API in Persian and
  the cheapest-day date — `ResultsAiRadar.test.tsx` › both locale-isolation
  tests.
- [x] Flight result details no longer render the save-flight/bookmark button in
  any authentication or locale state — `ResultsPage.test.tsx` › "does not
  render the removed save-flight button in expanded results".
- [x] Customer profile edit mode accepts a valid email and persists it through
  `PATCH /my/profile`; changing the email clears its previous verification —
  `AccountPage.test.tsx` profile-save test +
  `phase17-user-profile.e2e-spec.ts` PATCH test.
- [x] Duplicate/invalid email values are rejected with a typed validation or
  conflict response — `phase17-user-profile.e2e-spec.ts` › "PATCH rejects
  invalid and already-used profile emails".
- [x] Profile completion is an integer percentage, so the banner and progress
  card never display a repeating decimal such as `83.333333...` —
  `profile-completion.spec.ts` and the profile PATCH E2E test.
- [x] No schema migration is needed: the existing unique nullable `User.email`
  and `User.emailVerifiedAt` columns remain authoritative.
