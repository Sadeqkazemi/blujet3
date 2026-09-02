import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, Length } from 'class-validator';
import { CabinClass } from '../../../database/enums';

export class SearchAdvisoryDto {
  @ApiProperty({ example: 'THR' })
  @IsString()
  @Length(3, 3)
  origin!: string;

  @ApiProperty({ example: 'MHD' })
  @IsString()
  @Length(3, 3)
  dest!: string;

  @ApiProperty({ example: '2026-08-01' })
  @IsISO8601({ strict: true })
  date!: string;

  @ApiProperty({ enum: CabinClass, required: false, default: CabinClass.ECONOMY })
  @IsOptional()
  @IsEnum(CabinClass)
  cabin?: CabinClass;
}
