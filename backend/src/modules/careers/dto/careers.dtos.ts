import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const JOB_TYPES = ['FULL_TIME', 'REMOTE', 'PART_TIME'] as const;
const GENDERS = ['FEMALE', 'MALE'] as const;
const MARITAL = ['SINGLE', 'MARRIED'] as const;
const MILITARY = ['CONSCRIPT', 'EXEMPT', 'WAIVED'] as const;

export class CreateJobPostingDto {
  @ApiProperty({ example: 'کارشناس پشتیبانی مسافران' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ example: 'پشتیبانی' })
  @IsString()
  @MinLength(1)
  dept: string;

  @ApiProperty({ example: 'تهران' })
  @IsString()
  @MinLength(1)
  city: string;

  @ApiProperty({ enum: JOB_TYPES })
  @IsIn(JOB_TYPES)
  type: (typeof JOB_TYPES)[number];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  generalReqs: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  specialReqs: string[];

  @ApiPropertyOptional({
    example: 'همکاری با تیم پشتیبانی مشتریان در تماس‌های تلفنی و تیکت.',
    description: 'متن توضیحی آگهی (نمایش در صفحه استخدام)',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'StoredFile id from POST /files — تصویر آگهی',
  })
  @IsOptional()
  @IsString()
  imageFileId?: string | null;
}

export class UpdateJobPostingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  dept?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  city?: string;

  @ApiPropertyOptional({ enum: JOB_TYPES })
  @IsOptional()
  @IsIn(JOB_TYPES)
  type?: (typeof JOB_TYPES)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  generalReqs?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialReqs?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'StoredFile id — null clears image' })
  @IsOptional()
  @IsString()
  imageFileId?: string | null;
}

export class UpdateCareersSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

/** multipart/form-data text fields — the resume file arrives separately
 * via `@UploadedFile()`. `eduEntries`/`workEntries`/`langEntries` are
 * JSON-stringified arrays (multipart has no native nested-array
 * encoding); parsed and bounded in the service. */
export class ApplyJobDto {
  @ApiProperty({ example: 'نگار' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'رضایی' })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiProperty({ description: 'کد ملی — با چک‌سام رسمی اعتبارسنجی می‌شود' })
  @IsString()
  nationalId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fatherName?: string;

  @ApiPropertyOptional({
    description: 'تاریخ تولد (ISO — از تقویم شمسی در فرانت تبدیل می‌شود)',
  })
  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  birthProvince?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  birthCity?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];

  @ApiPropertyOptional({ enum: MARITAL })
  @IsOptional()
  @IsIn(MARITAL)
  marital?: (typeof MARITAL)[number];

  @ApiPropertyOptional({ enum: MILITARY })
  @IsOptional()
  @IsIn(MILITARY)
  military?: (typeof MILITARY)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  exemptionType?: string;

  @ApiProperty({ example: '09121234567' })
  @IsString()
  @MinLength(1)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  residenceProvince?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  residenceAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  skills?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  otherLangs?: string;

  @ApiPropertyOptional({ description: 'JSON-stringified array' })
  @IsOptional()
  @IsString()
  eduEntries?: string;

  @ApiPropertyOptional({ description: 'JSON-stringified array' })
  @IsOptional()
  @IsString()
  workEntries?: string;

  @ApiPropertyOptional({ description: 'JSON-stringified array' })
  @IsOptional()
  @IsString()
  langEntries?: string;
}

export class ReferApplicationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  assigneeId: string;
}

export class ListApplicationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobTitle?: string;
}
