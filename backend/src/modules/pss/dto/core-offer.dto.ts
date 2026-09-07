import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsDefined,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  QuoteCoreItineraryDto,
  QuotedCoreItineraryDto,
} from './quote-core-itinerary.dto';
import {
  HeldCoreItineraryDto,
  HoldCoreItineraryDto,
} from './hold-core-itinerary.dto';

const SELLER_TYPES = ['USER', 'AGENCY'] as const;
export type CoreOfferSellerType = (typeof SELLER_TYPES)[number];

export class CoreOfferSellerDto {
  @ApiProperty({
    enum: SELLER_TYPES,
    example: 'USER',
    description: 'نوع مالک Offer؛ با کانال SYSTEM/AGENCY منطبق است',
  })
  @IsIn(SELLER_TYPES)
  type!: CoreOfferSellerType;

  @ApiProperty({
    example: '3f4c1f5e-9a84-4f5a-8c4a-2c4f2e8b4e91',
    description: 'شناسه UUID مالک که توسط لایهٔ احراز هویت داخلی تعیین می‌شود',
  })
  @IsUUID()
  id!: string;
}

export class CoreOfferSearchDto extends QuoteCoreItineraryDto {
  @ApiProperty({
    type: CoreOfferSellerDto,
    description: 'مالک احراز‌شدهٔ Offer؛ از ورودی مرورگر پذیرفته نمی‌شود',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => CoreOfferSellerDto)
  seller!: CoreOfferSellerDto;
}

export class CoreOfferRepriceDto extends CoreOfferSearchDto {
  @ApiProperty({
    description: 'توکن یکپارچگی HMAC صادرشده برای همان درخواست Offer',
    example: 'eyJ2IjoxLCJvZmZlcklkIjoi...signature',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  integrityToken!: string;
}

export class CoreOfferDto {
  @ApiProperty({
    example: '0f86fca5-ecdd-47d8-8f4f-6e47484b0a7d',
    description: 'شناسهٔ عمومی و غیرقابل حدس Offer',
  })
  offerId!: string;

  @ApiProperty({
    example: '2026-09-07T12:15:00.000Z',
    description: 'زمان انقضا به UTC',
  })
  expiresAt!: string;

  @ApiProperty({ type: CoreOfferSellerDto, description: 'مالک Offer' })
  seller!: CoreOfferSellerDto;

  @ApiProperty({
    type: QuotedCoreItineraryDto,
    description: 'قیمت‌گذاری فعلی و ریز سگمنت‌ها در Core',
  })
  quote!: QuotedCoreItineraryDto;

  @ApiProperty({
    description: 'توکن یکپارچگی opaque؛ فاقد PII و غیرقابل ویرایش',
    example: 'eyJ2IjoxLCJvZmZlcklkIjoi...signature',
  })
  integrityToken!: string;
}

export class CoreOfferResponseDto {
  @ApiProperty({ example: true, description: 'موفقیت درخواست' })
  success!: true;

  @ApiProperty({ type: CoreOfferDto, description: 'Offer امضاشده و کوتاه‌عمر' })
  data!: CoreOfferDto;
}

export class CoreOfferRepriceResultDto {
  @ApiProperty({ type: QuotedCoreItineraryDto })
  quote!: QuotedCoreItineraryDto;

  @ApiProperty({ example: '46100000', description: 'جمع قبلی به ریال' })
  previousTotalIrr!: string;

  @ApiProperty({ example: '47100000', description: 'جمع فعلی به ریال' })
  currentTotalIrr!: string;

  @ApiProperty({
    example: true,
    description: 'آیا مبلغ نسبت به Offer تغییر کرده است',
  })
  priceChanged!: boolean;

  @ApiProperty({
    example: '2026-09-07T12:15:00.000Z',
    description: 'زمان اعتبارسنجی مجدد به UTC',
  })
  repricedAt!: string;
}

export class CoreOfferRepriceResponseDto {
  @ApiProperty({ example: true, description: 'موفقیت درخواست' })
  success!: true;

  @ApiProperty({
    type: CoreOfferRepriceResultDto,
    description: 'نتیجهٔ بازقیمت‌گذاری',
  })
  data!: CoreOfferRepriceResultDto;
}

export class CoreOfferHoldDto extends HoldCoreItineraryDto {
  @ApiProperty({
    description: 'توکن یکپارچگی HMAC صادرشده برای همین Offer',
    example: 'eyJ2IjoxLCJvZmZlcklkIjoi...signature',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  integrityToken!: string;
}

export class CoreOfferHoldResponseDto {
  @ApiProperty({ example: true, description: 'موفقیت درخواست' })
  success!: true;

  @ApiProperty({
    type: HeldCoreItineraryDto,
    description: 'Order/Hold ایجادشده از Offer مصرف‌شده',
  })
  data!: HeldCoreItineraryDto & { sourceOfferId: string };
}
