import { searchCacheGeneration, searchCacheKey } from './search-cache-key';

describe('search cache namespace', () => {
  const originalGeneration = process.env.SEARCH_CACHE_GEN;

  afterEach(() => {
    if (originalGeneration === undefined) delete process.env.SEARCH_CACHE_GEN;
    else process.env.SEARCH_CACHE_GEN = originalGeneration;
  });

  it('uses a safe deploy-controlled generation', () => {
    process.env.SEARCH_CACHE_GEN = 'release-2026.09';
    expect(searchCacheKey('flights', 'THR', 'MHD')).toBe(
      'search:release-2026.09:flights:THR:MHD',
    );
  });

  it('falls back for empty or unsafe namespaces', () => {
    expect(searchCacheGeneration('')).toBe('v1');
    expect(searchCacheGeneration('../flush')).toBe('v1');
  });
});
