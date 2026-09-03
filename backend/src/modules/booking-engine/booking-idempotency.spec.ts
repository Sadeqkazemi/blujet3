import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { BookingChannel } from '../../database/enums';
import { CreateBookingDto } from './dto/create-booking.dto';
import {
  assertBookingReplay,
  bookingRequestHash,
  type BookingReplayScope,
} from './booking-idempotency';

describe('booking request replay', () => {
  const originalKey = process.env.PII_ENCRYPTION_KEY;
  const scope: BookingReplayScope = {
    channel: 'SYSTEM',
    ownerId: 'owner',
    resourceId: 'flight',
  };
  const dto = () =>
    plainToInstance(CreateBookingDto, {
      flightInstanceId: 'flight',
      cabin: 'ECONOMY',
      passengers: [{ fullName: 'مسافر', seatCode: '2A' }],
    });
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = '11'.repeat(32);
  });
  afterAll(() => {
    if (originalKey === undefined) delete process.env.PII_ENCRYPTION_KEY;
    else process.env.PII_ENCRYPTION_KEY = originalKey;
  });

  it('uses a versioned digest and does not include plaintext passenger data', () => {
    const hash = bookingRequestHash(scope, dto());
    expect(hash).toMatch(/^v1:[a-f0-9]{64}$/);
    expect(hash).not.toContain('مسافر');
  });

  it('ignores object property order and normalizes omitted defaults', () => {
    const explicit = plainToInstance(CreateBookingDto, {
      passengers: [
        {
          birthDate: '1970-01-01',
          passengerType: 'ADULT',
          extraSeatRequested: false,
          seatCode: '2A',
          fullName: 'مسافر',
        },
      ],
      extras: [],
      cabin: 'ECONOMY',
      flightInstanceId: 'flight',
    });
    expect(bookingRequestHash(scope, explicit)).toBe(
      bookingRequestHash(scope, dto()),
    );
  });

  it.each([
    ['fullName', 'دیگر'],
    ['nationalId', '0013547981'],
    ['passportNo', 'A1234567'],
    ['gender', 'female'],
    ['mobile', '09120000000'],
    ['passengerType', 'CHILD'],
    ['birthDate', '2020-01-01'],
    ['seatCode', '2B'],
    ['extraSeatRequested', true],
  ])('detects changed passenger field %s', (field, value) => {
    const changed = dto();
    Object.assign(changed.passengers[0], { [field]: value });
    expect(bookingRequestHash(scope, changed)).not.toBe(
      bookingRequestHash(scope, dto()),
    );
  });

  it('detects changed extras, cabin and passenger order', () => {
    const original = dto();
    const changed = dto();
    changed.extras = [{ id: 'extra', quantity: 1 }];
    expect(bookingRequestHash(scope, changed)).not.toBe(
      bookingRequestHash(scope, original),
    );
    const hash = bookingRequestHash(scope, changed);
    changed.extras[0].quantity = 2;
    expect(bookingRequestHash(scope, changed)).not.toBe(hash);
    const business = plainToInstance(CreateBookingDto, {
      ...original,
      cabin: 'BUSINESS',
    });
    expect(bookingRequestHash(scope, business)).not.toBe(
      bookingRequestHash(scope, original),
    );
    original.passengers.push({
      ...original.passengers[0],
      fullName: 'مسافر دوم',
      seatCode: '2B',
    });
    const ordered = bookingRequestHash(scope, original);
    original.passengers.reverse();
    expect(bookingRequestHash(scope, original)).not.toBe(ordered);
  });

  it.each<BookingReplayScope>([
    { ...scope, ownerId: 'another-owner' },
    { ...scope, resourceId: 'another-flight-or-allotment' },
    { ...scope, channel: 'AGENCY' },
  ])('binds the digest to scope %j', (changedScope) => {
    expect(bookingRequestHash(changedScope, dto())).not.toBe(
      bookingRequestHash(scope, dto()),
    );
  });

  const booking = () => ({
    channel: BookingChannel.SYSTEM,
    userId: 'owner',
    agencyId: null,
    idempotencyRequestHash: bookingRequestHash(scope, dto()),
  });

  it('allows the identical owner, channel and payload', () => {
    expect(() =>
      assertBookingReplay(booking(), scope, bookingRequestHash(scope, dto())),
    ).not.toThrow();
  });

  it('checks owner/channel before comparing payloads, including legacy rows', () => {
    for (const changed of [
      { ...booking(), userId: 'another', idempotencyRequestHash: null },
      { ...booking(), channel: BookingChannel.AGENCY, agencyId: 'owner' },
    ]) {
      try {
        assertBookingReplay(changed, scope, bookingRequestHash(scope, dto()));
        throw new Error('Expected a conflict');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: 'CONFLICT',
        });
      }
    }
  });

  it.each([null, 'v1:different', 'v0:unsupported'])(
    'fails closed for missing/mismatched digest %s',
    (hash) => {
      expect(() =>
        assertBookingReplay(
          { ...booking(), idempotencyRequestHash: hash },
          scope,
          bookingRequestHash(scope, dto()),
        ),
      ).toThrow(ConflictException);
    },
  );

  it('fails closed after key rotation instead of rebinding a historical request', () => {
    const prior = booking();
    try {
      process.env.PII_ENCRYPTION_KEY = '22'.repeat(32);
      expect(() =>
        assertBookingReplay(prior, scope, bookingRequestHash(scope, dto())),
      ).toThrow(ConflictException);
    } finally {
      process.env.PII_ENCRYPTION_KEY = '11'.repeat(32);
    }
  });
});
