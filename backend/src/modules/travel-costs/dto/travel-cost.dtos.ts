import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  Matches,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';
import {
  TRAVEL_EXTRA_BILLING_UNITS,
  TRAVEL_EXTRA_CODE_PATTERN,
  type TravelExtraBillingUnit,
  type TravelExtraCode,
} from '../../../database/entities/travel-extra-setting.entity';

export class CreateTravelCostDto {
  @ApiProperty({
    type: String,
    example: 'CUSTOM_priority-service',
    description:
      'کد ثابت خدمت یا کد سفارشی با پیشوند CUSTOM_ و شناسه ۸ تا ۶۴ کاراکتری',
  })
  @Matches(TRAVEL_EXTRA_CODE_PATTERN)
  code!: TravelExtraCode;

  @ApiProperty({ example: 'بار اضافه' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  titleFa!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  titleEn?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  titleAr?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  descriptionFa?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  descriptionEn?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  descriptionAr?: string;

  @ApiProperty({ enum: TRAVEL_EXTRA_BILLING_UNITS })
  @IsIn(TRAVEL_EXTRA_BILLING_UNITS)
  billingUnit!: TravelExtraBillingUnit;

  @ApiProperty({ type: String, description: 'مبلغ واحد به ریال' })
  @IsIrrAmount()
  @MinIrrAmount(0n)
  @TransformToIrr()
  priceIrr!: Irr;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  purchaseEnabled?: boolean;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

export class UpdateTravelCostDto extends PartialType(CreateTravelCostDto) {}
