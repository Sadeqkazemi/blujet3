import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum FinanceReportScope {
  AGENCIES = 'AGENCIES',
  CHARTERS = 'CHARTERS',
  CUSTOMERS = 'CUSTOMERS',
}

export enum FinanceReportPeriod {
  FLIGHT = 'flight',
  DAY = 'day',
  MONTH = 'month',
  Q3 = 'q3',
  Q6 = 'q6',
  YEAR = 'year',
}

export enum FinanceExportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
  PDF = 'pdf',
}

export class FinanceReportQueryDto {
  @ApiProperty({ enum: FinanceReportScope })
  @IsEnum(FinanceReportScope)
  scope!: FinanceReportScope;

  @ApiProperty({ enum: FinanceReportPeriod })
  @IsEnum(FinanceReportPeriod)
  period!: FinanceReportPeriod;

  @ApiPropertyOptional({
    description: 'Inclusive ISO-8601 start of the selected Jalali period',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Exclusive ISO-8601 end of the selected Jalali period',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  flightInstanceId?: string;
}

export class FinanceReportExportQueryDto extends FinanceReportQueryDto {
  @ApiProperty({ enum: FinanceExportFormat })
  @IsEnum(FinanceExportFormat)
  format!: FinanceExportFormat;
}

export class FinanceFlightSearchQueryDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

const BOOKING_STATUSES = [
  'DRAFT',
  'HELD',
  'PAID',
  'TICKETED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
  'FLOWN',
  'NO_SHOW',
] as const;
const CABINS = ['ECONOMY', 'COMFORT', 'BUSINESS', 'FIRST'] as const;
const CHANNELS = ['SYSTEM', 'AGENCY', 'CHARTER'] as const;
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'REFUNDED', 'CANCELLED'] as const;

export class FinanceSalesQueryDto {
  @ApiPropertyOptional({ description: 'Exact flight instance for drill-down' })
  @IsOptional()
  @IsUUID()
  flightInstanceId?: string;

  @ApiPropertyOptional({ description: 'Inclusive booking-date start' })
  @IsOptional()
  @IsDateString()
  bookedFrom?: string;

  @ApiPropertyOptional({ description: 'Exclusive booking-date end' })
  @IsOptional()
  @IsDateString()
  bookedTo?: string;

  @ApiPropertyOptional({ description: 'Inclusive flight-date start' })
  @IsOptional()
  @IsDateString()
  flightFrom?: string;

  @ApiPropertyOptional({ description: 'Exclusive flight-date end' })
  @IsOptional()
  @IsDateString()
  flightTo?: string;

  @ApiPropertyOptional({ enum: BOOKING_STATUSES })
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  bookingStatus?: (typeof BOOKING_STATUSES)[number];

  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  paymentStatus?: (typeof PAYMENT_STATUSES)[number];

  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  originCode?: string;

  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  destCode?: string;

  @ApiPropertyOptional({ enum: CABINS })
  @IsOptional()
  @IsIn(CABINS)
  cabin?: (typeof CABINS)[number];

  @ApiPropertyOptional({ enum: CHANNELS })
  @IsOptional()
  @IsIn(CHANNELS)
  channel?: (typeof CHANNELS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  agencyId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class FinanceSalesExportQueryDto extends FinanceSalesQueryDto {
  @ApiProperty({ enum: FinanceExportFormat })
  @IsEnum(FinanceExportFormat)
  format!: FinanceExportFormat;
}
