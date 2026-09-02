import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectIdentityVerificationDto {
  @ApiProperty({
    description: 'دلیل رد مدارک — به کاربر در تب احراز هویت نمایش داده می‌شود',
    example: 'تصویر کارت ملی ناخوانا است؛ لطفاً تصویر واضح‌تری بارگذاری کنید.',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty({ message: 'دلیل رد الزامی است.' })
  @MaxLength(500)
  rejectReason!: string;
}
