import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('Notify environment validation', () => {
  const base = {
    NODE_ENV: 'test',
    PORT: '3001',
    DATABASE_URL: 'postgresql://user:pass@localhost/site',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'access',
    JWT_REFRESH_SECRET: 'refresh',
    ML_SERVICE_URL: 'http://localhost:8000',
    ML_SERVICE_INTERNAL_TOKEN: 'ml-token',
    PII_ENCRYPTION_KEY: 'a'.repeat(64),
  };

  it('keeps the compatibility implementation available for rollback', () => {
    expect(
      validateEnv({ ...base, NOTIFY_INTEGRATION_ENABLED: 'false' }),
    ).toEqual(expect.objectContaining({ NOTIFY_INTEGRATION_ENABLED: 'false' }));
  });

  it('requires endpoint and a strong internal token when enabled', () => {
    expect(() =>
      validateEnv({ ...base, NOTIFY_INTEGRATION_ENABLED: 'true' }),
    ).toThrow('NOTIFY_SERVICE_URL');
    expect(() =>
      validateEnv({
        ...base,
        NOTIFY_INTEGRATION_ENABLED: 'true',
        NOTIFY_SERVICE_URL: 'http://notify-service:3200',
        NOTIFY_INTERNAL_TOKEN: 'short',
      }),
    ).toThrow('longer than or equal to 32 characters');
  });
});
