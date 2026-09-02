import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class VerifyTwoFactorDto {
  @ApiProperty({
    example: 'a1b2c3d4-...',
    description: 'Challenge id returned by /auth/staff/login',
  })
  @IsString()
  challengeId: string;

  @ApiProperty({ example: '482913', description: '6-digit one-time code' })
  @IsString()
  @Length(6, 6)
  code: string;
}
