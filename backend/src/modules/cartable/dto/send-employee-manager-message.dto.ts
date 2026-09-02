import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class SendEmployeeManagerMessageDto {
  @ApiProperty({ description: 'شناسه مدیر مقصد' })
  @IsUUID()
  toId: string;

  @ApiProperty({
    description: 'متن پیام',
    example: 'لطفاً در مورد قرارداد آژانس راهنمایی کنید.',
  })
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
