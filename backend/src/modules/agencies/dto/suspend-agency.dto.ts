import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SuspendAgencyDto {
  @ApiProperty({ example: 'عدم تسویه بدهی معوق بیش از ۳۰ روز' })
  @IsString()
  @MinLength(1)
  reason: string;
}
