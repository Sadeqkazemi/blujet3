import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBase64,
  IsIn,
  IsInt,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActorContextDto } from '../../common/actor-context.dto';

export const FILE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export class FilePayloadDto {
  @ApiProperty({ example: 'document.pdf', description: 'نام اصلی فایل' })
  @IsString()
  @MinLength(1)
  originalName!: string;

  @ApiProperty({
    enum: FILE_MIME_TYPES,
    example: 'application/pdf',
    description: 'نوع MIME مجاز',
  })
  @IsIn(FILE_MIME_TYPES)
  mimeType!: (typeof FILE_MIME_TYPES)[number];

  @ApiProperty({ example: 102400, description: 'حجم فایل به بایت' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({ example: 'JVBERi0xLjQ=', description: 'محتوای Base64 فایل' })
  @IsBase64()
  contentBase64!: string;
}

export class StoreFileCommandDto {
  @ApiProperty({
    type: ActorContextDto,
    description: 'هویت احرازشده مالک فایل',
  })
  @ValidateNested()
  @Type(() => ActorContextDto)
  actor!: ActorContextDto;

  @ApiProperty({ type: FilePayloadDto, description: 'فایل دریافتی' })
  @ValidateNested()
  @Type(() => FilePayloadDto)
  file!: FilePayloadDto;
}

export class DeleteFileCommandDto {
  @ApiProperty({
    type: ActorContextDto,
    description: 'هویت احرازشده درخواست‌دهنده',
  })
  @ValidateNested()
  @Type(() => ActorContextDto)
  actor!: ActorContextDto;
}
