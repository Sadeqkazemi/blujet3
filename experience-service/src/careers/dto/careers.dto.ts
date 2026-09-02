import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBase64,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActorContextDto } from '../../common/actor-context.dto';
import {
  JOB_TYPES,
  type JobType,
} from '../../database/entities/job-posting.entity';

export class UpdateCareersSettingsDto {
  @ApiProperty({ example: true, description: 'نمایش بخش فرصت‌های شغلی' })
  @IsBoolean()
  enabled!: boolean;
}

export class CreateJobPostingDto {
  @ApiProperty({ example: 'کارشناس فروش', description: 'عنوان شغل' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ example: 'بازرگانی', description: 'واحد سازمانی' })
  @IsString()
  @MinLength(1)
  dept!: string;

  @ApiProperty({ example: 'تهران', description: 'شهر محل کار' })
  @IsString()
  @MinLength(1)
  city!: string;

  @ApiProperty({
    enum: JOB_TYPES,
    example: 'FULL_TIME',
    description: 'نوع همکاری',
  })
  @IsIn(JOB_TYPES)
  type!: JobType;

  @ApiProperty({
    type: [String],
    example: ['حداقل دو سال سابقه'],
    description: 'شرایط عمومی',
  })
  @IsArray()
  @IsString({ each: true })
  generalReqs!: string[];

  @ApiProperty({
    type: [String],
    example: ['تسلط به CRM'],
    description: 'شرایط تخصصی',
  })
  @IsArray()
  @IsString({ each: true })
  specialReqs!: string[];

  @ApiPropertyOptional({
    example: 'شرح موقعیت شغلی',
    description: 'توضیحات شغل',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    example: '11111111-1111-4111-8111-111111111111',
    description: 'شناسه تصویر شغل',
  })
  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;
}

export class UpdateJobPostingDto {
  @ApiPropertyOptional({
    example: 'کارشناس ارشد فروش',
    description: 'عنوان شغل',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ example: 'بازرگانی', description: 'واحد سازمانی' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  dept?: string;

  @ApiPropertyOptional({ example: 'تهران', description: 'شهر محل کار' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  city?: string;

  @ApiPropertyOptional({
    enum: JOB_TYPES,
    example: 'FULL_TIME',
    description: 'نوع همکاری',
  })
  @IsOptional()
  @IsIn(JOB_TYPES)
  type?: JobType;

  @ApiPropertyOptional({
    type: [String],
    example: ['حداقل دو سال سابقه'],
    description: 'شرایط عمومی',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  generalReqs?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['تسلط به CRM'],
    description: 'شرایط تخصصی',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialReqs?: string[];

  @ApiPropertyOptional({ example: true, description: 'فعال‌بودن فرصت شغلی' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    example: 'شرح جدید موقعیت',
    description: 'توضیحات شغل',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    example: '11111111-1111-4111-8111-111111111111',
    description: 'شناسه تصویر شغل',
  })
  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;
}

export class ApplyJobDto {
  @ApiProperty({ example: 'سارا', description: 'نام متقاضی' })
  @IsString()
  @MinLength(1)
  firstName!: string;

  @ApiProperty({ example: 'احمدی', description: 'نام خانوادگی متقاضی' })
  @IsString()
  @MinLength(1)
  lastName!: string;

  @ApiProperty({ example: '0012345679', description: 'کد ملی متقاضی' })
  @IsString()
  nationalId!: string;

  @ApiPropertyOptional({ description: 'نام پدر' })
  @IsOptional()
  @IsString()
  fatherName?: string;

  @ApiPropertyOptional({ format: 'date', description: 'تاریخ تولد' })
  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @ApiPropertyOptional({ description: 'استان محل تولد' })
  @IsOptional()
  @IsString()
  birthProvince?: string;

  @ApiPropertyOptional({ description: 'شهر محل تولد' })
  @IsOptional()
  @IsString()
  birthCity?: string;

  @ApiPropertyOptional({ enum: ['FEMALE', 'MALE'], description: 'جنسیت' })
  @IsOptional()
  @IsIn(['FEMALE', 'MALE'])
  gender?: 'FEMALE' | 'MALE';

  @ApiPropertyOptional({
    enum: ['SINGLE', 'MARRIED'],
    description: 'وضعیت تأهل',
  })
  @IsOptional()
  @IsIn(['SINGLE', 'MARRIED'])
  marital?: 'SINGLE' | 'MARRIED';

  @ApiPropertyOptional({
    enum: ['CONSCRIPT', 'EXEMPT', 'WAIVED'],
    description: 'وضعیت نظام وظیفه',
  })
  @IsOptional()
  @IsIn(['CONSCRIPT', 'EXEMPT', 'WAIVED'])
  military?: 'CONSCRIPT' | 'EXEMPT' | 'WAIVED';

  @ApiPropertyOptional({ description: 'نوع معافیت' })
  @IsOptional()
  @IsString()
  exemptionType?: string;

  @ApiProperty({ example: '09121234567', description: 'شماره تماس' })
  @IsString()
  @MinLength(1)
  phone!: string;

  @ApiPropertyOptional({ format: 'email', description: 'ایمیل متقاضی' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'استان محل سکونت' })
  @IsOptional()
  @IsString()
  residenceProvince?: string;

  @ApiPropertyOptional({ description: 'آدرس محل سکونت' })
  @IsOptional()
  @IsString()
  residenceAddress?: string;

  @ApiPropertyOptional({ description: 'مهارت‌ها' })
  @IsOptional()
  @IsString()
  skills?: string;

  @ApiPropertyOptional({ description: 'زبان‌های دیگر' })
  @IsOptional()
  @IsString()
  otherLangs?: string;

  @ApiPropertyOptional({ description: 'سوابق تحصیلی JSON' })
  @IsOptional()
  @IsString()
  eduEntries?: string;

  @ApiPropertyOptional({ description: 'سوابق شغلی JSON' })
  @IsOptional()
  @IsString()
  workEntries?: string;

  @ApiPropertyOptional({ description: 'سوابق زبان JSON' })
  @IsOptional()
  @IsString()
  langEntries?: string;
}

export class ResumePayloadDto {
  @ApiProperty({ example: 'resume.pdf', description: 'نام اصلی فایل رزومه' })
  @IsString()
  @MinLength(1)
  originalName!: string;

  @ApiProperty({ enum: ['application/pdf'], description: 'نوع MIME رزومه' })
  @IsIn(['application/pdf'])
  mimeType!: 'application/pdf';

  @ApiProperty({ example: 102400, description: 'حجم رزومه به بایت' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({ description: 'محتوای Base64 رزومه' })
  @IsBase64()
  contentBase64!: string;
}

export class ApplyJobCommandDto {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
    description: 'شناسه فرصت شغلی',
  })
  @IsUUID()
  jobId!: string;

  @ApiProperty({ type: ApplyJobDto, description: 'اطلاعات درخواست همکاری' })
  @ValidateNested()
  @Type(() => ApplyJobDto)
  input!: ApplyJobDto;

  @ApiPropertyOptional({ type: ResumePayloadDto, description: 'رزومه PDF' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ResumePayloadDto)
  resume?: ResumePayloadDto;
}

export class ListApplicationsQueryDto {
  @ApiPropertyOptional({ example: 'سارا', description: 'عبارت جست‌وجو' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'فیلتر عنوان شغل' })
  @IsOptional()
  @IsString()
  jobTitle?: string;
}

export class ReferralTargetDto {
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
}

export class CareersActorCommandDto {
  @ApiProperty({
    type: ActorContextDto,
    description: 'هویت احرازشده فراخواننده',
  })
  @ValidateNested()
  @Type(() => ActorContextDto)
  actor!: ActorContextDto;
}

class CareersActorInputCommandDto<T> extends CareersActorCommandDto {
  input!: T;
}

export class UpdateCareersSettingsCommandDto extends CareersActorInputCommandDto<UpdateCareersSettingsDto> {
  @ApiProperty({
    type: UpdateCareersSettingsDto,
    description: 'تنظیمات جدید استخدام',
  })
  @ValidateNested()
  @Type(() => UpdateCareersSettingsDto)
  declare input: UpdateCareersSettingsDto;
}

export class CreateJobPostingCommandDto extends CareersActorInputCommandDto<CreateJobPostingDto> {
  @ApiProperty({ type: CreateJobPostingDto, description: 'اطلاعات فرصت شغلی' })
  @ValidateNested()
  @Type(() => CreateJobPostingDto)
  declare input: CreateJobPostingDto;
}

export class UpdateJobPostingCommandDto extends CareersActorInputCommandDto<UpdateJobPostingDto> {
  @ApiProperty({ type: UpdateJobPostingDto, description: 'تغییرات فرصت شغلی' })
  @ValidateNested()
  @Type(() => UpdateJobPostingDto)
  declare input: UpdateJobPostingDto;
}

export class ReferApplicationCommandDto extends CareersActorCommandDto {
  @ApiProperty({ type: ReferralTargetDto, description: 'گیرنده ارجاع' })
  @ValidateNested()
  @Type(() => ReferralTargetDto)
  target!: ReferralTargetDto;
}
