import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { toLatinDigits } from '../../../common/normalize-iran-phone';

export class RequestOtpDto {
  @ApiProperty({ example: '09121234567', description: 'شماره موبایل مشتری' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? toLatinDigits(value).replace(/\s/g, '') : value,
  )
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone: string;

  @ApiPropertyOptional({
    example: 'NEGAR-4152',
    description: 'کد معرف (فقط برای ثبت‌نام اول)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string;
}
