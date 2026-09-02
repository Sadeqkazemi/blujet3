import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListCustomersQueryDto {
  @ApiPropertyOptional({
    description: 'جستجو بر اساس شماره موبایل (ارقام فارسی یا لاتین)',
    example: '09123456789',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  q?: string;
}
