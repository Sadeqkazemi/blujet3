import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

export class DecideSeatRequestDto {
  @ApiProperty({ example: true, description: 'تأیید (صدور فاکتور) یا رد' })
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00.000Z',
    description:
      'مهلت پرداخت فاکتور. الزامی نیست؛ در تأیید بدون مقدار، یک هفته بعد از تأیید استفاده می‌شود.',
  })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}
