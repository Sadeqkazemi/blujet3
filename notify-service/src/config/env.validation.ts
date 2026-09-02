import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  Matches,
  MinLength,
  validateSync,
} from 'class-validator';

class NotifyEnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;

  @IsNumberString()
  PORT!: string;

  @IsNotEmpty()
  NOTIFY_DATABASE_URL!: string;

  @IsNotEmpty()
  @MinLength(32)
  NOTIFY_INTERNAL_TOKEN!: string;

  @Matches(/^[a-fA-F0-9]{64}$/)
  PII_ENCRYPTION_KEY!: string;

  @IsOptional()
  @IsNumberString()
  SMS_PROVIDER_TIMEOUT_MS?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(NotifyEnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid notify environment configuration:\n${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }
  return validated;
}
