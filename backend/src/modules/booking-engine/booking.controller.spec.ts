import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { BookingController } from './booking.controller';

describe('BookingController authorization', () => {
  it('allows customer and agency accounts to complete the public checkout flow', () => {
    expect(Reflect.getMetadata(ROLES_KEY, BookingController)).toEqual([
      'USER',
      'AGENCY',
    ]);
  });
});
