import { CabinClass } from '../../database/enums';
import { buildInitialFareRuleRows } from './schedule-template-fare-rules';

describe('buildInitialFareRuleRows', () => {
  it('creates one closed standard fare bucket per occurrence and cabin', () => {
    let id = 0;
    const rows = buildInitialFareRuleRows(
      ['flight-1', 'flight-2'],
      [
        {
          cabin: CabinClass.ECONOMY,
          seats: 90,
          basePriceIrr: 90_000_000n,
          defaultClassCode: 'Y',
        },
        {
          cabin: CabinClass.BUSINESS,
          seats: 12,
          basePriceIrr: 150_000_000n,
          defaultClassCode: 'C',
        },
      ],
      () => `rule-${++id}`,
    );

    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          flightInstanceId: 'flight-1',
          cabin: CabinClass.ECONOMY,
          classCode: 'Y',
          priceIrr: 90_000_000n,
          seatsAllocated: 90,
          siteSeatsReleased: 0,
          agencySeatsReleased: 0,
        }),
        expect.objectContaining({
          flightInstanceId: 'flight-2',
          cabin: CabinClass.BUSINESS,
          classCode: 'C',
          priceIrr: 150_000_000n,
          seatsAllocated: 12,
        }),
      ]),
    );
  });
});
