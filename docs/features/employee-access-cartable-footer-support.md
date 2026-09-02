# Employee access, cartable, footer, and support hardening

## Scope

- Keep the public footer compact in Persian, English, and Arabic while retaining the app download buttons and trust badges.
- Align the English download/trust group to the physical right edge of the desktop footer.
- Render the English support phone with Latin digits and keep the mobile search input/button inside one responsive card.
- Let an employee with cartable read access load their tasks even when optional manager-messaging access is not granted.
- Create employee accounts with an organizational unit, referral scope, initial password, and grouped permission grants matching that unit's manager panel.
- Let the Board Chair create subordinate manager accounts and reset their passwords through the existing step-up protected admin APIs.

## Acceptance criteria

1. A failure or 403 from manager-recipient/sent-message endpoints does not replace a successfully loaded employee cartable with a global error.
2. The manager-message composer is shown only when the employee has `ct_process`; `ct_list` alone remains sufficient for the task list.
3. Permission selection preserves dependency rules and the backend remains the authorization source of truth.
4. Board Chair account-management actions use the same server-enforced hierarchy and step-up checks as CEO actions.
5. English support contact numbers contain no Persian or Arabic digits.
6. Public footer download buttons remain present in every locale and the footer is shorter on desktop and mobile.

## Verification

- Focused frontend tests for footer, support, employee cartable, employee access, and Board Chair manager administration.
- Focused backend tests for cartable permission enforcement and Board Chair admin management.
- Frontend production build and backend typecheck/test build.
