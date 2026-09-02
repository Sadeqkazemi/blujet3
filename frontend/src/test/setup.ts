import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia — needed by useIsMobile (real
// window.matchMedia-driven responsive breakpoint tracking, used across the
// public site). Desktop by default (matches: false); tests that need the
// mobile branch override this per-test via vi.stubGlobal.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
