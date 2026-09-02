import {
  capabilitiesFromScope,
  normalizeCapabilities,
  scopeFromCapabilities,
} from './agency-api-capabilities';

describe('agency-api-capabilities', () => {
  it('maps coarse scopes to fine-grained capabilities', () => {
    expect(capabilitiesFromScope('SEARCH_ONLY')).toEqual([
      'FLIGHT_INFO',
      'AVAILABILITY',
    ]);
    expect(capabilitiesFromScope('SEARCH_BOOK')).toContain('RESERVATION');
    expect(capabilitiesFromScope('FULL')).toHaveLength(7);
  });

  it('derives coarse scope from capabilities', () => {
    expect(scopeFromCapabilities(['FLIGHT_INFO', 'AVAILABILITY'])).toBe(
      'SEARCH_ONLY',
    );
    expect(
      scopeFromCapabilities([
        'RESERVATION',
        'TICKETING',
        'FLIGHT_INFO',
        'AVAILABILITY',
      ]),
    ).toBe('SEARCH_BOOK');
    expect(scopeFromCapabilities(capabilitiesFromScope('FULL'))).toBe('FULL');
  });

  it('falls back to scope when capabilities are empty', () => {
    expect(normalizeCapabilities([], 'SEARCH_BOOK')).toEqual(
      capabilitiesFromScope('SEARCH_BOOK'),
    );
  });
});
