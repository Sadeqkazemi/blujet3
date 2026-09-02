import type { DataSourceOptions } from 'typeorm';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { OutboxEvent } from './entities/outbox-event.entity';

if (!process.env.PSS_DATABASE_URL) {
  throw new Error('PSS_DATABASE_URL is required');
}

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.PSS_DATABASE_URL,
  entities: [IdempotencyRecord, OutboxEvent],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
};
