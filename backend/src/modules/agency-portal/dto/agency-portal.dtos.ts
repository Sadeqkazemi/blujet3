import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsIn,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';

export class PostInboxMessageDto {
  @ApiProperty({ example: 'سلام، فردا تسویه انجام می‌شود.' })
  @IsString()
  @MinLength(1)
  body: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  attachmentIds?: string[];
}

export class RequestCreditIncreaseDto {
  @ApiProperty({
    example: '2000000000',
    type: String,
    description: 'سقف اعتبار درخواستی به ریال (رشته یا عدد صحیح)',
  })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  requestedLimitIrr: Irr;

  @ApiPropertyOptional({ example: 'رشد فروش فصل تابستان' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UploadDocumentDto {
  @ApiProperty({ enum: ['LICENSE', 'CONTRACT', 'OTHER'], example: 'LICENSE' })
  @IsIn(['LICENSE', 'CONTRACT', 'OTHER'])
  docType: 'LICENSE' | 'CONTRACT' | 'OTHER';
}

const WEBSERVICE_SCOPES = ['FULL', 'SEARCH_BOOK'] as const;
const WEBSERVICE_MONTHS = [1, 3, 12] as const;

export class RequestWebserviceDto {
  @ApiProperty({
    enum: WEBSERVICE_SCOPES,
    example: 'SEARCH_BOOK',
    description: 'جستجو و رزرو یا فروش کامل (صدور بلیط)',
  })
  @IsIn(WEBSERVICE_SCOPES)
  scope: (typeof WEBSERVICE_SCOPES)[number];

  @ApiProperty({
    enum: WEBSERVICE_MONTHS,
    example: 1,
    description: 'مدت اشتراک به ماه',
  })
  @IsIn(WEBSERVICE_MONTHS)
  months: (typeof WEBSERVICE_MONTHS)[number];

  @ApiPropertyOptional({ example: 'برای اتصال سیستم رزرواسیون داخلی' })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Server-side capacity and demand inquiry used before an agency seat request. */
export class AgencySeatInquiryDto {
  @ApiProperty({ example: 'flight-instance-id' })
  @IsString()
  @MinLength(1)
  flightInstanceId: string;

  @ApiProperty({ enum: ['ECONOMY', 'COMFORT', 'BUSINESS', 'FIRST'] })
  @IsIn(['ECONOMY', 'COMFORT', 'BUSINESS', 'FIRST'])
  cabin: 'ECONOMY' | 'COMFORT' | 'BUSINESS' | 'FIRST';

  @ApiProperty({ example: 'Y' })
  @IsString()
  @MinLength(1)
  fareClassCode: string;

  @ApiProperty({ example: 20, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(500)
  seats: number;
}

export class RequestAgencySeatsDto {
  @ApiProperty({ example: 'flight-instance-id' })
  @IsString()
  @MinLength(1)
  flightInstanceId: string;

  @ApiProperty({ enum: ['ECONOMY', 'COMFORT', 'BUSINESS', 'FIRST'] })
  @IsIn(['ECONOMY', 'COMFORT', 'BUSINESS', 'FIRST'])
  cabin: 'ECONOMY' | 'COMFORT' | 'BUSINESS' | 'FIRST';

  @ApiProperty({ example: 'Y' })
  @IsString()
  @MinLength(1)
  fareClassCode: string;

  @ApiProperty({ example: 20, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(500)
  seats: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      'شناسه رخدادهای پروازی که آژانس پس از استعلام انتخاب کرده است.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  selectedFlightInstanceIds?: string[];

  @ApiPropertyOptional({ example: [0, 6], type: [Number] })
  @IsOptional()
  @IsIn([0, 1, 2, 3, 4, 5, 6], { each: true })
  preferredWeekdays?: number[];

  @ApiPropertyOptional({
    enum: [0, 1, 3, 6, 12],
    example: 3,
    description:
      'دوره درخواست؛ مقدار 0 یعنی هفتگی و سایر مقادیر تعداد ماه‌های دوره هستند.',
  })
  @IsOptional()
  @IsIn([0, 1, 3, 6, 12])
  termMonths?: 0 | 1 | 3 | 6 | 12;

  @ApiPropertyOptional({
    enum: ['INVOICE', 'CREDIT'],
    example: 'INVOICE',
    description: 'روش تسویه درخواست: فاکتور نقدی یا استفاده از اعتبار آژانس',
  })
  @IsOptional()
  @IsIn(['INVOICE', 'CREDIT'])
  payMethod?: 'INVOICE' | 'CREDIT';
}
