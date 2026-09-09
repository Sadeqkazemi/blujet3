import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class OrderBookingDueHoldsDto {
  @ApiPropertyOptional({
    description: 'زمان مرجع UTC برای مشاهدهٔ Holdهای سررسیدشده',
    example: '2026-09-09T08:00:00.000Z',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsISO8601({ strict: true })
  asOf?: string;

  @ApiPropertyOptional({
    description: 'حداکثر تعداد Holdهای قابل مشاهده',
    example: 50,
    default: 50,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
