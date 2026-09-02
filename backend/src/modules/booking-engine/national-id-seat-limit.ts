import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import {
  hashPii,
  isValidIranianNationalId,
  normalizeNationalId,
} from '../../common/pii-crypto';
import { Passenger } from '../../database/entities/passenger.entity';
import type { BookingPassengerDto } from './dto/create-booking.dto';

/** One identity may create only one passenger/ticket on the same flight. */
export const MAX_SEATS_PER_NATIONAL_ID = 1;

/**
 * Count passenger identities in a request by nationalIdHash. EXST is attached
 * to its owner and never increments this count. Invalid NIDs are skipped here
 * because checksum validation runs separately.
 */
export function countOccupyingNationalIdHashes(
  passengers: ReadonlyArray<
    Pick<
      BookingPassengerDto,
      'nationalId' | 'passengerType' | 'extraSeatRequested'
    >
  >,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const passenger of passengers) {
    const raw = passenger.nationalId?.trim();
    if (!raw) continue;
    const nationalId = normalizeNationalId(raw);
    if (!isValidIranianNationalId(nationalId)) continue;
    const hash = hashPii(nationalId);
    counts.set(hash, (counts.get(hash) ?? 0) + 1);
  }
  return counts;
}

export function assertInRequestNationalIdSeatLimit(
  passengers: ReadonlyArray<
    Pick<
      BookingPassengerDto,
      'nationalId' | 'passengerType' | 'extraSeatRequested'
    >
  >,
): void {
  for (const [, count] of countOccupyingNationalIdHashes(passengers)) {
    if (count > MAX_SEATS_PER_NATIONAL_ID) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'هر کد ملی فقط برای یک مسافر در هر پرواز قابل ثبت است.',
      });
    }
  }
}

/**
 * Enforce one passenger/ticket per national ID on a flight instance:
 * in-request rows plus existing active booking passengers with the same hash.
 * Call inside the booking transaction after the flight row is locked.
 */
export async function assertNationalIdSeatLimitForFlight(
  tx: EntityManager,
  flightInstanceId: string,
  passengers: ReadonlyArray<
    Pick<
      BookingPassengerDto,
      'nationalId' | 'passengerType' | 'extraSeatRequested'
    >
  >,
): Promise<void> {
  assertInRequestNationalIdSeatLimit(passengers);

  const inRequest = countOccupyingNationalIdHashes(passengers);
  const hashes = [...inRequest.keys()];
  if (hashes.length === 0) return;

  const rows = await tx
    .createQueryBuilder(Passenger, 'p')
    .innerJoin('p.booking', 'b')
    .select('p.nationalIdHash', 'hash')
    .addSelect('COUNT(p.id)', 'cnt')
    .where('b.flightInstanceId = :flightInstanceId', { flightInstanceId })
    .andWhere(
      `(b.status IN ('DRAFT', 'PAID', 'TICKETED') OR (b.status = 'HELD' AND b.holdExpiresAt > :now))`,
      { now: new Date() },
    )
    .andWhere('p.deletedAt IS NULL')
    .andWhere('p.nationalIdHash IN (:...hashes)', { hashes })
    .groupBy('p.nationalIdHash')
    .getRawMany<{ hash: string; cnt: string }>();

  const existingByHash = new Map(
    rows.map((row) => [row.hash, Number(row.cnt) || 0]),
  );

  for (const [hash, requested] of inRequest) {
    const existing = existingByHash.get(hash) ?? 0;
    if (existing + requested > MAX_SEATS_PER_NATIONAL_ID) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'این کد ملی قبلاً برای مسافر دیگری در همین پرواز ثبت شده است.',
      });
    }
  }
}
