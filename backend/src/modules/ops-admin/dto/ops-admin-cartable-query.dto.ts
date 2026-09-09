import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CartableCategory, CartableStatus } from '../../../database/enums';

export class OpsAdminCartableQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(CartableStatus),
    default: CartableStatus.OPEN,
  })
  @IsOptional()
  @IsIn(Object.values(CartableStatus))
  status: CartableStatus = CartableStatus.OPEN;

  @ApiPropertyOptional({ enum: Object.values(CartableCategory) })
  @IsOptional()
  @IsIn(Object.values(CartableCategory))
  category?: CartableCategory;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
