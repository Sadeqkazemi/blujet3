import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationCategory } from '../../database/entities/notification.entity';
import { SmsMessageType } from '../../database/entities/sms-log.entity';

export const NotifyEventType = {
  NOTIFICATION_CREATED: 'NOTIFICATION_CREATED',
  SMS_REQUESTED: 'SMS_REQUESTED',
} as const;
export type NotifyEventType =
  (typeof NotifyEventType)[keyof typeof NotifyEventType];

export class ConsumeEventDto {
  @ApiProperty({
    description: 'شناسه یکتای event برای idempotency',
    example: '2e4ee2b1-b702-42fe-aeb4-8dddb01d4866',
  })
  @IsUUID()
  eventId!: string;

  @ApiProperty({
    description: 'نوع event پشتیبانی‌شده',
    example: 'NOTIFICATION_CREATED',
  })
  @IsIn(Object.values(NotifyEventType))
  eventType!: NotifyEventType;

  @ApiProperty({
    description: 'payload رمز‌شده با AES-256-GCM',
    example: 'iv.tag.ciphertext',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100000)
  payloadEncrypted!: string;
}

export class NotificationCreatedPayloadDto {
  @ApiProperty({
    description: 'شناسه UUID دریافت‌کننده',
    example: '2e4ee2b1-b702-42fe-aeb4-8dddb01d4866',
  })
  @IsUUID()
  recipientId!: string;

  @ApiProperty({ description: 'دسته اعلان', example: 'SYSTEM' })
  @IsIn(Object.values(NotificationCategory))
  category!: NotificationCategory;

  @ApiProperty({ description: 'کد پایدار رخداد', example: 'BOOKING_TICKETED' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  action!: string;

  @ApiProperty({
    description: 'عنوان نمایشی اعلان',
    example: 'بلیط شما صادر شد',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({
    description: 'متن نمایشی اعلان',
    example: 'رزرو ABC123 آماده است.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @ApiPropertyOptional({ description: 'نوع موجودیت مبدأ', example: 'BOOKING' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiPropertyOptional({
    description: 'شناسه موجودیت مبدأ',
    example: '2e4ee2b1-b702-42fe-aeb4-8dddb01d4866',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  entityId?: string;

  @ApiPropertyOptional({
    description: 'کلید idempotency منطقی',
    example: 'Booking:123:TICKETED',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dedupeKey?: string;
}

export class SmsProviderSnapshotDto {
  @ApiProperty({
    description: 'حالت provider ثبت‌شده هنگام enqueue',
    example: 'KAVENEGAR',
  })
  @IsIn(['KAVENEGAR', 'MOCK', 'UNAVAILABLE'])
  mode!: 'KAVENEGAR' | 'MOCK' | 'UNAVAILABLE';

  @ApiPropertyOptional({
    description: 'کلید provider که همچنان رمز‌شده است',
    example: 'iv.tag.ciphertext',
  })
  @ValidateIf((value: SmsProviderSnapshotDto) => value.mode === 'KAVENEGAR')
  @IsString()
  @IsNotEmpty()
  apiKeyEncrypted?: string;

  @ApiPropertyOptional({
    description: 'خط فرستنده تأییدشده',
    example: '10004346',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  senderLine?: string;
}

export class SmsRequestedPayloadDto {
  @ApiPropertyOptional({
    description: 'شماره موبایل ایران یا null',
    example: '09121234567',
    nullable: true,
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @Matches(/^09\d{9}$/)
  phone!: string | null;

  @ApiProperty({
    description: 'متن پیام؛ فقط در حافظه باز می‌شود',
    example: 'پیام بلوجت',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @ApiProperty({ description: 'نوع پیام', example: 'OTP' })
  @IsIn(Object.values(SmsMessageType))
  messageType!: SmsMessageType;

  @ApiProperty({ description: 'snapshot رمز‌شده تنظیم provider' })
  @IsDefined()
  @ValidateNested()
  @Type(() => SmsProviderSnapshotDto)
  provider!: SmsProviderSnapshotDto;
}
