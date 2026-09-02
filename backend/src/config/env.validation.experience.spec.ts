import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('experience integration environment validation', () => {
  const base = {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgresql://localhost/blujet',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
    JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-characters',
    PII_ENCRYPTION_KEY: 'a'.repeat(64),
    SMS_PROVIDER: 'mock',
    PAYMENT_GATEWAY: 'mock',
    ML_SERVICE_URL: 'http://localhost:8000',
    ML_SERVICE_INTERNAL_TOKEN: 'internal-token-with-at-least-32-chars',
  };

  it('requires URL and token when Experience integration is enabled', () => {
    expect(() =>
      validateEnv({ ...base, EXPERIENCE_INTEGRATION_ENABLED: 'true' }),
    ).toThrow('Invalid environment configuration');
  });

  it('accepts a fully configured Experience integration', () => {
    expect(
      validateEnv({
        ...base,
        EXPERIENCE_INTEGRATION_ENABLED: 'true',
        EXPERIENCE_SERVICE_URL: 'http://experience-service:3300',
        EXPERIENCE_INTERNAL_TOKEN: 'x'.repeat(32),
      }),
    ).toMatchObject({ EXPERIENCE_INTEGRATION_ENABLED: 'true' });
  });
});
