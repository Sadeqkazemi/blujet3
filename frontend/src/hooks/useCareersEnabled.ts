import { useEffect, useState } from 'react';
import { fetchCareersSettings } from '../api/careers';

/** Footer-visibility toggle only — the careers pages themselves stay
 * reachable by direct URL regardless (matches the design). Defaults to
 * hidden until the settings fetch resolves, and stays hidden on error
 * rather than risk showing a link to a disabled section. */
export function useCareersEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCareersSettings()
      .then((s) => {
        if (alive) setEnabled(s.enabled);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return enabled;
}
