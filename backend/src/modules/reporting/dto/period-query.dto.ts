import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

const GRANULARITIES = ['day', 'month', 'q3', 'q6', 'year', 'flight'] as const;

export class PeriodQueryDto {
  @ApiPropertyOptional({ enum: GRANULARITIES, example: 'q6' })
  @IsIn(GRANULARITIES)
  granularity: (typeof GRANULARITIES)[number];

  @ApiPropertyOptional({ description: 'Required for granularity=month' })
  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @ApiPropertyOptional({ description: 'Required for granularity=day' })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional({ description: 'Required for granularity=flight' })
  @IsOptional()
  @IsString()
  flightNo?: string;

  @ApiPropertyOptional({
    description:
      'A periodKey returned by /reporting/sales-chart — re-scopes KPIs to that bucket',
  })
  @IsOptional()
  @IsString()
  periodKey?: string;
}
