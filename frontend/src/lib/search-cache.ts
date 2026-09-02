/** Search-results invalidation + publishStatus filter (PR #126 contract). */

export const SEARCH_RESULTS_INVALIDATE_EVENT = 'blujet:search-results-invalidate';

export function invalidateSearchResultsCache(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SEARCH_RESULTS_INVALIDATE_EVENT));
}

export function onSearchResultsInvalidate(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = () => handler();
  window.addEventListener(SEARCH_RESULTS_INVALIDATE_EVENT, listener);
  return () => window.removeEventListener(SEARCH_RESULTS_INVALIDATE_EVENT, listener);
}

/**
 * Only flights with publishStatus === PUBLISHED are sellable in results.
 * APPROVED, DRAFT, PENDING*, REJECTED, missing/empty status are excluded.
 */
export function filterSellableSearchFlights<
  T extends { definitionStatus?: string; publishStatus?: string },
>(rows: T[]): T[] {
  return rows.filter(
    (row) => String(row.publishStatus ?? '').toUpperCase() === 'PUBLISHED',
  );
}
