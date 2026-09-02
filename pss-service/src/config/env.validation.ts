import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  MinLength,
  validateSync,
} from 'class-validator';

class PssEnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;

  @IsNumberString()
  PORT!: string;

  @IsNotEmpty()
  PSS_DATABASE_URL!: string;

  @IsNotEmpty()
  @MinLength(32)
  PSS_INTERNAL_TOKEN!: string;

  @IsOptional()
  SENTRY_DSN?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(PssEnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid PSS environment configuration:\n${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }
  return validated;
}
