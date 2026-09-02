import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export const BLOCK_KEYS = [
  'HERO_BANNER',
  'ANNOUNCEMENT_BAR',
  'PROMO_BANNER',
] as const;

export class AddLibraryAssetDto {
  @ApiProperty({ description: 'StoredFile id from POST /files' })
  @IsUUID()
  storedFileId: string;

  @ApiPropertyOptional({ example: 'hero-istanbul.jpg' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;
}

export class UpdateContentBlockDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buttonText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  badgeText?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;
}

export class CreateDestinationDto {
  @ApiProperty({ example: 'IST' })
  @IsString()
  @MinLength(3)
  airportCode: string;

  @ApiProperty({ description: 'Price in IRR (integer)' })
  @IsInt()
  @Min(0)
  priceIrr: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateDestinationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  airportCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priceIrr?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateRouteDto {
  @ApiProperty({ example: 'THR' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, {
    message: 'کد فرودگاه مبدأ باید سه حرف لاتین باشد.',
  })
  fromAirportCode: string;

  @ApiProperty({ example: 'MHD' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, {
    message: 'کد فرودگاه مقصد باید سه حرف لاتین باشد.',
  })
  toAirportCode: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  priceIrr: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateRouteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, {
    message: 'کد فرودگاه مبدأ باید سه حرف لاتین باشد.',
  })
  fromAirportCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, {
    message: 'کد فرودگاه مقصد باید سه حرف لاتین باشد.',
  })
  toAirportCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priceIrr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateBlockParamDto {
  @ApiProperty({ enum: BLOCK_KEYS })
  @IsIn(BLOCK_KEYS)
  key: (typeof BLOCK_KEYS)[number];
}
