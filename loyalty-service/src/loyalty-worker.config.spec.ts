import { loyaltyEntities } from './database/loyalty-entities';
import {
  loyaltyWorkerDataSourceOptions,
  validateLoyaltyWorkerEnv,
} from './loyalty-worker.config';

describe('Loyalty worker configuration', () => {
  const valid = {
    NODE_ENV: 'test',
    PORT: '3510',
    LOYALTY_PROJECTION_DATABASE_URL:
      'postgresql://loyalty_writer:secret@localhost/blujet_loyalty',
    LOYALTY_KAFKA_CONSUMER_ENABLED: 'true',
    KAFKA_BROKERS: 'localhost:9092',
  };

  it('accepts an enabled worker with a dedicated database URL', () => {
    expect(validateLoyaltyWorkerEnv(valid)).toBe(valid);
  });

  it.each([
    [{ ...valid, LOYALTY_PROJECTION_DATABASE_URL: '' }, 'DATABASE_URL'],
    [
      { ...valid, LOYALTY_PROJECTION_DATABASE_URL: 'mysql://localhost/db' },
      'PostgreSQL',
    ],
    [{ ...valid, LOYALTY_KAFKA_CONSUMER_ENABLED: 'false' }, 'must be true'],
    [{ ...valid, PORT: '0' }, 'PORT'],
    [{ ...valid, PORT: '65536' }, 'PORT'],
  ] as const)('rejects invalid worker configuration', (env, message) => {
    expect(() => validateLoyaltyWorkerEnv(env)).toThrow(message);
  });

  it('registers only Loyalty entities with a writable UTC connection', () => {
    const options = loyaltyWorkerDataSourceOptions(valid);

    expect(options).toMatchObject({
      type: 'postgres',
      url: valid.LOYALTY_PROJECTION_DATABASE_URL,
      entities: loyaltyEntities,
      synchronize: false,
      migrationsRun: false,
      logging: false,
      extra: { options: '-c timezone=UTC' },
    });
    expect(JSON.stringify(options)).not.toContain(
      'default_transaction_read_only',
    );
    expect(JSON.stringify(options)).not.toContain('LOYALTY_DATABASE_URL');
    expect(JSON.stringify(options)).not.toContain('LOYALTY_INTERNAL_TOKEN');
  });
});
