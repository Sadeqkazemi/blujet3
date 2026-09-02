import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class RequestAgencyOtpDto {
  @ApiProperty({ example: '09121234567', description: 'شماره موبایل متقاضی' })
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone: string;
}
