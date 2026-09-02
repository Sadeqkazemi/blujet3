import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationCategory,
  type NotificationCategory as NotificationCategoryType,
} from '../../../database/enums';

export class NotificationListQueryDto {
  @ApiPropertyOptional({ description: 'دسته اعلان', example: 'SYSTEM' })
  @IsOptional()
  @IsIn(Object.values(NotificationCategory))
  category?: NotificationCategoryType;

  @ApiPropertyOptional({
    description: 'فقط اعلان‌های نخوانده',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString()
  unreadOnly?: string;

  @ApiPropertyOptional({ description: 'تعداد نتیجه از ۱ تا ۱۰۰', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'تعداد ردیف ردشده', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
