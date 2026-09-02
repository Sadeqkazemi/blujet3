import type { SeatCell } from '../modules/reservation/seat-layout';
import {
  selectRefundSeatCodes,
  validateScenarioTarget,
} from './uat-kl2550-financial-scenario.contract';

function seats(cabin: SeatCell['cabin'], count: number): SeatCell[] {
  return Array.from({ length: count }, (_, index) => ({
    cabin,
    row: index + 1,
    seatCode: `${cabin.slice(0, 1)}${index + 1}`,
  }));
}

describe('KL2550 guarded UAT scenario', () => {
  const allSeats = [
    ...seats('FIRST', 16),
    ...seats('BUSINESS', 25),
    ...seats('ECONOMY', 99),
  ];

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T10:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('accepts only the exact published IKA-FRA occurrence with all three cabins', () => {
    expect(() =>
      validateScenarioTarget(
        {
          id: 'ef2d652c-47b2-4167-bb7c-ba09be3d18dc',
          departureAt: new Date('2026-09-01T04:30:00.000Z'),
          capacity: 140,
          status: 'SCHEDULED',
          definitionStatus: 'PUBLISHED',
          publicSaleEnabled: true,
          flight: {
            flightNo: 'KL2550',
            route: { originCode: 'IKA', destCode: 'FRA' },
          },
        },
        allSeats,
      ),
    ).not.toThrow();

    expect(() =>
      validateScenarioTarget(
        {
          id: 'ef2d652c-47b2-4167-bb7c-ba09be3d18dc',
          departureAt: new Date('2026-09-01T04:30:00.000Z'),
          capacity: 140,
          status: 'SCHEDULED',
          definitionStatus: 'PUBLISHED',
          publicSaleEnabled: true,
          flight: {
            flightNo: 'KL2550',
            route: { originCode: 'IKA', destCode: 'FRA' },
          },
        },
        allSeats.filter((seat) => seat.cabin !== 'FIRST'),
      ),
    ).toThrow(/invariant mismatch/);
  });

  it('selects ten deterministic refunds across first, business and economy', () => {
    const selected = selectRefundSeatCodes(allSeats);
    expect(selected).toHaveLength(10);
    expect(selected.filter((code) => code.startsWith('F'))).toHaveLength(4);
    expect(selected.filter((code) => code.startsWith('B'))).toHaveLength(3);
    expect(selected.filter((code) => code.startsWith('E'))).toHaveLength(3);
  });
});
