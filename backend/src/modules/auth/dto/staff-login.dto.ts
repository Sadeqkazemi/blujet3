import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class StaffLoginDto {
  @ApiProperty({ example: 'finance', description: 'Staff username' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'Blujet@1404', description: 'Staff password' })
  @IsString()
  @MinLength(6)
  password: string;
}
