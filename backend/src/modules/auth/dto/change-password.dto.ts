import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'رمز عبور فعلی' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'رمز عبور جدید — حداقل ۶ کاراکتر', minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
