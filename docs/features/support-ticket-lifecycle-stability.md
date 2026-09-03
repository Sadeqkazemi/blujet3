# Support ticket lifecycle stability — acceptance checklist

## Scope

The hourly support-ticket auto-close sweep keeps its existing behavior while
application shutdown becomes deterministic in production and E2E tests.

## Acceptance criteria

- [x] At most one support-ticket lifecycle sweep is active at a time.
- [x] Module shutdown stops future sweeps and waits for the active sweep to
      settle before database teardown.
- [x] A failed sweep is logged without preventing application startup or
      shutdown.
- [x] The lifecycle timer does not keep the Node.js process alive.
- [x] Unit coverage proves that shutdown waits for an in-flight sweep and that
      overlapping sweep requests are ignored.
- [x] No public API, database schema, migration, or deployment behavior changes.
