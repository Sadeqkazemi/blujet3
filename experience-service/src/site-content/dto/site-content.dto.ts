import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActorContextDto } from '../../common/actor-context.dto';
import { SITE_CONTENT_BLOCK_KEYS } from '../../database/entities/site-content-block.entity';

export class AddLibraryAssetDto {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
    description: 'شناسه فایل ذخیره‌شده',
  })
  @IsUUID()
  storedFileId!: string;

  @ApiPropertyOptional({ description: 'برچسب نمایشی رسانه' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;
}

export class UpdateContentBlockDto {
  @ApiPropertyOptional({ example: true, description: 'فعال‌بودن بلوک' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'عنوان بلوک' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'زیرعنوان بلوک' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'متن دکمه بلوک' })
  @IsOptional()
  @IsString()
  buttonText?: string;

  @ApiPropertyOptional({ description: 'برچسب بلوک' })
  @IsOptional()
  @IsString()
  badgeText?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'شناسه تصویر بلوک',
  })
  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;
}

export class CreateDestinationDto {
  @ApiProperty({ example: 'SYZ', description: 'کد IATA فرودگاه مقصد' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  airportCode!: string;

  @ApiProperty({ example: 12000000, description: 'قیمت نمایشی به ریال' })
  @IsInt()
  @Min(0)
  priceIrr!: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'شناسه تصویر مقصد' })
  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @ApiPropertyOptional({ description: 'ترتیب نمایش' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateDestinationDto {
  @ApiPropertyOptional({ example: 'MHD', description: 'کد IATA فرودگاه مقصد' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  airportCode?: string;

  @ApiPropertyOptional({ description: 'قیمت نمایشی به ریال' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceIrr?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'شناسه تصویر مقصد',
  })
  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;

  @ApiPropertyOptional({ description: 'ترتیب نمایش' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateRouteDto {
  @ApiProperty({ example: 'THR', description: 'کد IATA فرودگاه مبدأ' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  fromAirportCode!: string;

  @ApiProperty({ example: 'MHD', description: 'کد IATA فرودگاه مقصد' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  toAirportCode!: string;

  @ApiProperty({ example: 9500000, description: 'قیمت نمایشی به ریال' })
  @IsInt()
  @Min(0)
  priceIrr!: number;

  @ApiPropertyOptional({ description: 'ترتیب نمایش' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateRouteDto {
  @ApiPropertyOptional({ example: 'IKA', description: 'کد IATA فرودگاه مبدأ' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  fromAirportCode?: string;

  @ApiPropertyOptional({ description: 'کد IATA فرودگاه مقصد' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  toAirportCode?: string;

  @ApiPropertyOptional({ description: 'قیمت نمایشی به ریال' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceIrr?: number;

  @ApiPropertyOptional({ description: 'ترتیب نمایش' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ContentBlockParamDto {
  @ApiProperty({
    enum: SITE_CONTENT_BLOCK_KEYS,
    example: 'hero',
    description: 'کلید بلوک محتوا',
  })
  @IsIn(SITE_CONTENT_BLOCK_KEYS)
  key!: (typeof SITE_CONTENT_BLOCK_KEYS)[number];
}

export class PublicContentQueryDto {
  @ApiPropertyOptional({
    enum: ['fa', 'en', 'ar'],
    example: 'fa',
    description: 'زبان محتوا',
  })
  @IsOptional()
  @IsIn(['fa', 'en', 'ar'])
  locale?: 'fa' | 'en' | 'ar';
}

export class ActorOnlyCommandDto {
  @ApiProperty({
    type: ActorContextDto,
    description: 'هویت احرازشده فراخواننده',
  })
  @ValidateNested()
  @Type(() => ActorContextDto)
  actor!: ActorContextDto;
}

class ActorInputCommandDto<T> extends ActorOnlyCommandDto {
  input!: T;
}

export class AddLibraryAssetCommandDto extends ActorInputCommandDto<AddLibraryAssetDto> {
  @ApiProperty({ type: AddLibraryAssetDto, description: 'رسانه جدید کتابخانه' })
  @ValidateNested()
  @Type(() => AddLibraryAssetDto)
  declare input: AddLibraryAssetDto;
}

export class UpdateContentBlockCommandDto extends ActorInputCommandDto<UpdateContentBlockDto> {
  @ApiProperty({
    type: UpdateContentBlockDto,
    description: 'تغییرات بلوک محتوا',
  })
  @ValidateNested()
  @Type(() => UpdateContentBlockDto)
  declare input: UpdateContentBlockDto;
}

export class CreateDestinationCommandDto extends ActorInputCommandDto<CreateDestinationDto> {
  @ApiProperty({ type: CreateDestinationDto, description: 'مقصد برجسته جدید' })
  @ValidateNested()
  @Type(() => CreateDestinationDto)
  declare input: CreateDestinationDto;
}

export class UpdateDestinationCommandDto extends ActorInputCommandDto<UpdateDestinationDto> {
  @ApiProperty({
    type: UpdateDestinationDto,
    description: 'تغییرات مقصد برجسته',
  })
  @ValidateNested()
  @Type(() => UpdateDestinationDto)
  declare input: UpdateDestinationDto;
}

export class CreateRouteCommandDto extends ActorInputCommandDto<CreateRouteDto> {
  @ApiProperty({ type: CreateRouteDto, description: 'مسیر برجسته جدید' })
  @ValidateNested()
  @Type(() => CreateRouteDto)
  declare input: CreateRouteDto;
}

export class UpdateRouteCommandDto extends ActorInputCommandDto<UpdateRouteDto> {
  @ApiProperty({ type: UpdateRouteDto, description: 'تغییرات مسیر برجسته' })
  @ValidateNested()
  @Type(() => UpdateRouteDto)
  declare input: UpdateRouteDto;
}
