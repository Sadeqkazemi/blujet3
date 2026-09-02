import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MinLength } from 'class-validator';
import { toLocalIranMobile } from '../../../common/normalize-iran-phone';
import { IsStrongPassword } from '../../../common/validators/strong-password.validator';

export class StaffLoginModeDto {
  @ApiProperty({ example: 'ceo', description: 'نام کاربری سازمانی' })
  @IsString()
  username!: string;
}

export class StaffFirstLoginRequestDto extends StaffLoginModeDto {
  @ApiProperty({
    example: '09121234567',
    description: 'شماره موبایل مدیر یا کارمند',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? toLocalIranMobile(value) : value,
  )
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone!: string;

  @ApiProperty({ minLength: 8, example: 'Blujet@1404' })
  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  newPassword!: string;
}

export class AgencyFirstLoginRequestDto {
  @ApiProperty({
    example: '09121234567',
    description: 'شماره موبایل حساب آژانس',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? toLocalIranMobile(value) : value,
  )
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone!: string;

  @ApiProperty({ minLength: 8, example: 'Agency@1404' })
  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  newPassword!: string;
}
