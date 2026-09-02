# Logout confirmation

## Acceptance checklist

- [x] Staff and manager panel logout asks for explicit confirmation before revoking the session.
- [x] Agency portal logout asks for explicit confirmation in Persian, English, and Arabic.
- [x] Customer header and account sidebar logout ask for explicit confirmation in Persian, English, and Arabic.
- [x] Cancelling the dialog keeps the current session active.
- [x] The confirm action is disabled while sign-out is in progress.
- [x] The dialog uses the project's shared `Modal` surface and remains reusable for delete confirmations.
- [x] Frontend regression coverage: `ConfirmActionDialog.test.tsx`, `PanelShell.test.tsx`, `AgencyPortalShell.test.tsx`, `PublicHeader.test.tsx`, and `AccountSidebar.test.tsx`.

## Out of scope / blocker

- Deleting a flight definition or flight instance is not implemented because no frontend API client or backend `DELETE /flights/:id` contract exists. Product rules for bookings, issued tickets, allotments, audit history, and soft-delete/cancellation must be approved before such an endpoint is introduced.
