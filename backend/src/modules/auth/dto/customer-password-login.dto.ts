import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CustomerPasswordLoginDto {
  @ApiProperty({ example: '09121234567', description: 'شماره موبایل مشتری' })
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone: string;

  @ApiProperty({ description: 'رمز عبور حساب' })
  @IsString()
  password: string;
}
