import { CabinClass } from '../../database/enums';
import { validate } from 'class-validator';
import { AircraftCabinCapacityDto } from './dto/aircraft.dto';
import {
  findDuplicateClassCode,
  standardClassCode,
} from './aircraft-class-code';

describe('standardClassCode', () => {
  it.each([
    [CabinClass.FIRST, 'F'],
    [CabinClass.BUSINESS, 'C'],
    [CabinClass.COMFORT, 'W'],
    [CabinClass.ECONOMY, 'Y'],
  ])('maps %s to its standard fare class', (cabin, expected) => {
    expect(standardClassCode(cabin)).toBe(expected);
  });

  it('finds duplicate class codes after normalising case and whitespace', () => {
    expect(findDuplicateClassCode(['F', ' c ', 'C', 'Y'])).toBe('C');
    expect(findDuplicateClassCode(['F', 'C', 'W', 'Y'])).toBeNull();
  });

  it('rejects malformed standard class codes at the API boundary', async () => {
    const row = new AircraftCabinCapacityDto();
    row.cabinType = CabinClass.ECONOMY;
    row.capacity = 99;
    row.defaultClassCode = 'Y/1';

    const errors = await validate(row);
    expect(errors.some((error) => error.property === 'defaultClassCode')).toBe(
      true,
    );
  });
});
