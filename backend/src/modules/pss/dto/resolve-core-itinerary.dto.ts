import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { BookingChannel, CabinClass } from '../../../database/enums';

const INTERNAL_CHANNELS = [
  BookingChannel.SYSTEM,
  BookingChannel.AGENCY,
] as const;
const CABINS = Object.values(CabinClass);

export type CoreItineraryChannel = (typeof INTERNAL_CHANNELS)[number];

export class CoreItinerarySegmentDto {
  @ApiProperty({
    description: 'شناسه نمونه پرواز در Core',
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
  })
  @IsUUID()
  flightInstanceId!: string;

  @ApiProperty({ description: 'ترتیب پیوسته سگمنت از عدد یک', example: 1 })
  @IsInt()
  @Min(1)
  sequence!: number;

  @ApiProperty({ description: 'کابین درخواستی', example: 'ECONOMY' })
  @IsIn(CABINS)
  cabin!: CabinClass;

  @ApiPropertyOptional({
    description:
      'کد کلاس نرخی؛ در صورت حذف، ارزان‌ترین کلاس در دسترس انتخاب می‌شود',
    example: 'Y',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fareClassCode?: string;
}

export class ResolveCoreItineraryDto {
  @ApiPropertyOptional({
    description: 'کانال فروش که محدودیت ظرفیت آن باید کنترل شود',
    example: 'SYSTEM',
    enum: INTERNAL_CHANNELS,
    default: BookingChannel.SYSTEM,
  })
  @IsOptional()
  @IsIn(INTERNAL_CHANNELS)
  channel: CoreItineraryChannel = BookingChannel.SYSTEM;

  @ApiProperty({
    description: 'یک تا سه سگمنت مرتب‌شده سفر',
    type: [CoreItinerarySegmentDto],
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
  @Type(() => CoreItinerarySegmentDto)
  segments!: CoreItinerarySegmentDto[];
}

export class ResolvedCoreItinerarySegmentDto {
  @ApiProperty({
    description: 'شناسه نمونه پرواز',
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
  })
  flightInstanceId!: string;

  @ApiProperty({ description: 'ترتیب سگمنت', example: 1 })
  sequence!: number;

  @ApiProperty({ description: 'شماره پرواز', example: 'BJ101' })
  flightNo!: string;

  @ApiProperty({ description: 'کد فرودگاه مبدأ', example: 'IKA' })
  originCode!: string;

  @ApiProperty({ description: 'کد فرودگاه مقصد', example: 'DXB' })
  destinationCode!: string;

  @ApiProperty({
    description: 'زمان حرکت به UTC',
    example: '2026-10-01T08:00:00.000Z',
  })
  departureAt!: Date;

  @ApiProperty({
    description: 'زمان رسیدن به UTC',
    example: '2026-10-01T10:00:00.000Z',
  })
  arrivalAt!: Date;

  @ApiProperty({ description: 'کابین تأییدشده', example: 'ECONOMY' })
  cabin!: CabinClass;

  @ApiPropertyOptional({
    description: 'کلاس نرخی تأییدشده',
    example: 'Y',
    nullable: true,
  })
  fareClassCode!: string | null;

  @ApiProperty({
    description: 'ظرفیت قابل مشاهده در لحظه؛ رزرو یا hold نیست',
    example: 4,
  })
  availableSeats!: number;
}

export class ResolvedCoreItineraryDto {
  @ApiProperty({
    description: 'کانال اعتبارسنجی‌شده',
    example: 'SYSTEM',
    enum: INTERNAL_CHANNELS,
  })
  channel!: CoreItineraryChannel;

  @ApiProperty({ type: [ResolvedCoreItinerarySegmentDto] })
  segments!: ResolvedCoreItinerarySegmentDto[];
}

export class ResolveCoreItineraryResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: ResolvedCoreItineraryDto })
  data!: ResolvedCoreItineraryDto;
}
