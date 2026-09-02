import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum AgencyBulletinKind {
  NOTICE = 'NOTICE',
  AMENDMENT = 'AMENDMENT',
}

export enum AgencyBulletinAudienceMode {
  ALL = 'ALL',
  SELECTED = 'SELECTED',
}

export class CreateAgencyBulletinDto {
  @ApiProperty({ enum: AgencyBulletinKind, example: AgencyBulletinKind.NOTICE })
  @IsEnum(AgencyBulletinKind)
  kind!: AgencyBulletinKind;

  @ApiProperty({ example: 'دستورالعمل فروش پرواز جدید' })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @ApiProperty({ example: 'متن کامل اطلاعیه برای آژانس‌های منتخب.' })
  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  body!: string;

  @ApiProperty({
    enum: AgencyBulletinAudienceMode,
    example: AgencyBulletinAudienceMode.SELECTED,
  })
  @IsEnum(AgencyBulletinAudienceMode)
  audienceMode!: AgencyBulletinAudienceMode;

  @ApiPropertyOptional({
    type: [String],
    description: 'شناسه حساب آژانس‌ها؛ در حالت SELECTED الزامی است.',
  })
  @ValidateIf(
    (value: CreateAgencyBulletinDto) =>
      value.audienceMode === AgencyBulletinAudienceMode.SELECTED,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  recipientIds?: string[];
}
