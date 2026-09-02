import { validate } from 'class-validator';
import { BookingPassengerDto } from './create-booking.dto';

function passenger(identity: Partial<BookingPassengerDto> = {}) {
  return Object.assign(new BookingPassengerDto(), {
    fullName: 'ALI REZAEI',
    passengerType: 'ADULT',
    birthDate: '1990-01-01',
    seatCode: '1A',
    ...identity,
  });
}

describe('BookingPassengerDto identity validation', () => {
  it('keeps identity optional for legacy partner and agency bookings', async () => {
    const errors = await validate(passenger());
    expect(errors).toHaveLength(0);
  });

  it('accepts a passport when national ID is not supplied', async () => {
    const errors = await validate(passenger({ passportNo: 'A1234567' }));
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed identity value when one is supplied', async () => {
    const errors = await validate(passenger({ nationalId: '123' }));
    expect(errors.map((error) => error.property)).toContain('nationalId');
  });
});
