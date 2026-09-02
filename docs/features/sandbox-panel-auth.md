# Sandbox panel authentication

Implements the approved first-login and deterministic OTP flow for the three
panel surfaces while keeping the shortcut opt-in and unavailable in an
ordinary production deployment.

## Runtime contract

- Backend sandbox mode is active in local development, or explicitly with
  `AUTH_SANDBOX_ENABLED=true` for a hosted UAT environment.
- Sandbox OTP is six digits and defaults to `123456`. It may be overridden by
  `AUTH_SANDBOX_OTP`, but is never enabled by that value alone.
- Frontend copy/hints are enabled with `VITE_SANDBOX_AUTH=true` so production
  builds do not accidentally advertise a test credential.
- SMS delivery is still attempted and logged. A delivery failure is
  non-blocking only in sandbox mode; ordinary production remains fail-closed.

## Acceptance checklist

### Staff / managers

- [x] A username whose staff account has never logged in is routed to the
  first-login setup form without requiring an IT-issued password.
- [x] First-login setup requires matching strong password fields and a valid
  Iranian mobile number, then issues a hashed, expiring, single-use OTP
  challenge.
- [x] `123456` completes the challenge in sandbox and opens the role-scoped
  management panel.
- [x] A staff account that has already logged in follows the normal
  username/password + mandatory OTP flow.
- [x] Unknown usernames do not receive a distinct account-existence response.

### Agency

- [x] Existing agency phone/password login requires an OTP in sandbox before
  issuing tokens; ordinary production keeps its established password-only
  contract.
- [x] A new/temporary agency can choose «فعال‌سازی اولین ورود», set its own
  password, verify the account mobile by OTP, and enter the agency panel.
- [x] Suspended/inactive agencies cannot request setup or log in.

### Customer

- [x] Customer phone login continues to create/find the USER account and
  requires OTP before `/account` access.
- [x] The customer OTP screen clearly advertises `123456` only when the
  frontend sandbox flag is enabled.

### Security and tests

- [x] OTPs remain hashed at rest, expire after two minutes, are single-use,
  and retain the five-attempt limit.
- [x] Hosted sandbox works even when the SMS provider is unavailable.
- [x] Ordinary production neither accepts nor displays the deterministic OTP.
- [x] Backend auth tests, frontend component tests, build/typecheck and lint
  pass for the touched surfaces — backend `auth.e2e-spec.ts` +
  `agency-portal.e2e-spec.ts` (54/54), frontend focused auth suites (32/32).
