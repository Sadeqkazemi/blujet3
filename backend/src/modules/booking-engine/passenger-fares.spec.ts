import { BadRequestException } from '@nestjs/common';
import type { BookingPassengerDto } from './dto/create-booking.dto';
import {
  passengerFareRows,
  validatePassengerManifest,
} from './passenger-fares';

function passenger(
  passengerType: BookingPassengerDto['passengerType'],
  birthDate: string,
  seatCode?: string,
): BookingPassengerDto {
  return {
    fullName: passengerType,
    passengerType,
    birthDate,
    seatCode,
  };
}

describe('passenger fares', () => {
  const departureAt = new Date('2026-08-10T10:00:00.000Z');

  it('prices an extra seat at one base fare without tax', () => {
    const row = passengerFareRows(
      [
        {
          ...passenger('ADULT', '1990-01-01', '1A'),
          extraSeatRequested: true,
        },
      ],
      10_000n,
      2_000n,
      'SYSTEM',
    )[0]!;
    expect(row.extraSeatFareIrr).toBe(10_000n);
    expect(row.taxIrr).toBe(2_000n);
  });

  it('prices adult, system child and lap infant at 100%, 50% and 10%', () => {
    const rows = passengerFareRows(
      [
        passenger('ADULT', '1990-01-01', '1A'),
        passenger('CHILD', '2020-01-01', '1B'),
        passenger('INFANT', '2025-01-01'),
      ],
      1_000_000n,
      100_000n,
      'SYSTEM',
    );

    expect(
      rows.map((row) => [row.fareIrr, row.taxIrr, row.occupiesSeat]),
    ).toEqual([
      [1_000_000n, 100_000n, true],
      [500_000n, 50_000n, true],
      [100_000n, 10_000n, false],
    ]);
  });

  it('prices a charter child at the full adult fare', () => {
    const [row] = passengerFareRows(
      [passenger('CHILD', '2020-01-01', '1A')],
      1_000_000n,
      0n,
      'CHARTER',
    );
    expect(row?.fareIrr).toBe(1_000_000n);
  });

  it('allows an under-two passenger on a child fare with a dedicated seat', () => {
    expect(() =>
      validatePassengerManifest(
        [
          passenger('ADULT', '1990-01-01', '1A'),
          passenger('CHILD', '2025-01-01', '1B'),
        ],
        departureAt,
      ),
    ).not.toThrow();
  });

  it('uses age on departure date and rejects a child who is already 12', () => {
    expect(() =>
      validatePassengerManifest(
        [
          passenger('ADULT', '1990-01-01', '1A'),
          passenger('CHILD', '2014-08-10', '1B'),
        ],
        departureAt,
      ),
    ).toThrow(BadRequestException);
  });

  it('allows no more than one lap infant per adult', () => {
    expect(() =>
      validatePassengerManifest(
        [
          passenger('ADULT', '1990-01-01', '1A'),
          passenger('INFANT', '2025-01-01'),
          passenger('INFANT', '2025-02-01'),
        ],
        departureAt,
      ),
    ).toThrow(BadRequestException);
  });
});
