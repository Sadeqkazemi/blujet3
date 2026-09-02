import { BadRequestException } from '@nestjs/common';
import { CabinClass } from '../../database/enums';
import { resolveAircraftCabinCapacities } from './aircraft-capacity.util';

describe('resolveAircraftCabinCapacities', () => {
  const physical = {
    FIRST: 8,
    BUSINESS: 12,
    COMFORT: 20,
    ECONOMY: 100,
  } as const;

  it('persists explicit enabled cabin capacities', () => {
    expect(
      resolveAircraftCabinCapacities(
        [
          { cabinType: CabinClass.BUSINESS, capacity: 10 },
          { cabinType: CabinClass.ECONOMY, capacity: 90 },
        ],
        physical,
        100,
      ),
    ).toEqual([
      { cabinType: CabinClass.BUSINESS, capacity: 10 },
      { cabinType: CabinClass.ECONOMY, capacity: 90 },
    ]);
  });

  it('rejects a flight-operating capacity above the physical cabin map', () => {
    expect(() =>
      resolveAircraftCabinCapacities(
        [{ cabinType: CabinClass.COMFORT, capacity: 21 }],
        physical,
        21,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate cabins and a total mismatch', () => {
    expect(() =>
      resolveAircraftCabinCapacities(
        [
          { cabinType: CabinClass.FIRST, capacity: 4 },
          { cabinType: CabinClass.FIRST, capacity: 4 },
        ],
        physical,
        8,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveAircraftCabinCapacities(
        [{ cabinType: CabinClass.ECONOMY, capacity: 90 }],
        physical,
        100,
      ),
    ).toThrow(BadRequestException);
  });
});
