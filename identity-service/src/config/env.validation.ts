import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumberString,
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
  return config;
}
