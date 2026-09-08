import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaymentReconciliationListDto {
  @ApiPropertyOptional({
    description: 'حداکثر تعداد موارد صف تطبیق',
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
