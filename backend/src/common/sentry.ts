import * as Sentry from '@sentry/node';

/** Error tracking (CLAUDE.md Observability rules): disabled entirely when
 * SENTRY_DSN is absent (local dev has no DSN by default). Must run before
 * anything else imports/instantiates the app — called first thing in
 * main.ts. */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}

export { Sentry };
