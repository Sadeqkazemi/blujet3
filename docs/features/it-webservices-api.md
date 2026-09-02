# Feature: IT Manager — webservices and agency API

Source of truth: the updated IT-panel Bundle supplied on 2026-08-19, especially
the new «وب‌سرویس‌ها و API» sidebar item and its Requests / Agencies / Events
views. Existing production booking, agency and partner-API rules still apply.

## Acceptance checklist

### Backend

- [x] `GET /it/webservices` is IT_MANAGER-only and returns real KPI, request,
      client, eligible-agency, usage and event data from PostgreSQL.
- [x] Public list responses expose only an opaque key hint; `keyHash` and raw
      credentials are never returned.
- [x] Pending webservice requests can be approved/rejected; approval requires
      step-up and returns a raw key once through the existing issuance flow.
- [x] IT can issue a client only for an existing active agency; issue requires
      step-up.
- [x] IT can suspend/activate a key, while rotation and irreversible revoke
      require step-up; a revoked key cannot be reactivated.
- [x] Every write produces an existing audited agency/API action.
- [x] Non-IT roles receive 403 for every `/it/webservices*` endpoint.

### Frontend

- [x] IT sidebar contains «وب‌سرویس‌ها و API» next to «سرویس‌های سایت» and the
      route renders the new page.
- [x] KPI cards and Requests / Agencies / Events tabs match the supplied dark
      RTL design and render honest empty/loading/error states.
- [x] Request approve/reject and client issue/suspend/activate/rotate/revoke
      call only the typed API layer and refresh real data after success.
- [x] Raw issued/rotated keys are shown once in a copyable modal.
- [x] Client list supports agency search and shows scope, status, last use and
      real accumulated call count without inventing an error rate.
- [x] Client policy fields: capabilities, environment, flightDomain, IP
      whitelist, rate limit, expiry — editable from IT settings modal; partner
      guard enforces IP + per-key rate limit.
- [x] Availability tester endpoint mirrors the AVAILABILITY capability gate.

### Verification mapping

- Backend projection and safe credential response: `it-webservices.service.spec.ts`
  (`builds the IT overview...without exposing keyHash`).
- Backend lifecycle delegation: `it-webservices.service.spec.ts`
  (`delegates key lifecycle mutations...`).
- HTTP role/list contract: `test/it-manager.e2e-spec.ts`
  (`GET /it/webservices...` and the shared non-IT 403 matrix).
- Approval/raw-key non-persistence contract: `test/agency-portal.e2e-spec.ts`
  (`approving a webservice request issues...`).
- Frontend tabs, real usage and one-time raw-key modal:
  `WebservicesApiPage.test.tsx`.
- Regression coverage for the existing agency detail screen:
  `AgencyDetailPage.test.tsx`.
