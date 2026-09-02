import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

const GRANULARITIES = ['day', 'month', 'q3', 'q6', 'year', 'flight'] as const;

export class SalesChartQueryDto {
  @ApiPropertyOptional({ enum: GRANULARITIES, example: 'q6' })
  @IsIn(GRANULARITIES)
  granularity: (typeof GRANULARITIES)[number];

  @ApiPropertyOptional({
    description:
      'Required for granularity=month — ISO date of the 1st of that month (UTC)',
  })
  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @ApiPropertyOptional({
    description: 'Required for granularity=day — ISO date (UTC)',
  })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional({ description: 'Required for granularity=flight' })
  @IsOptional()
  @IsString()
  flightNo?: string;
}
