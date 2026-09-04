import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BookingChannel, type BookingStatus } from '../../../database/enums';
import {
  CoreItineraryQuoteSegmentDto,
  CoreItineraryQuoteTravellerDto,
} from './quote-core-itinerary.dto';
import type { CoreItineraryChannel } from './resolve-core-itinerary.dto';

const INTERNAL_CHANNELS = [
  BookingChannel.SYSTEM,
  BookingChannel.AGENCY,
] as const;

export class HoldCoreItineraryTravellerDto extends CoreItineraryQuoteTravellerDto {
  @ApiProperty({ example: 'علی رضایی', description: 'نام کامل مسافر' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional({
    example: '0012345678',
    description: 'کد ملی؛ در پایگاه داده رمزگذاری و برای جستجو هش می‌شود',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  nationalId?: string;

  @ApiPropertyOptional({
    example: 'A1234567',
    description: 'شماره گذرنامه برای سفر مبتنی بر گذرنامه',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(30)
  passportNo?: string;

  @ApiPropertyOptional({
    enum: ['male', 'female'],
    example: 'male',
    description: 'جنسیت ثبت‌شده مسافر',
  })
  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @ApiPropertyOptional({
    example: '09121234567',
    description: 'شماره تماس مسافر؛ به‌صورت رمزگذاری‌شده نگهداری می‌شود',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;
}

export class HoldCoreItineraryDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه مالک: مشتری برای SYSTEM یا آژانس برای AGENCY',
  })
  @IsUUID()
  ownerId!: string;

  @ApiPropertyOptional({
    example: '09121234567',
    description: 'شماره تماس مشترک رزرو',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

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
    description: 'یک تا سه سگمنت مرتب همراه خدمات مختص هر سگمنت',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CoreItineraryQuoteSegmentDto)
  segments!: CoreItineraryQuoteSegmentDto[];

  @ApiProperty({
    type: [HoldCoreItineraryTravellerDto],
    minItems: 1,
    maxItems: 9,
    description: 'فهرست مشترک مسافران همه سگمنت‌ها',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => HoldCoreItineraryTravellerDto)
  travellers!: HoldCoreItineraryTravellerDto[];
}

export class HeldCoreItinerarySegmentDto {
  @ApiProperty({ example: 1, description: 'ترتیب سگمنت' })
  sequence!: number;

  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه نمونه پرواز',
  })
  flightInstanceId!: string;

  @ApiProperty({ example: 'ECONOMY', description: 'کابین نگه‌داری‌شده' })
  cabin!: string;

  @ApiPropertyOptional({
    example: 'Y',
    nullable: true,
    description: 'کلاس نرخی نگه‌داری‌شده',
  })
  fareClassCode!: string | null;

  @ApiProperty({ example: 2, description: 'تعداد صندلی نگه‌داری‌شده' })
  occupiedSeats!: number;

  @ApiProperty({ example: '24300000', description: 'جمع سگمنت به ریال' })
  totalIrr!: string;
}

export class HeldCoreItineraryDto {
  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه داخلی سفارش',
  })
  id!: string;

  @ApiProperty({ example: 'BJ4X2K', description: 'PNR مشترک همه سگمنت‌ها' })
  pnr!: string;

  @ApiProperty({ example: 'HELD', description: 'وضعیت سفارش' })
  status!: BookingStatus;

  @ApiProperty({ example: 'IRR', description: 'واحد مبلغ' })
  currency!: 'IRR';

  @ApiProperty({
    example: '2026-09-04T12:15:00.000Z',
    description: 'انقضای مشترک hold به UTC',
  })
  holdExpiresAt!: string;

  @ApiProperty({
    type: [HeldCoreItinerarySegmentDto],
    description: 'سگمنت‌های نگه‌داری‌شده در ترتیب سفر',
  })
  segments!: HeldCoreItinerarySegmentDto[];

  @ApiProperty({ example: '46100000', description: 'جمع کل سفارش به ریال' })
  totalIrr!: string;
}

export class HoldCoreItineraryResponseDto {
  @ApiProperty({ example: true, description: 'موفقیت درخواست' })
  success!: true;

  @ApiProperty({
    type: HeldCoreItineraryDto,
    description: 'رزرو موقت چندسگمنتی ایجادشده یا بازیابی‌شده',
  })
  data!: HeldCoreItineraryDto;
}
