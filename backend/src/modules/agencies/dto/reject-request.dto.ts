import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RejectRequestDto {
  @ApiPropertyOptional({ example: 'مدارک مجوز فعالیت ناقص بود.' })
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
