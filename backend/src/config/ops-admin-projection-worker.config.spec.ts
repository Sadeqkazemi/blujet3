import {
  opsAdminProjectionWorkerDataSourceOptions,
  validateOpsAdminProjectionWorkerEnv,
} from './ops-admin-projection-worker.config';

describe('Ops/Admin projection worker config', () => {
  const base = {
    NODE_ENV: 'test',
    OPS_ADMIN_PROJECTION_DATABASE_URL:
      'postgresql://ops_projection:password@localhost:5432/blujet_ops_admin',
    OPS_ADMIN_KAFKA_CONSUMER_ENABLED: 'true',
    KAFKA_BROKERS: 'localhost:9092',
    PORT: '3670',
  };

  it('accepts the isolated projection database and enabled consumer', () => {
    expect(() => validateOpsAdminProjectionWorkerEnv(base)).not.toThrow();
    expect(opsAdminProjectionWorkerDataSourceOptions(base)).toMatchObject({
      url: base.OPS_ADMIN_PROJECTION_DATABASE_URL,
      synchronize: false,
      migrationsTableName: 'ops_admin_projection_migrations',
    });
  });

  it('accepts an explicitly configured bounded quarantine', () => {
    expect(() =>
      validateOpsAdminProjectionWorkerEnv({
        ...base,
        OPS_ADMIN_DLQ_ENABLED: 'true',
        OPS_ADMIN_DLQ_MAX_ATTEMPTS: '3',
        OPS_ADMIN_DLQ_OPERATOR_TOKEN: 'x'.repeat(32),
      }),
    ).not.toThrow();
  });

  it.each([
    { NODE_ENV: 'staging' },
    { OPS_ADMIN_PROJECTION_DATABASE_URL: '' },
    { OPS_ADMIN_PROJECTION_DATABASE_URL: 'http://localhost/database' },
    { OPS_ADMIN_KAFKA_CONSUMER_ENABLED: 'false' },
    { OPS_ADMIN_DLQ_ENABLED: 'yes' },
    {
      OPS_ADMIN_DLQ_ENABLED: 'true',
      OPS_ADMIN_DLQ_OPERATOR_TOKEN: 'short',
    },
    { PORT: '0' },
    { PORT: '65536' },
  ])('rejects incomplete worker setting %j', (invalid) => {
    expect(() =>
      validateOpsAdminProjectionWorkerEnv({ ...base, ...invalid }),
    ).toThrow();
  });

  it('requires the restricted projection role in production', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      KAFKA_TLS_ENABLED: 'true',
      OPS_ADMIN_KAFKA_SASL_MECHANISM: 'scram-sha-512',
      OPS_ADMIN_KAFKA_SASL_USERNAME: 'ops-projection',
      OPS_ADMIN_KAFKA_SASL_PASSWORD: 'ops-secret',
    };
    expect(() => validateOpsAdminProjectionWorkerEnv(production)).toThrow(
      'blujet_ops_admin_projection_runtime',
    );

    expect(() =>
      validateOpsAdminProjectionWorkerEnv({
        ...production,
        OPS_ADMIN_PROJECTION_DATABASE_URL:
          'postgresql://blujet_ops_admin_projection_runtime:password@db:5432/blujet_ops_admin',
      }),
    ).not.toThrow();
  });
});
