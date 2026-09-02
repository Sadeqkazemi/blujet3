import type { FlightInstance } from './entities/flight-instance.entity';
import type { SeatCell } from '../modules/reservation/seat-layout';

export const UAT_KL2550_CONFIRMATION = 'SELL_OUT_KL2550_AND_REFUND_10_V1';
export const UAT_KL2550_FLIGHT_NO = 'KL2550';
export const UAT_KL2550_ORIGIN = 'IKA';
export const UAT_KL2550_DESTINATION = 'FRA';
export const UAT_KL2550_DEPARTURE = '2026-09-01T04:30:00.000Z';
export const UAT_KL2550_CAPACITY = 140;
export const UAT_KL2550_BOOKING_KEY_PREFIX = 'uat-kl2550-financial-v1';
export const UAT_KL2550_EXPORT_FILENAME = 'uat-kl2550-sales-v1.csv';

export const UAT_KL2550_CABIN_CAPACITY: Record<SeatCell['cabin'], number> = {
  FIRST: 16,
  BUSINESS: 25,
  COMFORT: 0,
  ECONOMY: 99,
};

export function validateScenarioTarget(
  instance: Pick<
    FlightInstance,
    | 'id'
    | 'departureAt'
    | 'capacity'
    | 'status'
    | 'definitionStatus'
    | 'publicSaleEnabled'
  > & {
    flight: {
      flightNo: string;
      route: { originCode: string; destCode: string };
    };
  },
  seats: ReadonlyArray<SeatCell>,
): void {
  const counts = seats.reduce<Record<SeatCell['cabin'], number>>(
    (result, seat) => {
      result[seat.cabin] += 1;
      return result;
    },
    { FIRST: 0, BUSINESS: 0, COMFORT: 0, ECONOMY: 0 },
  );
  const mismatch = (
    Object.keys(UAT_KL2550_CABIN_CAPACITY) as SeatCell['cabin'][]
  )
    .filter((cabin) => counts[cabin] !== UAT_KL2550_CABIN_CAPACITY[cabin])
    .map(
      (cabin) =>
        `${cabin}:${counts[cabin]}/${UAT_KL2550_CABIN_CAPACITY[cabin]}`,
    );
  if (
    instance.flight.flightNo !== UAT_KL2550_FLIGHT_NO ||
    instance.flight.route.originCode !== UAT_KL2550_ORIGIN ||
    instance.flight.route.destCode !== UAT_KL2550_DESTINATION ||
    instance.departureAt.toISOString() !== UAT_KL2550_DEPARTURE ||
    instance.capacity !== UAT_KL2550_CAPACITY ||
    instance.status !== 'SCHEDULED' ||
    instance.definitionStatus !== 'PUBLISHED' ||
    !instance.publicSaleEnabled ||
    seats.length !== UAT_KL2550_CAPACITY ||
    mismatch.length > 0
  ) {
    throw new Error(
      `Scenario refused: KL2550 target invariant mismatch (${mismatch.join(', ') || 'flight metadata'}).`,
    );
  }
  if (instance.departureAt <= new Date()) {
    throw new Error('Scenario refused: KL2550 has already departed.');
  }
}

export function selectRefundSeatCodes(
  seats: ReadonlyArray<SeatCell>,
): string[] {
  const take = (cabin: SeatCell['cabin'], count: number) =>
    seats.filter((seat) => seat.cabin === cabin).slice(0, count);
  const selected = [
    ...take('FIRST', 4),
    ...take('BUSINESS', 3),
    ...take('ECONOMY', 3),
  ].map((seat) => seat.seatCode);
  if (selected.length !== 10 || new Set(selected).size !== 10) {
    throw new Error('Scenario refused: unable to select ten refund seats.');
  }
  return selected;
}
