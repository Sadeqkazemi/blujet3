import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

const CATEGORIES = ['ADMIN', 'AGENCY', 'MANAGER'] as const;
const STATUSES = ['OPEN', 'APPROVED', 'REJECTED', 'TRANSFERRED'] as const;

export class ListCartableQueryDto {
  @ApiPropertyOptional({ enum: CATEGORIES, description: 'فیلتر کارت‌های KPI' })
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: (typeof CATEGORIES)[number];

  @ApiPropertyOptional({ description: 'روز انتخابی تقویم شمسی، به ISO' })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional({ enum: STATUSES, default: 'OPEN' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
