import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';
import {
  BookingChannel,
  CabinClass,
  ChargeCalculationMode,
  ChargeKind,
} from '../../../database/enums';
import { normalizeFlightNo } from '../flight-definition.util';

const CABIN_CLASSES = Object.values(CabinClass);
const BOOKING_CHANNELS = Object.values(BookingChannel);

export class CabinCapacityDto {
  @ApiProperty({ enum: CABIN_CLASSES })
  @IsIn(CABIN_CLASSES)
  cabin!: CabinClass;

  @ApiPropertyOptional({
    description: 'ظرفیت کابین (نام frontend)',
    example: 120,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  seats?: number;

  @ApiPropertyOptional({
    description: 'ظرفیت کابین (نام مشخصات — alias seats)',
    example: 120,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  capacity?: number;
}

export class ChargeRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'مالیات بر ارزش افزوده' })
  @IsString()
  title!: string;

  @ApiProperty({ enum: ['TAX', 'FEE'] })
  @IsIn(['TAX', 'FEE'])
  kind!: ChargeKind;

  @ApiProperty({ enum: ['FIXED', 'PERCENTAGE'] })
  @IsIn(['FIXED', 'PERCENTAGE'])
  calculationMode!: ChargeCalculationMode;

  @ApiPropertyOptional({ type: String, example: '500000' })
  @ValidateIf((o: ChargeRuleDto) => o.calculationMode === 'FIXED')
  @IsIrrAmount()
  @MinIrrAmount(0n)
  @TransformToIrr()
  fixedAmountIrr?: Irr | null;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Basis points — 1000 = 10%',
  })
  @ValidateIf((o: ChargeRuleDto) => o.calculationMode === 'PERCENTAGE')
  @IsInt()
  @Min(0)
  @Max(100_000)
  percentageBasisPoints?: number | null;

  @ApiPropertyOptional({
    enum: [...CABIN_CLASSES, null],
    nullable: true,
    description: 'null = همه کابین‌ها',
  })
  @IsOptional()
  @IsIn([...CABIN_CLASSES, null])
  cabin?: CabinClass | null;

  @ApiPropertyOptional({ description: 'alias effectiveFrom (frontend)' })
  @IsOptional()
  @IsISO8601()
  validFrom?: string | null;

  @ApiPropertyOptional({ description: 'alias effectiveTo (frontend)' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  effectiveTo?: string | null;

  @ApiPropertyOptional({ description: 'alias isActive (frontend)' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateFlightDefinitionDto {
  @ApiProperty({ example: 'THR' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  originCode!: string;

  @ApiProperty({ example: 'MHD' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  destCode!: string;

  @ApiProperty({
    example: 'XY1234',
    description:
      'Pattern ^[A-Z]{2}\\d{4}$ — uppercased; hyphens/spaces NOT stripped',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return '';
    return normalizeFlightNo(value);
  })
  @IsString()
  @Matches(/^[A-Z]{2}\d{4}$/, {
    message:
      'شماره پرواز باید دقیقاً دو حرف لاتین و چهار رقم باشد (مثال: XY1234)',
  })
  flightNo!: string;

  @ApiProperty({ description: 'UTC ISO departure' })
  @IsISO8601()
  departureAt!: string;

  @ApiProperty({
    example: 90,
    description:
      'Positive integer minutes. arrivalAt is derived as departureAt + durationMinutes.',
  })
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  durationMinutes!: number;

  @ApiProperty({ example: 180 })
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;

  @ApiProperty({ type: [CabinCapacityDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CabinCapacityDto)
  cabinCapacities!: CabinCapacityDto[];

  @ApiProperty({ type: String, example: '38000000' })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  basePriceIrr!: Irr;

  @ApiPropertyOptional({ example: 'Airbus A320' })
  @IsOptional()
  @IsString()
  aircraftType?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  charterSeats?: number;

  @ApiPropertyOptional({ type: [ChargeRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChargeRuleDto)
  chargeRules?: ChargeRuleDto[];

  @ApiPropertyOptional({ type: String, example: '40000000' })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  competitorPriceIrr?: Irr;
}

export class UpdateFlightDefinitionDto extends CreateFlightDefinitionDto {}

export class CompleteScheduledFareRuleDto {
  @ApiProperty({ enum: CABIN_CLASSES })
  @IsIn(CABIN_CLASSES)
  cabin!: CabinClass;

  @ApiProperty({ example: 'Y' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9]{1,8}$/)
  classCode!: string;

  @ApiProperty({ type: String, example: '39000000' })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  priceIrr!: Irr;

  @ApiProperty({ example: 120 })
  @IsInt()
  @Min(1)
  @Max(1000)
  seatsAllocated!: number;

  @ApiPropertyOptional({ type: String, example: '0' })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(0n)
  @TransformToIrr()
  taxIrr?: Irr;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  refundable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  changeable?: boolean;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  baggageAllowanceKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiPropertyOptional({ enum: BOOKING_CHANNELS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(BOOKING_CHANNELS, { each: true })
  allowedChannels?: BookingChannel[];
}

export class CompleteScheduledPricingProposalDto {
  @ApiProperty({ type: String, example: '39000000' })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  proposedPriceIrr!: Irr;

  @ApiPropertyOptional({ type: String, example: '42000000' })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  legalRateIrr?: Irr;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commercialNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  operationsNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ceoNote?: string;
}

/**
 * Canonical command for completing an occurrence materialized by a seasonal
 * schedule. Physical route/date/aircraft/capacity are deliberately absent:
 * they are inherited from the occurrence and cannot be overridden here.
 */
export class CompleteScheduledFlightDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @ApiProperty({ type: String, example: '38000000' })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  basePriceIrr!: Irr;

  @ApiPropertyOptional({ type: String, example: '40000000' })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  competitorPriceIrr?: Irr;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  charterSeats?: number;

  @ApiPropertyOptional({ type: [ChargeRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChargeRuleDto)
  chargeRules?: ChargeRuleDto[];

  @ApiProperty({ type: [CompleteScheduledFareRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompleteScheduledFareRuleDto)
  fareRules!: CompleteScheduledFareRuleDto[];

  @ApiProperty({ type: CompleteScheduledPricingProposalDto })
  @ValidateNested()
  @Type(() => CompleteScheduledPricingProposalDto)
  pricingProposal!: CompleteScheduledPricingProposalDto;
}
