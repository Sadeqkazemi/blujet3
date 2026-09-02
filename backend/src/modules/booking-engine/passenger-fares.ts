import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors';
import type { Irr } from '../../common/money';
import type { BookingChannel } from '../../database/enums';
import type {
  BookingPassengerDto,
  BookingPassengerType,
} from './dto/create-booking.dto';

const ADULT_BPS = 10_000n;
const SYSTEM_CHILD_BPS = 5_000n;
const CHARTER_CHILD_BPS = 10_000n;
const INFANT_BPS = 1_000n;

function yearsAt(birthDate: string, departureAt: Date): number {
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime()) || birth > departureAt) return -1;
  let years = departureAt.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    departureAt.getUTCMonth() < birth.getUTCMonth() ||
    (departureAt.getUTCMonth() === birth.getUTCMonth() &&
      departureAt.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

export function validatePassengerManifest(
  passengers: BookingPassengerDto[],
  departureAt: Date,
): void {
  const adults = passengers.filter((p) => p.passengerType === 'ADULT').length;
  const lapInfants = passengers.filter(
    (p) => p.passengerType === 'INFANT',
  ).length;
  if (adults < 1 || lapInfants > adults) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message:
        'هر مسافر بزرگسال فقط می‌تواند یک نوزاد بدون صندلی همراه داشته باشد.',
    });
  }

  for (const passenger of passengers) {
    const age = yearsAt(passenger.birthDate, departureAt);
    const type = passenger.passengerType;
    const valid =
      age >= 0 &&
      ((type === 'ADULT' && age >= 12) ||
        (type === 'CHILD' && age < 12) ||
        (type === 'INFANT' && age < 2));
    if (!valid) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `نوع مسافر «${passenger.fullName}» با سن او در تاریخ پرواز مطابقت ندارد.`,
      });
    }
    if (type === 'INFANT' && passenger.seatCode) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'برای نوزاد بدون صندلی نباید صندلی انتخاب شود.',
      });
    }
    if (type === 'INFANT' && passenger.extraSeatRequested) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'برای نوزاد بدون صندلی امکان افزودن صندلی اضافه وجود ندارد.',
      });
    }
  }
}

export function passengerMultiplierBps(
  type: BookingPassengerType,
  channel: BookingChannel,
): bigint {
  if (type === 'INFANT') return INFANT_BPS;
  if (type === 'CHILD') {
    return channel === 'SYSTEM' ? SYSTEM_CHILD_BPS : CHARTER_CHILD_BPS;
  }
  return ADULT_BPS;
}

function applyBps(amount: Irr, bps: bigint): Irr {
  return (amount * bps + 5_000n) / 10_000n;
}

export function passengerFareRows(
  passengers: BookingPassengerDto[],
  unitFareIrr: Irr,
  unitTaxIrr: Irr,
  channel: BookingChannel,
) {
  return passengers.map((passenger) => {
    const multiplier = passengerMultiplierBps(passenger.passengerType, channel);
    return {
      passenger,
      occupiesSeat: passenger.passengerType !== 'INFANT',
      fareIrr: applyBps(unitFareIrr, multiplier),
      taxIrr: applyBps(unitTaxIrr, multiplier),
      // EXST is one adult base fare only: no tax, charge or baggage entitlement.
      extraSeatFareIrr: passenger.extraSeatRequested ? unitFareIrr : 0n,
    };
  });
}
