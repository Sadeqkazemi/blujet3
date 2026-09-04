import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { BookingChannel } from '../../../database/enums';
import {
  CoreItinerarySegmentDto,
  ResolvedCoreItinerarySegmentDto,
  type CoreItineraryChannel,
} from './resolve-core-itinerary.dto';

const INTERNAL_CHANNELS = [
  BookingChannel.SYSTEM,
  BookingChannel.AGENCY,
] as const;
const PASSENGER_TYPES = ['ADULT', 'CHILD', 'INFANT'] as const;
export type CoreQuotePassengerType = (typeof PASSENGER_TYPES)[number];

export class CoreItineraryQuoteTravellerDto {
  @ApiProperty({
    enum: PASSENGER_TYPES,
    example: 'ADULT',
    description: 'نوع مسافر برای محاسبه نرخ هر پرواز',
  })
  @IsIn(PASSENGER_TYPES)
  passengerType!: CoreQuotePassengerType;

  @ApiProperty({
    example: '1990-05-20',
    description: 'تاریخ تولد ISO برای کنترل نوع مسافر در هر سگمنت',
  })
  @IsDateString({ strict: true })
  birthDate!: string;
}

export class CoreItineraryQuoteExtraDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه هزینه سفر فعال در کاتالوگ Core',
  })
  @IsUUID()
  id!: string;

  @ApiProperty({
    example: 1,
    minimum: 1,
    maximum: 50,
    description: 'تعداد؛ فقط برای بار اضافه می‌تواند بیش از یک باشد',
  })
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;
}

export class CoreItineraryQuoteSegmentDto extends CoreItinerarySegmentDto {
  @ApiPropertyOptional({
    type: [CoreItineraryQuoteExtraDto],
    description: 'خدمات انتخابی مختص همین سگمنت',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CoreItineraryQuoteExtraDto)
  extras?: CoreItineraryQuoteExtraDto[];
}

export class QuoteCoreItineraryDto {
  @ApiPropertyOptional({
    enum: INTERNAL_CHANNELS,
    default: BookingChannel.SYSTEM,
    example: 'SYSTEM',
    description: 'کانال قیمت و سهمیه فروش',
  })
  @IsOptional()
  @IsIn(INTERNAL_CHANNELS)
  channel: CoreItineraryChannel = BookingChannel.SYSTEM;

  @ApiProperty({
    type: [CoreItineraryQuoteSegmentDto],
    minItems: 1,
    maxItems: 3,
    description: 'یک تا سه سگمنت مرتب سفر',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CoreItineraryQuoteSegmentDto)
  segments!: CoreItineraryQuoteSegmentDto[];

  @ApiProperty({
    type: [CoreItineraryQuoteTravellerDto],
    minItems: 1,
    maxItems: 9,
    description: 'فهرست مشترک مسافران همه سگمنت‌ها بدون اطلاعات هویتی',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => CoreItineraryQuoteTravellerDto)
  travellers!: CoreItineraryQuoteTravellerDto[];
}

export class CoreItineraryTravellerPriceDto {
  @ApiProperty({ example: 1, description: 'شماره مسافر در ورودی' })
  sequence!: number;

  @ApiProperty({
    enum: PASSENGER_TYPES,
    example: 'ADULT',
    description: 'نوع مسافر قیمت‌گذاری‌شده',
  })
  passengerType!: CoreQuotePassengerType;

  @ApiProperty({ example: '9007199254740993', description: 'کرایه به ریال' })
  fareIrr!: string;

  @ApiProperty({ example: '900000', description: 'مالیات و عوارض به ریال' })
  taxIrr!: string;

  @ApiProperty({
    example: '9007199255640993',
    description: 'جمع مسافر به ریال',
  })
  totalIrr!: string;
}

export class CoreItineraryQuotedExtraDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه خدمت قیمت‌گذاری‌شده',
  })
  id!: string;

  @ApiProperty({ example: 'EXTRA_BAGGAGE', description: 'کد پایدار خدمت' })
  code!: string;

  @ApiProperty({ example: 'بار اضافه', description: 'عنوان فارسی خدمت' })
  titleFa!: string;

  @ApiProperty({ example: 'PER_KG', description: 'واحد محاسبه خدمت' })
  billingUnit!: string;

  @ApiProperty({ example: '500000', description: 'نرخ واحد به ریال' })
  unitPriceIrr!: string;

  @ApiProperty({ example: 5, description: 'تعداد نهایی محاسبه‌شده' })
  quantity!: number;

  @ApiProperty({ example: '2500000', description: 'جمع خدمت به ریال' })
  totalIrr!: string;
}

export class QuotedCoreItinerarySegmentDto extends ResolvedCoreItinerarySegmentDto {
  @ApiPropertyOptional({
    nullable: true,
    example: 20,
    description: 'بار مجاز همین سگمنت؛ null یعنی تنظیم نشده است',
  })
  baggageAllowanceKg!: number | null;

  @ApiProperty({
    type: [CoreItineraryTravellerPriceDto],
    description: 'ریز قیمت هر مسافر در همین سگمنت',
  })
  travellers!: CoreItineraryTravellerPriceDto[];

  @ApiProperty({
    type: [CoreItineraryQuotedExtraDto],
    description: 'خدمات انتخابی و مبلغ آن‌ها در همین سگمنت',
  })
  extras!: CoreItineraryQuotedExtraDto[];

  @ApiProperty({ example: '20000000', description: 'جمع کرایه سگمنت به ریال' })
  fareIrr!: string;

  @ApiProperty({ example: '1800000', description: 'جمع مالیات و عوارض سگمنت' })
  taxIrr!: string;

  @ApiProperty({ example: '2500000', description: 'جمع خدمات سگمنت به ریال' })
  extrasIrr!: string;

  @ApiProperty({ example: '24300000', description: 'جمع نهایی سگمنت به ریال' })
  totalIrr!: string;
}

export class QuotedCoreItineraryDto {
  @ApiProperty({ example: 'IRR', description: 'واحد همه مبالغ پاسخ' })
  currency!: 'IRR';

  @ApiProperty({
    example: '2026-09-04T12:00:00.000Z',
    description: 'زمان محاسبه Quote به UTC',
  })
  quotedAt!: string;

  @ApiProperty({
    example: true,
    description: 'بازقیمت‌گذاری پیش از hold/پرداخت الزامی است',
  })
  requiresReprice!: true;

  @ApiProperty({
    enum: INTERNAL_CHANNELS,
    example: 'SYSTEM',
    description: 'کانال نرخ و سهمیه اعمال‌شده',
  })
  channel!: CoreItineraryChannel;

  @ApiProperty({
    type: [QuotedCoreItinerarySegmentDto],
    description: 'ریز قیمت و شرایط هر سگمنت',
  })
  segments!: QuotedCoreItinerarySegmentDto[];

  @ApiProperty({ example: '40000000', description: 'جمع کرایه همه سگمنت‌ها' })
  fareIrr!: string;

  @ApiProperty({
    example: '3600000',
    description: 'جمع مالیات و عوارض همه سگمنت‌ها',
  })
  taxIrr!: string;

  @ApiProperty({ example: '2500000', description: 'جمع خدمات همه سگمنت‌ها' })
  extrasIrr!: string;

  @ApiProperty({ example: '46100000', description: 'جمع نهایی سفر به ریال' })
  totalIrr!: string;
}

export class QuoteCoreItineraryResponseDto {
  @ApiProperty({ example: true, description: 'موفقیت درخواست' })
  success!: true;

  @ApiProperty({
    type: QuotedCoreItineraryDto,
    description: 'Quote خواندنی سفر چندسگمنتی',
  })
  data!: QuotedCoreItineraryDto;
}
