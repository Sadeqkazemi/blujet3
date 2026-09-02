import { Type } from 'class-transformer';
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
  ValidateNested,
} from 'class-validator';
import { ActorContextDto } from '../../common/actor-context.dto';
import {
  SUPPORT_DEPTS,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  type SupportDept,
  type SupportPriority,
  type SupportStatus,
} from '../../database/entities/support-ticket.entity';

export class SubmitSupportTicketDto {
  @ApiProperty({ example: 'سارا احمدی', description: 'نام درخواست‌دهنده' })
  @IsString()
  @MinLength(2)
  requesterName!: string;

  @ApiProperty({
    example: '09121234567',
    description: 'شماره تماس درخواست‌دهنده',
  })
  @IsString()
  @MinLength(8)
  requesterPhone!: string;

  @ApiProperty({ example: 'پیگیری خرید', description: 'موضوع تیکت' })
  @IsString()
  @MinLength(2)
  subject!: string;

  @ApiProperty({
    example: 'لطفاً وضعیت خرید را بررسی کنید.',
    description: 'متن اولیه تیکت',
  })
  @IsString()
  @MinLength(2)
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 1,
    description: 'شناسه پیوست اختیاری',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

export class AdminCreateSupportTicketDto {
  @ApiProperty({ example: 'پیگیری مالی', description: 'موضوع تیکت' })
  @IsString()
  @MinLength(2)
  subject!: string;

  @ApiProperty({ description: 'نام درخواست‌دهنده' })
  @IsString()
  @MinLength(2)
  requesterName!: string;

  @ApiPropertyOptional({ description: 'شماره تماس درخواست‌دهنده' })
  @IsOptional()
  @IsString()
  requesterPhone?: string;

  @ApiProperty({ enum: SUPPORT_DEPTS, description: 'واحد پاسخ‌گو' })
  @IsIn(SUPPORT_DEPTS)
  dept!: SupportDept;

  @ApiProperty({ enum: SUPPORT_PRIORITIES, description: 'اولویت تیکت' })
  @IsIn(SUPPORT_PRIORITIES)
  priority!: SupportPriority;

  @ApiProperty({ description: 'متن اولیه تیکت' })
  @IsString()
  @MinLength(2)
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 1,
    description: 'شناسه پیوست اختیاری',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

export class ReplySupportTicketDto {
  @ApiProperty({ example: 'پاسخ تیکت', description: 'متن پاسخ' })
  @IsString()
  @MinLength(2)
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 1,
    description: 'شناسه پیوست پاسخ',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

export class SupportFiltersDto {
  @ApiPropertyOptional({
    enum: SUPPORT_STATUSES,
    example: 'OPEN',
    description: 'فیلتر وضعیت',
  })
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @ApiPropertyOptional({ enum: SUPPORT_DEPTS, description: 'فیلتر واحد' })
  @IsOptional()
  @IsIn(SUPPORT_DEPTS)
  dept?: SupportDept;
}

export class SupportActorCommandDto {
  @ApiProperty({
    type: ActorContextDto,
    description: 'هویت احرازشده فراخواننده',
  })
  @ValidateNested()
  @Type(() => ActorContextDto)
  actor!: ActorContextDto;

  @ApiPropertyOptional({ description: 'شماره تماس تأییدشده کاربر' })
  @IsOptional()
  @IsString()
  callerPhone?: string;
}

class SupportActorInputCommandDto<T> extends SupportActorCommandDto {
  input!: T;
}

export class SubmitSupportForUserCommandDto extends SupportActorInputCommandDto<SubmitSupportTicketDto> {
  @ApiProperty({
    type: SubmitSupportTicketDto,
    description: 'اطلاعات تیکت کاربر',
  })
  @ValidateNested()
  @Type(() => SubmitSupportTicketDto)
  declare input: SubmitSupportTicketDto;
}

export class AdminCreateSupportCommandDto extends SupportActorInputCommandDto<AdminCreateSupportTicketDto> {
  @ApiProperty({
    type: AdminCreateSupportTicketDto,
    description: 'اطلاعات تیکت کارشناس',
  })
  @ValidateNested()
  @Type(() => AdminCreateSupportTicketDto)
  declare input: AdminCreateSupportTicketDto;
}

export class ReplySupportCommandDto extends SupportActorInputCommandDto<ReplySupportTicketDto> {
  @ApiProperty({
    type: ReplySupportTicketDto,
    description: 'اطلاعات پاسخ تیکت',
  })
  @ValidateNested()
  @Type(() => ReplySupportTicketDto)
  declare input: ReplySupportTicketDto;
}

export class FeedbackSupportCommandDto extends SupportActorCommandDto {
  @ApiProperty({ example: true, description: 'رضایت درخواست‌دهنده از پاسخ' })
  @IsBoolean()
  satisfied!: boolean;
}

export class ForwardTargetDto {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
    description: 'شناسه گیرنده ارجاع',
  })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'نام snapshot گیرنده' })
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({ description: 'عنوان فارسی نقش گیرنده' })
  @IsString()
  @MinLength(1)
  roleLabelFa!: string;
}

export class ForwardSupportCommandDto extends SupportActorCommandDto {
  @ApiProperty({ type: ForwardTargetDto, description: 'گیرنده ارجاع' })
  @ValidateNested()
  @Type(() => ForwardTargetDto)
  target!: ForwardTargetDto;
}

export class UpdateSupportStatusCommandDto extends SupportActorCommandDto {
  @ApiProperty({
    enum: SUPPORT_STATUSES,
    example: 'ANSWERED',
    description: 'وضعیت جدید تیکت',
  })
  @IsIn(SUPPORT_STATUSES)
  status!: SupportStatus;
}
