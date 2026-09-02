import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateSavedPassengerDto {
  @ApiProperty({ example: 'محمد رضایی' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: 'MOHAMMAD REZAEI', description: 'Latin ticket name' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  latinName: string;

  @ApiProperty({ example: 'male', enum: ['male', 'female'] })
  @IsIn(['male', 'female'])
  gender: 'male' | 'female';

  @ApiProperty({
    example: '1990-05-15',
    description: 'Gregorian birth date (YYYY-MM-DD)',
  })
  @IsDateString()
  birthDate: string;

  @ApiPropertyOptional({ example: '0012345679' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  nationalId?: string;

  @ApiPropertyOptional({ example: 'A22113344' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  passportNo?: string;

  @ApiPropertyOptional({ example: '09121234567' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  mobile?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isChild?: boolean;
}

export class UpdateSavedPassengerDto {
  @ApiPropertyOptional({ example: 'محمد رضایی' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ example: 'MOHAMMAD REZAEI' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  latinName?: string;

  @ApiPropertyOptional({ example: 'male', enum: ['male', 'female'] })
  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: '0012345679', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(10)
  nationalId?: string | null;

  @ApiPropertyOptional({ example: 'A22113344', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(20)
  passportNo?: string | null;

  @ApiPropertyOptional({ example: '09121234567', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(15)
  mobile?: string | null;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isChild?: boolean;
}
