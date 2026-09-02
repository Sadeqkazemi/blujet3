import { useCallback, useEffect, useState } from 'react';

export type PanelTheme = 'light' | 'dark';

const STORAGE_KEY = 'blujet-panel-theme';

function initialTheme(): PanelTheme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

/** A single persisted theme preference shared by management, agency and customer panels. */
export function usePanelTheme() {
  const [theme, setTheme] = useState<PanelTheme>(initialTheme);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, setTheme, toggleTheme };
}
