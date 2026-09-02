import { describe, expect, it } from 'vitest';
import { filterSellableSearchFlights } from './search-cache';

describe('filterSellableSearchFlights', () => {
  it('keeps only publishStatus === PUBLISHED', () => {
    const rows = [
      { id: '1', publishStatus: 'PUBLISHED' },
      { id: '2', publishStatus: 'APPROVED' },
      { id: '3', definitionStatus: 'APPROVED' },
      { id: '4', publishStatus: 'DRAFT' },
      { id: '5', publishStatus: 'PENDING_APPROVAL' },
      { id: '6', definitionStatus: 'PENDING_CEO' },
      { id: '7', publishStatus: 'REJECTED' },
      { id: '8', publishStatus: '' },
      { id: '9' },
      { id: '10', publishStatus: 'published' },
    ];
    expect(filterSellableSearchFlights(rows).map((r) => r.id)).toEqual(['1', '10']);
  });
});
