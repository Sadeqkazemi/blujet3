import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class SendDirectStaffMessageDto {
  @ApiProperty({ description: 'شناسه کارمند یا مدیر مقصد' })
  @IsUUID()
  toId: string;

  @ApiProperty({ description: 'موضوع پیام' })
  @IsString()
  @MinLength(1, { message: 'موضوع پیام الزامی است.' })
  subject: string;

  @ApiProperty({ description: 'متن پیام' })
  @IsString()
  @MinLength(1, { message: 'متن پیام الزامی است.' })
  body: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
