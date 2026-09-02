import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { toLatinDigits } from '../../../common/normalize-iran-phone';

export class VerifyOtpDto {
  @ApiProperty({
    example: 'a1b2c3d4-...',
    description: 'Challenge id returned by /auth/otp/request',
  })
  @IsString()
  challengeId: string;

  @ApiProperty({ example: '482913', description: '6-digit one-time code' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? toLatinDigits(value).replace(/\D/g, '') : value,
  )
  @IsString()
  @Length(6, 6)
  code: string;
}
