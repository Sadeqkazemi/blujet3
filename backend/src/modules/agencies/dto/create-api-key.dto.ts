import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const SCOPES = ['FULL', 'SEARCH_BOOK', 'SEARCH_ONLY'] as const;
const ENVIRONMENTS = ['SANDBOX', 'PRODUCTION'] as const;
const FLIGHT_DOMAINS = ['ALL', 'DOMESTIC', 'INTERNATIONAL'] as const;
const CAPABILITIES = [
  'RESERVATION',
  'TICKETING',
  'PRICING',
  'FLIGHT_INFO',
  'REFUND',
  'CHECK_IN',
  'AVAILABILITY',
] as const;

export class CreateApiKeyDto {
  @ApiProperty({ enum: SCOPES, example: 'SEARCH_BOOK' })
  @IsIn(SCOPES)
  scope: (typeof SCOPES)[number];

  @ApiPropertyOptional({ enum: ENVIRONMENTS, default: 'SANDBOX' })
  @IsOptional()
  @IsIn(ENVIRONMENTS)
  environment?: (typeof ENVIRONMENTS)[number];

  @ApiPropertyOptional({ enum: FLIGHT_DOMAINS, default: 'ALL' })
  @IsOptional()
  @IsIn(FLIGHT_DOMAINS)
  flightDomain?: (typeof FLIGHT_DOMAINS)[number];

  @ApiPropertyOptional({ enum: CAPABILITIES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(CAPABILITIES, { each: true })
  capabilities?: (typeof CAPABILITIES)[number][];

  @ApiPropertyOptional({ type: [String], description: 'لیست IPهای مجاز' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[0-9a-fA-F:.]+$/, {
    each: true,
    message: 'هر IP باید IPv4 یا IPv6 معتبر باشد.',
  })
  ipWhitelist?: string[];

  @ApiPropertyOptional({
    description: 'سقف درخواست در دقیقه؛ null = بدون سقف اختصاصی',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(10_000)
  rateLimitPerMinute?: number | null;

  @ApiPropertyOptional({
    description: 'تاریخ انقضای کلید (ISO 8601)؛ null = بدون انقضا',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  expiresAt?: string | null;

  @ApiProperty({
    description: 'از POST /auth/step-up/request (scope: API_KEY_ROTATE)',
  })
  @IsString()
  stepUpChallengeId: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  stepUpCode: string;
}
