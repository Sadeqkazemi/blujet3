# Panel HTML reconciliation

Reference pages:

- پنل مدیر بازرگانی: routes, flight management, agencies
- پنل آژانس: allocated seats and compose message
- پنل ادمین سایت: read-only bank-loan queue
- پنل کاربر: club, loans and credits

## Acceptance checklist

- [x] Commercial manager can preview, create, list and deactivate seasonal flight routes using the real schedule-template API.
- [x] Route form uses real airports and aircraft definitions and never copies reference-page sample rows.
- [x] Agency allocated-seat cards continue to use live allotment and seat-map APIs.
- [x] Agency can open an explicit compose-message form and send a validated message through the real inbox API.
- [x] User can create a bank-loan application, list previous applications and refresh their bank status.
- [x] Site admin can only view and inspect bank-loan applications; no approve/reject controls are present.
- [x] User/account and site-admin navigation expose the new real pages.
- [x] Operations Manager navigation and pages are unchanged.
- [x] Focused frontend tests cover route empty state, message submission, loan submission and admin read-only details.
- [x] Frontend typecheck, focused tests, build and diff check pass.
