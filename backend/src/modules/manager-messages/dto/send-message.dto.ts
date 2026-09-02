import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

const DEPTS = [
  'FINANCE',
  'COMMERCIAL',
  'SUPPORT',
  'AGENCIES',
  'CEO',
  'ALL_MANAGERS',
] as const;

const REQUIRED_MESSAGE = 'گیرنده، موضوع و متن پیام الزامی است.';

export class SendMessageDto {
  @ApiProperty({ enum: DEPTS, description: 'گیرنده سازمانی' })
  @IsIn(DEPTS, { message: REQUIRED_MESSAGE })
  toDept: (typeof DEPTS)[number];

  @ApiProperty({ example: 'هماهنگی جلسه بودجه' })
  @IsString()
  @MinLength(1, { message: REQUIRED_MESSAGE })
  subject: string;

  @ApiProperty({ description: 'متن پیام' })
  @IsString()
  @MinLength(1, { message: REQUIRED_MESSAGE })
  body: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
