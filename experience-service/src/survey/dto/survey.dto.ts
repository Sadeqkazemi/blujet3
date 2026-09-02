import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActorContextDto } from '../../common/actor-context.dto';

export class UpdateSurveySettingsDto {
  @ApiPropertyOptional({ example: true, description: 'فعال‌بودن نظرسنجی' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    example: 'نظرسنجی کیفیت پرواز',
    description: 'عنوان فرم نظرسنجی',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
}

export class CreateSurveyQuestionDto {
  @ApiProperty({
    example: 'کیفیت پذیرایی را چگونه ارزیابی می‌کنید؟',
    description: 'متن پرسش',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;
}

export class SubmitSurveyResponseDto {
  @ApiProperty({
    minimum: 1,
    maximum: 5,
    example: 5,
    description: 'امتیاز کلی',
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ example: 'پرواز منظم بود.', description: 'نظر متنی' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class SurveyActorCommandDto {
  @ApiProperty({
    type: ActorContextDto,
    description: 'هویت احرازشده فراخواننده',
  })
  @ValidateNested()
  @Type(() => ActorContextDto)
  actor!: ActorContextDto;
}

class SurveyActorInputCommandDto<T> extends SurveyActorCommandDto {
  input!: T;
}

export class UpdateSurveySettingsCommandDto extends SurveyActorInputCommandDto<UpdateSurveySettingsDto> {
  @ApiProperty({
    type: UpdateSurveySettingsDto,
    description: 'تنظیمات جدید نظرسنجی',
  })
  @ValidateNested()
  @Type(() => UpdateSurveySettingsDto)
  declare input: UpdateSurveySettingsDto;
}

export class CreateSurveyQuestionCommandDto extends SurveyActorInputCommandDto<CreateSurveyQuestionDto> {
  @ApiProperty({
    type: CreateSurveyQuestionDto,
    description: 'پرسش جدید نظرسنجی',
  })
  @ValidateNested()
  @Type(() => CreateSurveyQuestionDto)
  declare input: CreateSurveyQuestionDto;
}

export class SurveyResponseCommandDto {
  @ApiProperty({ type: SubmitSurveyResponseDto, description: 'پاسخ نظرسنجی' })
  @ValidateNested()
  @Type(() => SubmitSurveyResponseDto)
  input!: SubmitSurveyResponseDto;
}

export class FlownBookingSnapshotDto {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
    description: 'شناسه پایدار رزرو',
  })
  @IsUUID()
  bookingId!: string;

  @ApiProperty({
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
    description: 'شناسه نمونه پرواز',
  })
  @IsUUID()
  flightInstanceId!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: '09121234567',
    description: 'شماره تماس snapshot رزرو',
  })
  @IsOptional()
  @IsString()
  contactPhone?: string | null;

  @ApiProperty({ example: 'BJ-410', description: 'شماره پرواز snapshot' })
  @IsString()
  @MinLength(1)
  flightNo!: string;

  @ApiProperty({ example: 'تهران', description: 'شهر مبدأ snapshot' })
  @IsString()
  @MinLength(1)
  originCityFa!: string;

  @ApiProperty({ example: 'مشهد', description: 'شهر مقصد snapshot' })
  @IsString()
  @MinLength(1)
  destCityFa!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-01T08:00:00.000Z',
    description: 'زمان UTC پرواز snapshot',
  })
  @IsISO8601()
  departureAt!: string;
}

export class MaterializeSurveyInvitesCommandDto {
  @ApiProperty({
    type: [FlownBookingSnapshotDto],
    description: 'رزروهای انجام‌شده از Core',
  })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FlownBookingSnapshotDto)
  bookings!: FlownBookingSnapshotDto[];
}

export class AcknowledgeSurveyInviteDto {
  @ApiProperty({
    format: 'uuid',
    example: '33333333-3333-4333-8333-333333333333',
    description: 'شناسه دعوت ارسال‌شده',
  })
  @IsUUID()
  inviteId!: string;
}
