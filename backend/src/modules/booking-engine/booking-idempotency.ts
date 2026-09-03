import { ConflictException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors';
import { hashPii, normalizeNationalId } from '../../common/pii-crypto';
import type { Booking } from '../../database/entities/booking.entity';
import type { CreateBookingDto } from './dto/create-booking.dto';

export type BookingReplayScope = {
  channel: 'SYSTEM' | 'AGENCY';
  ownerId: string;
  resourceId: string;
};

/** Versioned, keyed digest: no plaintext passenger request is persisted.
 * Keep field order explicit; changing canonicalization requires a new version. */
export function bookingRequestHash(
  scope: BookingReplayScope,
  dto: Pick<CreateBookingDto, 'cabin' | 'passengers' | 'extras'>,
): string {
  const payload = {
    operation: 'booking-create:v1',
    channel: scope.channel,
    ownerId: scope.ownerId,
    resourceId: scope.resourceId,
    cabin: dto.cabin,
    passengers: dto.passengers.map((passenger) => ({
      fullName: passenger.fullName,
      nationalId: passenger.nationalId
        ? normalizeNationalId(passenger.nationalId)
        : null,
      passportNo: passenger.passportNo?.trim().toUpperCase() || null,
      gender: passenger.gender ?? null,
      mobile: passenger.mobile || null,
      passengerType: passenger.passengerType ?? 'ADULT',
      birthDate: passenger.birthDate ?? '1970-01-01',
      seatCode: passenger.seatCode || null,
      extraSeatRequested: passenger.extraSeatRequested ?? false,
    })),
    extras: (dto.extras ?? []).map(({ id, quantity }) => ({ id, quantity })),
  };
  return `v1:${hashPii(JSON.stringify(payload))}`;
}

export function assertBookingReplay(
  booking: Pick<
    Booking,
    'channel' | 'userId' | 'agencyId' | 'idempotencyRequestHash'
  >,
  scope: BookingReplayScope,
  requestHash: string | null,
): void {
  const ownerId =
    scope.channel === 'SYSTEM' ? booking.userId : booking.agencyId;
  if (booking.channel !== scope.channel || ownerId !== scope.ownerId) {
    throw new ConflictException({
      code: ErrorCode.CONFLICT,
      message: 'کلید تکرار برای درخواست دیگری استفاده شده است.',
    });
  }
  // Legacy rows are not evidence of the original input. Never rebind a key.
  if (
    !booking.idempotencyRequestHash ||
    booking.idempotencyRequestHash !== requestHash
  ) {
    throw new ConflictException({
      code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
      message:
        'تطابق درخواست با کلید تکرار تأیید نشد؛ رزرو موجود را از فهرست رزروها بررسی کنید.',
    });
  }
}
