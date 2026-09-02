import { useEffect, useState } from 'react';

/** Real breakpoint tracking via matchMedia (matches the design bundle's own
 * `window.matchMedia("(max-width:767px)")` pattern) — centralized here so
 * every page shares one implementation instead of copy-pasting it. */
export function useIsMobile(breakpointPx = 767): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width:${breakpointPx}px)`).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width:${breakpointPx}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, [breakpointPx]);

  return isMobile;
}
