import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class ReplyCartableMessageDto {
  @ApiProperty({ description: 'متن پاسخ' })
  @IsString()
  @MinLength(1, { message: 'متن پاسخ الزامی است.' })
  body: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
