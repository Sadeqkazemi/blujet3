# Production backend artifact paths

Scope: keep the production Docker entrypoint and TypeORM commands aligned with
the JavaScript layout emitted by `nest build`.

## Acceptance checklist

- [x] The production container starts `dist/main.js`.
- [x] Production migration and seed commands target the emitted files under
  `dist/database/`.
- [x] A regression test fails if any production command returns to the stale
  `dist/src/` layout.
- [x] Backend tests, lint, and production build pass.
- [ ] The rebuilt backend becomes healthy on the deployment server without
  replacing `.env` or Docker volumes.

## Non-goals

- Payment gateway integration.
- Real SMS/OTP provider integration.
- Replacing or deleting the current production database volume.
