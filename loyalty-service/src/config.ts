import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  MinLength,
  Min,
  Max,
  validateSync,
} from 'class-validator';
import type { DataSourceOptions } from 'typeorm';

class Environment {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3500;

  @IsString()
  @MinLength(32)
  LOYALTY_INTERNAL_TOKEN!: string;

  @IsString()
  @MinLength(1)
  LOYALTY_DATABASE_URL!: string;

  @IsIn(['true', 'false'])
  LOYALTY_MEMBERSHIP_PROJECTION_ENABLED = 'false';

  @IsIn(['true', 'false'])
  LOYALTY_TIER_RULES_PROJECTION_ENABLED = 'false';

  @IsIn(['true', 'false'])
  LOYALTY_MEMBERS_LIST_PROJECTION_ENABLED = 'false';

  @IsIn(['true', 'false'])
  LOYALTY_CARD_REQUESTS_PROJECTION_ENABLED = 'false';
}

export function validateEnv(input: Record<string, unknown>) {
  const env = plainToInstance(Environment, input);
  if (validateSync(env).length)
    throw new Error('Invalid Loyalty configuration');
  let url: URL;
  try {
    url = new URL(env.LOYALTY_DATABASE_URL);
  } catch {
    throw new Error('Invalid Loyalty database configuration');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Loyalty requires PostgreSQL');
  }
  return env;
}

export function databaseOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [],
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: {
      max: 4,
      connectionTimeoutMillis: 2000,
      statement_timeout: 2000,
      options: '-c default_transaction_read_only=on -c timezone=UTC',
    },
  };
}
