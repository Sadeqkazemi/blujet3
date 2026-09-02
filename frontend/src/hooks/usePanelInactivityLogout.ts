import { useEffect, useRef } from 'react';

const TEN_MINUTES_MS = 10 * 60 * 1_000;
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
];

type Options = {
  enabled: boolean;
  onTimeout: () => void;
  timeoutMs?: number;
};

/** Security timeout shared by every authenticated management-panel session. */
export function usePanelInactivityLogout({
  enabled,
  onTimeout,
  timeoutMs = TEN_MINUTES_MS,
}: Options) {
  const callbackRef = useRef(onTimeout);

  useEffect(() => {
    callbackRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: number | undefined;
    let lastActivityAt = Date.now();
    let completed = false;

    const clearTimer = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    const finish = () => {
      if (completed) return;
      completed = true;
      clearTimer();
      callbackRef.current();
    };

    const schedule = () => {
      clearTimer();
      const remaining = timeoutMs - (Date.now() - lastActivityAt);
      if (remaining <= 0) {
        finish();
        return;
      }
      timeoutId = window.setTimeout(finish, remaining);
    };

    const recordActivity = () => {
      if (completed) return;
      lastActivityAt = Date.now();
      schedule();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') schedule();
    };

    schedule();
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, recordActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimer();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, recordActivity);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, timeoutMs]);
}
