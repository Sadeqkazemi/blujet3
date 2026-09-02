import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;

const REQUIRED_MESSAGE = 'موضوع، شرح درخواست و حداقل یک مدیر مقصد الزامی است.';

export class CreateReferralDto {
  @ApiProperty({ example: 'درخواست گزارش فروش سه‌ماهه' })
  @IsString()
  @MinLength(1, { message: REQUIRED_MESSAGE })
  title: string;

  @ApiProperty({ description: 'شرح درخواست' })
  @IsString()
  @MinLength(1, { message: REQUIRED_MESSAGE })
  body: string;

  @ApiProperty({ type: [String], description: 'شناسه مدیر(ان) مقصد' })
  @IsArray()
  @ArrayMinSize(1, { message: REQUIRED_MESSAGE })
  @IsUUID('4', { each: true })
  recipientIds: string[];

  @ApiPropertyOptional({ enum: PRIORITIES, default: 'MEDIUM' })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @ApiPropertyOptional({
    description: 'مهلت دریافت گزارش (ISO — از تقویم شمسی تبدیل می‌شود)',
  })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional({ type: [String], description: 'شناسه فایل‌های پیوست' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
