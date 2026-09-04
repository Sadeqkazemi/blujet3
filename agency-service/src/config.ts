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
  @IsIn(['true', 'false'])
  AGENCY_PORTAL_PROFILE_ENABLED = 'false';

  @IsIn(['true', 'false'])
  AGENCY_PORTAL_INVOICES_ENABLED = 'false';

  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3600;

  @IsString()
  @MinLength(32)
  AGENCY_INTERNAL_TOKEN!: string;

  @IsString()
  @MinLength(1)
  AGENCY_DATABASE_URL!: string;
}

export function validateEnv(input: Record<string, unknown>) {
  const env = plainToInstance(Environment, input);
  if (validateSync(env).length) throw new Error('Invalid Agency configuration');
  let url: URL;
  try {
    url = new URL(env.AGENCY_DATABASE_URL);
  } catch {
    throw new Error('Invalid Agency database configuration');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Agency requires PostgreSQL');
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
