import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
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

const STATUSES = ['ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
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

export class UpdateApiKeyDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional({
    description: 'true برای صدور مجدد کلید — کلید قبلی بلافاصله باطل می‌شود',
  })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;

  @ApiPropertyOptional({ enum: SCOPES })
  @IsOptional()
  @IsIn(SCOPES)
  scope?: (typeof SCOPES)[number];

  @ApiPropertyOptional({ enum: CAPABILITIES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(CAPABILITIES, { each: true })
  capabilities?: (typeof CAPABILITIES)[number][];

  @ApiPropertyOptional({ enum: ENVIRONMENTS })
  @IsOptional()
  @IsIn(ENVIRONMENTS)
  environment?: (typeof ENVIRONMENTS)[number];

  @ApiPropertyOptional({ enum: FLIGHT_DOMAINS })
  @IsOptional()
  @IsIn(FLIGHT_DOMAINS)
  flightDomain?: (typeof FLIGHT_DOMAINS)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[0-9a-fA-F:.]+$/, {
    each: true,
    message: 'هر IP باید IPv4 یا IPv6 معتبر باشد.',
  })
  ipWhitelist?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(10_000)
  rateLimitPerMinute?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  expiresAt?: string | null;

  @ApiPropertyOptional({
    description:
      'وقتی regenerate=true یا status=REVOKED — از POST /auth/step-up/request',
  })
  @ValidateIf(
    (o: UpdateApiKeyDto) => o.regenerate === true || o.status === 'REVOKED',
  )
  @IsString()
  stepUpChallengeId?: string;

  @ApiPropertyOptional({ example: '482913' })
  @ValidateIf(
    (o: UpdateApiKeyDto) => o.regenerate === true || o.status === 'REVOKED',
  )
  @IsString()
  stepUpCode?: string;
}
