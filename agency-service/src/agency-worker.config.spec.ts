import {
  agencyWorkerDataSourceOptions,
  validateAgencyWorkerEnv,
} from './agency-worker.config';
import { agencyProjectionEntities } from './database/agency-entities';

describe('Agency worker configuration', () => {
  const valid = {
    NODE_ENV: 'test',
    PORT: '3610',
    AGENCY_PROJECTION_DATABASE_URL:
      'postgresql://agency_writer:secret@localhost/blujet_agency',
    AGENCY_KAFKA_CONSUMER_ENABLED: 'true',
    KAFKA_BROKERS: 'localhost:9092',
  };

  it('accepts an enabled worker with a dedicated database URL', () => {
    expect(validateAgencyWorkerEnv(valid)).toBe(valid);
  });

  it.each([
    [{ ...valid, AGENCY_PROJECTION_DATABASE_URL: '' }, 'DATABASE_URL'],
    [
      { ...valid, AGENCY_PROJECTION_DATABASE_URL: 'mysql://localhost/db' },
      'PostgreSQL',
    ],
    [{ ...valid, AGENCY_KAFKA_CONSUMER_ENABLED: 'false' }, 'must be true'],
    [{ ...valid, PORT: '0' }, 'PORT'],
    [{ ...valid, PORT: '65536' }, 'PORT'],
  ] as const)('rejects invalid worker configuration', (env, message) => {
    expect(() => validateAgencyWorkerEnv(env)).toThrow(message);
  });

  it('registers only Agency entities with a writable UTC connection', () => {
    const options = agencyWorkerDataSourceOptions(valid);

    expect(options).toMatchObject({
      type: 'postgres',
      url: valid.AGENCY_PROJECTION_DATABASE_URL,
      entities: agencyProjectionEntities,
      synchronize: false,
      migrationsRun: false,
      logging: false,
      extra: { options: '-c timezone=UTC' },
    });
    expect(JSON.stringify(options)).not.toContain(
      'default_transaction_read_only',
    );
    expect(JSON.stringify(options)).not.toContain('AGENCY_DATABASE_URL');
    expect(JSON.stringify(options)).not.toContain('AGENCY_INTERNAL_TOKEN');
  });
});
