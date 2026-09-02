# Board Chair panel completion

## Scope

Complete the Board Chair panel with real backend data and role-aware access for:

- dashboard
- finance
- manager reports
- cartable
- VIP passengers
- airplane / reservation operations
- passenger survey results

## Acceptance criteria

- Every sidebar item routes to a usable page and its API requests are permitted for `BOARD_CHAIR`.
- Custom manager permissions map `reservation` to `flights`, and `survey` plus manager audit reports to `reports`.
- The airplane page uses the Board-authorized reservation endpoints for flights and agency API access.
- The Board Chair can open a flight seat map, inspect sold-seat passenger information, and lock or release eligible seats.
- IT managers cannot lock seats, while CEO, Board Chair, and Commercial Manager retain seat-lock authority.
- Dashboard widgets fail independently so a single unavailable feed does not blank the whole dashboard.
- Finance, manager reports, cartable, VIP passengers, and survey pages render Board Chair data or an explicit empty/error state without demo data.
- Backend authorization and frontend role routing are covered by automated tests.
- Frontend build/type checks and relevant backend/frontend test suites pass before handoff.

## Review gate

The implementation must be reviewed and approved before merging to `main` and deploying.
