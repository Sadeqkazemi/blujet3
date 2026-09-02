import * as Sentry from '@sentry/react';

/** Error tracking (CLAUDE.md Observability rules): disabled entirely when
 * VITE_SENTRY_DSN is absent (local dev has no DSN by default). Called
 * first thing in main.tsx, before the app renders. */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}

export { Sentry };
