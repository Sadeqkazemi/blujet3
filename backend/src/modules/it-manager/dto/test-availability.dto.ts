import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class TestAvailabilityDto {
  @ApiProperty({ example: 'EP-821', description: 'شماره پرواز' })
  @IsString()
  @MinLength(2)
  flightNo: string;
}
