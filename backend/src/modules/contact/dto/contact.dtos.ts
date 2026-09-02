import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SubmitContactMessageDto {
  @ApiProperty({
    example: 'نام و نام خانوادگی',
    description: 'نام و نام خانوادگی',
  })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: '09121234567', description: 'شماره تماس' })
  @IsString()
  @MinLength(8)
  phone: string;

  @ApiProperty({ example: 'مشکل در پرداخت', description: 'موضوع پیام' })
  @IsString()
  @MinLength(2)
  subject: string;

  @ApiProperty({ example: 'سلام، سوالی درباره...', description: 'متن پیام' })
  @IsString()
  @MinLength(2)
  body: string;
}
