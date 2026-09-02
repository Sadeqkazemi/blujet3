const DEFAULT_SEARCH_CACHE_GENERATION = 'v1';
const SAFE_GENERATION = /^[A-Za-z0-9._-]{1,64}$/;

export function searchCacheGeneration(
  value: string | undefined = process.env.SEARCH_CACHE_GEN,
): string {
  const candidate = value?.trim();
  return candidate && SAFE_GENERATION.test(candidate)
    ? candidate
    : DEFAULT_SEARCH_CACHE_GENERATION;
}

export function searchCacheKey(...segments: readonly string[]): string {
  return ['search', searchCacheGeneration(), ...segments].join(':');
}
