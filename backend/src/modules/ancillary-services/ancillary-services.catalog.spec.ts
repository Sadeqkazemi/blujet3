import { AncillaryServiceCategory } from '../../database/enums';
import {
  ANCILLARY_BUILT_IN_SERVICES,
  ANCILLARY_KEY_BY_TRAVEL_EXTRA,
} from './ancillary-services.catalog';

describe('ancillary catalog', () => {
  it('seeds the approved 3 seat + 8 other built-in keys', () => {
    const seats = ANCILLARY_BUILT_IN_SERVICES.filter(
      (row) => row.category === AncillaryServiceCategory.SEAT,
    );
    const others = ANCILLARY_BUILT_IN_SERVICES.filter(
      (row) => row.category === AncillaryServiceCategory.OTHER,
    );
    expect(seats.map((row) => row.key)).toEqual([
      'seat-normal',
      'seat-legroom',
      'seat-window-aisle',
    ]);
    expect(others).toHaveLength(8);
    expect(
      new Set(ANCILLARY_BUILT_IN_SERVICES.map((row) => row.key)).size,
    ).toBe(ANCILLARY_BUILT_IN_SERVICES.length);
    expect(seats[0]?.titleFa).toBe('صندلی عادی');
    expect(ANCILLARY_KEY_BY_TRAVEL_EXTRA.get('EXTRA_BAGGAGE')).toBe('baggage');
    expect(ANCILLARY_KEY_BY_TRAVEL_EXTRA.get('SEAT_SELECTION')).toBe('seat-selection');
    expect(ANCILLARY_KEY_BY_TRAVEL_EXTRA.get('PET')).toBe('pet');
    expect(ANCILLARY_BUILT_IN_SERVICES.find((row) => row.key === 'pet')?.enabled).toBe(true);
  });
});
