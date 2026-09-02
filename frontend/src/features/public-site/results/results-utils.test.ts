import { describe, expect, it } from 'vitest';
import { RESULTS_COPY } from './results-copy';
import { parseCabinParam } from './results-utils';

describe('public flight search contract', () => {
  it('preserves every supported cabin instead of falling back to economy', () => {
    expect(parseCabinParam('FIRST')).toBe('FIRST');
    expect(parseCabinParam('BUSINESS')).toBe('BUSINESS');
    expect(parseCabinParam('COMFORT')).toBe('COMFORT');
    expect(parseCabinParam('ECONOMY')).toBe('ECONOMY');
  });

  it('points from origin to destination in each locale', () => {
    expect(RESULTS_COPY.fa.routeArrow).toBe('←');
    expect(RESULTS_COPY.ar.routeArrow).toBe('←');
    expect(RESULTS_COPY.en.routeArrow).toBe('→');
  });
});
