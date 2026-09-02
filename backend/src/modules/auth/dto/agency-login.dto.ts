import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AgencyLoginDto {
  @ApiProperty({ example: '+989120000002', description: 'شماره تماس آژانس' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'Blujet@1404', description: 'رمز عبور' })
  @IsString()
  @MinLength(6)
  password: string;
}
