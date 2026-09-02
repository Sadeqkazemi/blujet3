import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  ValidateIf,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;

  @IsNumberString()
  PORT!: string;

  @IsNotEmpty()
  @MinLength(32)
  IDENTITY_INTERNAL_TOKEN!: string;

  @IsNotEmpty()
  IDENTITY_JWT_KID!: string;

  @IsNotEmpty()
  IDENTITY_JWT_ISSUER!: string;

  @IsNotEmpty()
  IDENTITY_JWT_AUDIENCE!: string;

  @IsNotEmpty()
  @MinLength(128)
  IDENTITY_JWT_PRIVATE_KEY!: string;

  @ValidateIf((config: EnvironmentVariables) => config.NODE_ENV === 'production')
  @IsNotEmpty()
  IDENTITY_REDIS_URL?: string;

  @IsOptional()
  IDENTITY_JWT_PREVIOUS_PUBLIC_JWKS?: string;
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid identity-service environment: ${errors
        .flatMap((error) => Object.values(error.constraints ?? {}))
        .join(', ')}`,
    );
  }
  if (
    validated.NODE_ENV === 'production' &&
    validated.IDENTITY_REDIS_URL?.startsWith('memory://')
  ) {
    throw new Error(
      'Invalid identity-service environment: IDENTITY_REDIS_URL must point to Redis in production',
    );
  }
  return config;
}
