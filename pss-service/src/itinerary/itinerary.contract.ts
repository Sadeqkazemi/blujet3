import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** Internal offer/order input. Route and schedule snapshots are server-owned. */
export class ItinerarySegmentDto {
  @ApiProperty({
    description: 'شناسه نمونه پرواز',
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
  })
  @IsUUID()
  flightInstanceId!: string;

  @ApiProperty({ description: 'ترتیب سگمنت از یک', example: 1 })
  @IsInt()
  @Min(1)
  sequence!: number;

  @ApiProperty({ description: 'کابین انتخابی', example: 'ECONOMY' })
  @IsString()
  cabin!: string;

  @ApiPropertyOptional({
    description: 'کد کلاس نرخی؛ در صورت حذف، کلاس پیش‌فرض سرور استفاده می‌شود',
    example: 'Y',
  })
  @IsOptional()
  @IsString()
  fareClassCode?: string;
}

export class ItineraryRequestDto {
  @ApiProperty({
    description: 'سگمنت‌های مرتب‌شده سفر؛ حداکثر دو توقف',
    type: [ItinerarySegmentDto],
    minItems: 1,
    maxItems: 3,
    example: [
      {
        flightInstanceId: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
        sequence: 1,
        cabin: 'ECONOMY',
        fareClassCode: 'Y',
      },
    ],
  })
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ItinerarySegmentDto)
  segments!: ItinerarySegmentDto[];
}

export type ResolvedItinerarySegment = {
  flightInstanceId: string;
  sequence: number;
  originCode: string;
  destinationCode: string;
  departureAt: Date;
  arrivalAt: Date;
  definitionStatus:
    'PUBLISHED' | 'DRAFT' | 'PENDING_OPERATIONS' | 'OPERATIONS_REJECTED';
  flightStatus: 'SCHEDULED' | 'DEPARTED' | 'CANCELLED';
};

export type ItineraryValidationCode =
  | 'ITINERARY_EMPTY'
  | 'ITINERARY_SEQUENCE_INVALID'
  | 'ITINERARY_DUPLICATE_SEGMENT'
  | 'ITINERARY_NOT_SELLABLE'
  | 'ITINERARY_ROUTE_DISCONTINUITY'
  | 'ITINERARY_CHRONOLOGY_INVALID';

export class ItineraryValidationError extends Error {
  constructor(
    readonly code: ItineraryValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'ItineraryValidationError';
  }
}

export function validateResolvedItinerary(
  input: readonly ResolvedItinerarySegment[],
): readonly ResolvedItinerarySegment[] {
  if (input.length === 0) {
    throw new ItineraryValidationError(
      'ITINERARY_EMPTY',
      'حداقل یک سگمنت برای سفر لازم است.',
    );
  }

  const segments = [...input].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const ids = new Set<string>();

  segments.forEach((segment, index) => {
    if (segment.sequence !== index + 1) {
      throw new ItineraryValidationError(
        'ITINERARY_SEQUENCE_INVALID',
        'ترتیب سگمنت‌های سفر معتبر نیست.',
      );
    }
    if (ids.has(segment.flightInstanceId)) {
      throw new ItineraryValidationError(
        'ITINERARY_DUPLICATE_SEGMENT',
        'یک نمونه پرواز نمی‌تواند دوبار در یک سفر تکرار شود.',
      );
    }
    ids.add(segment.flightInstanceId);

    if (
      segment.definitionStatus !== 'PUBLISHED' ||
      segment.flightStatus === 'CANCELLED'
    ) {
      throw new ItineraryValidationError(
        'ITINERARY_NOT_SELLABLE',
        'یکی از پروازهای انتخاب‌شده قابل فروش نیست.',
      );
    }
  });

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    if (previous.destinationCode !== current.originCode) {
      throw new ItineraryValidationError(
        'ITINERARY_ROUTE_DISCONTINUITY',
        'مبدأ و مقصد سگمنت‌های سفر پیوستگی ندارند.',
      );
    }
    if (previous.arrivalAt.getTime() >= current.departureAt.getTime()) {
      throw new ItineraryValidationError(
        'ITINERARY_CHRONOLOGY_INVALID',
        'زمان حرکت سگمنت بعدی باید بعد از رسیدن سگمنت قبلی باشد.',
      );
    }
  }

  return segments;
}
