import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationCategory } from '../../database/entities/notification.entity';

export const NotifyRole = {
  USER: 'USER',
  AGENCY: 'AGENCY',
  EMPLOYEE: 'EMPLOYEE',
  IT_MANAGER: 'IT_MANAGER',
  COMMERCIAL_MANAGER: 'COMMERCIAL_MANAGER',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
  SENIOR_MANAGER: 'SENIOR_MANAGER',
  CEO: 'CEO',
  BOARD_CHAIR: 'BOARD_CHAIR',
  SITE_ADMIN: 'SITE_ADMIN',
} as const;

export class RecipientDto {
  @ApiProperty({
    description: 'شناسه UUID دریافت‌کننده که facade از JWT استخراج کرده است',
    example: '2e4ee2b1-b702-42fe-aeb4-8dddb01d4866',
  })
  @IsUUID()
  recipientId!: string;

  @ApiProperty({ description: 'نقش معتبر دریافت‌کننده', example: 'USER' })
  @IsIn(Object.values(NotifyRole))
  role!: string;
}

export class NotificationListQueryDto extends RecipientDto {
  @ApiPropertyOptional({ description: 'دسته اعلان', example: 'SYSTEM' })
  @IsOptional()
  @IsIn(Object.values(NotificationCategory))
  category?: NotificationCategory;

  @ApiPropertyOptional({ description: 'فقط اعلان نخوانده', example: 'true' })
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

export class EntityNotificationQueryDto {
  @ApiProperty({
    description: 'نوع موجودیت برای گزارش عملیاتی داخلی',
    example: 'AGENCY_BULLETIN',
  })
  @IsString()
  @MaxLength(100)
  entityType!: string;
}
