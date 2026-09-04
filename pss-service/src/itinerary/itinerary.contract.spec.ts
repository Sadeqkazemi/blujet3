import {
  ItineraryValidationError,
  type ResolvedItinerarySegment,
  validateResolvedItinerary,
} from './itinerary.contract';

const segment = (
  overrides: Partial<ResolvedItinerarySegment> = {},
): ResolvedItinerarySegment => ({
  flightInstanceId: '11111111-1111-4111-8111-111111111111',
  sequence: 1,
  originCode: 'IKA',
  destinationCode: 'DXB',
  departureAt: new Date('2026-10-01T08:00:00.000Z'),
  arrivalAt: new Date('2026-10-01T10:00:00.000Z'),
  definitionStatus: 'PUBLISHED',
  flightStatus: 'SCHEDULED',
  ...overrides,
});

describe('validateResolvedItinerary', () => {
  it('accepts and orders a single segment', () => {
    const result = validateResolvedItinerary([segment()]);

    expect(result).toHaveLength(1);
    expect(result[0].sequence).toBe(1);
  });

  it('accepts connected chronological segments', () => {
    const result = validateResolvedItinerary([
      segment(),
      segment({
        flightInstanceId: '22222222-2222-4222-8222-222222222222',
        sequence: 2,
        originCode: 'DXB',
        destinationCode: 'IST',
        departureAt: new Date('2026-10-01T12:00:00.000Z'),
        arrivalAt: new Date('2026-10-01T16:00:00.000Z'),
      }),
    ]);

    expect(result.map(({ sequence }) => sequence)).toEqual([1, 2]);
  });

  it.each([
    ['empty', [], 'ITINERARY_EMPTY'],
    [
      'non-contiguous sequence',
      [segment({ sequence: 2 })],
      'ITINERARY_SEQUENCE_INVALID',
    ],
    [
      'duplicate instance',
      [segment(), segment({ sequence: 2, originCode: 'DXB' })],
      'ITINERARY_DUPLICATE_SEGMENT',
    ],
    [
      'unpublished instance',
      [segment({ definitionStatus: 'DRAFT' })],
      'ITINERARY_NOT_SELLABLE',
    ],
    [
      'cancelled instance',
      [segment({ flightStatus: 'CANCELLED' })],
      'ITINERARY_NOT_SELLABLE',
    ],
    [
      'discontinuous route',
      [
        segment(),
        segment({
          flightInstanceId: '22222222-2222-4222-8222-222222222222',
          sequence: 2,
          originCode: 'IST',
        }),
      ],
      'ITINERARY_ROUTE_DISCONTINUITY',
    ],
    [
      'invalid chronology',
      [
        segment(),
        segment({
          flightInstanceId: '22222222-2222-4222-8222-222222222222',
          sequence: 2,
          originCode: 'DXB',
          departureAt: new Date('2026-10-01T09:00:00.000Z'),
        }),
      ],
      'ITINERARY_CHRONOLOGY_INVALID',
    ],
  ])(
    'rejects %s itineraries',
    (_name, value: readonly ResolvedItinerarySegment[], code) => {
      expect(() => validateResolvedItinerary(value)).toThrow(
        ItineraryValidationError,
      );
      try {
        validateResolvedItinerary(value);
      } catch (error: unknown) {
        expect(error).toMatchObject({ code });
      }
    },
  );
});
