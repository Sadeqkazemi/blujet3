import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SupportTicketFeedbackDto {
  @ApiProperty({
    example: true,
    description:
      'true: پاسخ رضایت‌بخش بوده و تیکت بسته شود؛ false: تیکت برای پیگیری مجدد باز شود',
  })
  @IsBoolean()
  satisfied: boolean;
}

export class SubmitSupportTicketDto {
  @ApiProperty({
    example: 'نام و نام خانوادگی',
    description: 'نام و نام خانوادگی',
  })
  @IsString()
  @MinLength(2)
  requesterName: string;

  @ApiProperty({ example: '09121234567', description: 'شماره تماس' })
  @IsString()
  @MinLength(8)
  requesterPhone: string;

  @ApiProperty({ example: 'مشکل در پرداخت', description: 'موضوع تیکت' })
  @IsString()
  @MinLength(2)
  subject: string;

  @ApiProperty({ example: 'توضیح مشکل...', description: 'متن تیکت' })
  @IsString()
  @MinLength(2)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'شناسه فایل‌های بارگذاری‌شده متعلق به کاربر (حداکثر یک فایل)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

/** SITE_ADMIN «ایجاد تیکت» modal — dept/priority set at create time. */
export class AdminCreateSupportTicketDto {
  @ApiProperty({ example: 'عدم صدور بلیط پس از پرداخت' })
  @IsString()
  @MinLength(2)
  subject: string;

  @ApiProperty({ example: 'آژانس پارسیان گشت' })
  @IsString()
  @MinLength(2)
  requesterName: string;

  @ApiPropertyOptional({
    example: '09121234567',
    description:
      'اختیاری — در فرم طراحی نیست؛ در صورت خالی بودن مقدار sentinel ذخیره می‌شود',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @MinLength(8)
  requesterPhone?: string;

  @ApiProperty({ enum: ['SITE', 'AGENCY'], default: 'SITE' })
  @IsIn(['SITE', 'AGENCY'])
  dept: 'SITE' | 'AGENCY';

  @ApiProperty({ enum: ['HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM' })
  @IsIn(['HIGH', 'MEDIUM', 'LOW'])
  priority: 'HIGH' | 'MEDIUM' | 'LOW';

  @ApiProperty({ example: 'جزئیات مشکل…' })
  @IsString()
  @MinLength(2)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'شناسه فایل بارگذاری‌شده توسط کارمند (حداکثر یک فایل)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

export class ForwardTicketDto {
  @ApiProperty({ description: 'شناسه کارمند/مدیر مقصد ارجاع' })
  @IsUUID()
  targetUserId: string;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: ['OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED'] })
  @IsIn(['OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED'])
  status: 'OPEN' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED';
}

export class ReplySupportTicketDto {
  @ApiProperty({ example: 'پاسخ و توضیحات تکمیلی…' })
  @IsString()
  @MinLength(2)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'شناسه فایل بارگذاری‌شده متعلق به فرستنده (حداکثر یک فایل)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
