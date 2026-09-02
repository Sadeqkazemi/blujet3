import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ReferRequestDto {
  @ApiProperty({ description: 'شناسه کاربر (کارمند/مدیر) مقصد ارجاع' })
  @IsUUID()
  referredToId: string;

  @ApiPropertyOptional({ example: 'لطفاً وضعیت اعتباری متقاضی بررسی شود.' })
  @IsOptional()
  @IsString()
  note?: string;
}
