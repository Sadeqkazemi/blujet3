import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class FlightStatusQueryDto {
  @ApiProperty({
    example: 'BJ-410',
    required: false,
    description: 'شماره پرواز',
  })
  @IsOptional()
  @IsString()
  flightNo?: string;

  @ApiProperty({ example: 'THR', required: false })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  origin?: string;

  @ApiProperty({ example: 'MHD', required: false })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  dest?: string;

  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  date: string;
}
