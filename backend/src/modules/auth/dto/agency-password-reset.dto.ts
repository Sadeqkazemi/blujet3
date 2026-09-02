import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/strong-password.validator';

export class AgencyPasswordResetRequestDto {
  @ApiProperty({ example: '+989120000002' })
  @IsString()
  phone!: string;
}

export class AgencyPasswordResetVerifyDto {
  @ApiProperty()
  @IsString()
  challengeId!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'کد باید ۶ رقم باشد.' })
  code!: string;
}

export class AgencySetPasswordDto {
  @ApiProperty({ minLength: 8, example: 'Agency@1404' })
  @IsString()
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد.' })
  @IsStrongPassword()
  newPassword!: string;
}
