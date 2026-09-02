import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CabinCapacityDto } from './flight-definition.dto';

export class ScheduleCabinCapacityDto extends CabinCapacityDto {
  @ApiPropertyOptional({
    example: '38000000',
    description:
      'قیمت پایه این کابین به ریال؛ برای کلاینت‌های قدیمی از قیمت مسیر ارث می‌برد',
  })
  @IsOptional()
  @Matches(/^\d+$/)
  basePriceIrr?: string;
}

export class RouteDistanceSuggestionDto {
  @ApiProperty({ example: 'uuid-origin-airport' })
  @IsString()
  @MinLength(1)
  originAirportId!: string;

  @ApiProperty({ example: 'uuid-destination-airport' })
  @IsString()
  @MinLength(1)
  destinationAirportId!: string;
}

export class ScheduleTemplatePreviewDto {
  @ApiProperty({ example: 'uuid-origin-airport' })
  @IsString()
  @MinLength(1)
  originAirportId!: string;

  @ApiProperty({ example: 'uuid-dest-airport' })
  @IsString()
  @MinLength(1)
  destinationAirportId!: string;

  @ApiProperty({ example: 'BJ410' })
  @Matches(/^[A-Z0-9]{2,8}$/)
  flightNoBase!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  aircraftDefinitionId!: string;

  @ApiPropertyOptional({
    type: [ScheduleCabinCapacityDto],
    description: 'کابین‌های فعال و ظرفیت هرکدام در این مسیر/برنامه پروازی',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleCabinCapacityDto)
  cabinCapacities?: ScheduleCabinCapacityDto[];

  @ApiPropertyOptional({ example: 684 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20_000)
  distanceKm?: number;

  @ApiPropertyOptional({ enum: ['AI', 'MANUAL'] })
  @IsOptional()
  @IsIn(['AI', 'MANUAL'])
  distanceSource?: 'AI' | 'MANUAL';

  @ApiProperty({
    example: '07:30',
    description: 'Local time at origin airport',
  })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  departureTime!: string;

  @ApiProperty({ example: 95 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  durationMinutes!: number;

  @ApiProperty({ example: '2026-09-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @ApiProperty({ example: '2026-09-30' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;

  @ApiProperty({
    example: [1, 3, 5],
    description: 'ISO weekdays 1=Mon … 7=Sun',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];

  @ApiProperty({ example: '38000000', description: 'IRR integer string' })
  @Matches(/^\d+$/)
  agencyPriceIrr!: string;

  @ApiProperty({ example: '42000000', description: 'IRR integer string' })
  @Matches(/^\d+$/)
  legalCeilingIrr!: string;
}

export class CreateScheduleTemplateDto extends ScheduleTemplatePreviewDto {
  @ApiProperty({
    example: 'sched-idem-2026-09-thr-mhd-1',
    description: 'Client idempotency key (unique)',
  })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}

export class ListScheduleTemplatesQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ResolveScheduleTemplateQueryDto {
  @ApiProperty({ example: 'XY1234' })
  @Matches(/^[A-Za-z0-9]{2,8}$/)
  flightNo!: string;
}
