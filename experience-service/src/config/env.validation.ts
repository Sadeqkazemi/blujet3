import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumberString,
  Matches,
  MinLength,
  validateSync,
} from 'class-validator';

class ExperienceEnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;

  @IsNumberString()
  PORT!: string;

  @IsNotEmpty()
  EXPERIENCE_DATABASE_URL!: string;

  @IsNotEmpty()
  @MinLength(32)
  EXPERIENCE_INTERNAL_TOKEN!: string;

  @IsNotEmpty()
  @Matches(/^[0-9a-fA-F]{64}$/)
  PII_ENCRYPTION_KEY!: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(ExperienceEnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid experience environment configuration:\n${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }
  return validated;
}
