import { BadRequestException } from '@nestjs/common';
import { CabinClass } from '../../database/enums';
import { ErrorCode } from '../../common/errors';

/** Spec + frontend: exactly two Latin letters + four digits, no separators. */
export const FLIGHT_NO_PATTERN = /^[A-Z]{2}\d{4}$/;

export type CabinCapacityInput = {
  cabin: CabinClass;
  /** Frontend wire name. */
  seats?: number;
  /** Spec wire name. */
  capacity?: number;
};

export type NormalizedCabinCapacity = {
  cabin: CabinClass;
  seats: number;
  capacity: number;
};

/**
 * Uppercase only — does NOT trim and does NOT strip spaces/hyphens.
 * Leading/trailing spaces therefore fail `assertValidFlightNo`.
 */
export function normalizeFlightNo(raw: string): string {
  return raw.toUpperCase();
}

export function assertValidFlightNo(flightNo: string): void {
  if (flightNo !== flightNo.trim() || !FLIGHT_NO_PATTERN.test(flightNo)) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message:
        'شماره پرواز باید دقیقاً دو حرف لاتین و چهار رقم باشد (مثال: XY1234).',
    });
  }
}

/**
 * When durationMinutes is provided, arrivalAt is ALWAYS derived as
 * departureAt + durationMinutes (milliseconds). Callers must not pass a
 * conflicting arrivalAt; if they do, it is ignored in favour of duration.
 */
export function arrivalFromDuration(
  departureAt: Date,
  durationMinutes: number,
): Date {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'مدت پرواز باید عدد صحیح مثبت باشد.',
    });
  }
  return new Date(departureAt.getTime() + durationMinutes * 60_000);
}

export function normalizeCabinCapacities(
  rows: CabinCapacityInput[] | undefined,
  totalCapacity: number,
): NormalizedCabinCapacity[] {
  if (!rows || rows.length === 0) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'ظرفیت کابین‌ها را وارد کنید.',
    });
  }
  const seen = new Set<string>();
  let sum = 0;
  const out: NormalizedCabinCapacity[] = [];
  for (const row of rows) {
    if (!Object.values(CabinClass).includes(row.cabin)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کابین نامعتبر است (فقط ECONOMY، COMFORT، BUSINESS، FIRST).',
      });
    }
    if (seen.has(row.cabin)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `کابین ${row.cabin} تکراری است.`,
      });
    }
    seen.add(row.cabin);
    const seats = row.seats ?? row.capacity;
    if (seats == null || !Number.isInteger(seats) || seats < 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ظرفیت هر کابین باید عدد صحیح بزرگ‌تر یا مساوی صفر باشد.',
      });
    }
    sum += seats;
    out.push({ cabin: row.cabin, seats, capacity: seats });
  }
  if (sum !== totalCapacity) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: `مجموع ظرفیت کابین‌ها (${sum}) با ظرفیت کل پرواز (${totalCapacity}) برابر نیست.`,
    });
  }
  return out;
}

export function serializeCabinCapacities(
  value: unknown,
): NormalizedCabinCapacity[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const r = row as CabinCapacityInput;
    const seats = Number(r.seats ?? r.capacity ?? 0);
    return {
      cabin: r.cabin,
      seats,
      capacity: seats,
    };
  });
}
