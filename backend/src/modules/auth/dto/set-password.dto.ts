import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/strong-password.validator';

export class SetPasswordDto {
  @ApiProperty({
    description:
      'رمز عبور جدید — حداقل ۸ کاراکتر با حروف بزرگ/کوچک، عدد و نماد',
    minLength: 8,
    example: 'Blujet@1404',
  })
  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  newPassword: string;
}
