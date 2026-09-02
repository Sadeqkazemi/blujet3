import { BadRequestException } from '@nestjs/common';
import { CabinClass } from '../../database/enums';
import { ErrorCode } from '../../common/errors';

export type AircraftCabinCapacityInput = {
  cabinType: CabinClass;
  capacity: number;
};

type PhysicalCabinCounts = Record<CabinClass, number>;

/**
 * Resolve the explicit commercial capacity of each aircraft cabin against the
 * physical seat map. A lower operating capacity is allowed; a capacity above
 * the physical map is never allowed. Legacy clients that omit the new list
 * retain the old behaviour (all physical seats enabled).
 */
export function resolveAircraftCabinCapacities(
  rows: AircraftCabinCapacityInput[] | undefined,
  physical: PhysicalCabinCounts,
  totalCapacity: number,
): AircraftCabinCapacityInput[] {
  const source =
    rows && rows.length > 0
      ? rows
      : (Object.entries(physical) as [CabinClass, number][])
          .filter(([, capacity]) => capacity > 0)
          .map(([cabinType, capacity]) => ({ cabinType, capacity }));

  const seen = new Set<CabinClass>();
  let total = 0;
  for (const row of source) {
    if (!Object.values(CabinClass).includes(row.cabinType)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'نوع کابین هواپیما معتبر نیست.',
      });
    }
    if (seen.has(row.cabinType)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `کابین ${row.cabinType} تکراری است.`,
      });
    }
    seen.add(row.cabinType);
    if (!Number.isInteger(row.capacity) || row.capacity <= 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ظرفیت کابین فعال باید عدد صحیح بزرگ‌تر از صفر باشد.',
      });
    }
    const physicalCapacity = physical[row.cabinType] ?? 0;
    if (physicalCapacity === 0 || row.capacity > physicalCapacity) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `ظرفیت کابین ${row.cabinType} (${row.capacity}) از ظرفیت فیزیکی آن (${physicalCapacity}) بیشتر است.`,
      });
    }
    total += row.capacity;
  }
  if (total !== totalCapacity) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      message: `مجموع ظرفیت کابین‌ها (${total}) با ظرفیت کل هواپیما (${totalCapacity}) برابر نیست.`,
    });
  }
  return source.map((row) => ({ ...row }));
}
