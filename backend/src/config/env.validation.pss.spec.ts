import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('PSS environment validation', () => {
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

  it('allows the adapter to remain disabled during shadow migration', () => {
    expect(validateEnv({ ...base, PSS_INTEGRATION_ENABLED: 'false' })).toEqual(
      expect.objectContaining({ PSS_INTEGRATION_ENABLED: 'false' }),
    );
  });

  it('requires endpoint and a strong internal token when enabled', () => {
    expect(() =>
      validateEnv({ ...base, PSS_INTEGRATION_ENABLED: 'true' }),
    ).toThrow('PSS_SERVICE_URL');
    expect(() =>
      validateEnv({
        ...base,
        PSS_INTEGRATION_ENABLED: 'true',
        PSS_SERVICE_URL: 'http://pss-service:3100',
        PSS_INTERNAL_TOKEN: 'short',
      }),
    ).toThrow('at least 32 characters');
  });
});
