# Critical panel audit fixes (2026-08-25)

This follow-up keeps the guest-checkout and site-admin workflow recovery on
the same integration branch and closes the highest-impact defects confirmed
by the role-by-role functional audit.

## Acceptance checklist

- [x] The IT dashboard must never report «all systems healthy» when no
  internal service catalogue exists, and disabled external services must be
  included in the aggregate health result.
- [x] A production-safe migration must provision the canonical internal
  service catalogue without overwriting an operator's existing enabled or
  uptime values.
- [x] The production backend image must contain `pg_dump`, because the real
  backup endpoint executes that binary and must not fail solely because the
  runtime image omitted its system dependency.
- [x] The two-step staff sign-in used by the current UI must also be used by
  Playwright helpers so protected role journeys exercise the application
  instead of timing out on the username screen.
- [x] Commercial schedule summaries and generated occurrence cards must show
  Persian weekday and Jalali month names, without changing the stored ISO
  schedule contract.
- [x] Selecting an aircraft while defining a recurring route must expose its
  real cabin catalogue and allow per-route activation/capacity overrides; an
  existing route keeps its own saved snapshot.
- [x] Existing guest-passenger validation/OTP behavior and the site-admin
  pending-action/cartable fixes remain covered after this integration.

## Verification

Completed with 256 backend unit tests, 32 cartable E2E tests, 846 frontend
tests, both production builds, focused Playwright journeys for two-step login
and the IT service catalogue, and a local in-app-browser smoke test. Frontend
lint has only the repository's pre-existing warnings; targeted backend lint
and `git diff --check` pass.
