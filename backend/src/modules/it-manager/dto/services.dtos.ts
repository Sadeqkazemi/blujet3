import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const METHODS = ['GET', 'POST'] as const;

export class ToggleInternalServiceDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;
}

export class CreateExternalServiceDto {
  @ApiProperty({ example: 'درگاه پرداخت زرین‌پال' })
  @IsString()
  @MinLength(1)
  nameFa: string;

  @ApiProperty({ example: 'زرین‌پال' })
  @IsString()
  @MinLength(1)
  provider: string;

  @ApiProperty({ example: 'https://api.provider.com/v1/' })
  @IsUrl({ require_tld: false })
  endpoint: string;

  @ApiPropertyOptional({ enum: METHODS, default: 'POST' })
  @IsOptional()
  @IsIn(METHODS)
  method?: (typeof METHODS)[number];

  @ApiPropertyOptional({ example: 30000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  timeoutMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  sandbox?: boolean;
}

export class UpdateExternalServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  nameFa?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  endpoint?: string;

  @ApiPropertyOptional({ enum: METHODS })
  @IsOptional()
  @IsIn(METHODS)
  method?: (typeof METHODS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  timeoutMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sandbox?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
