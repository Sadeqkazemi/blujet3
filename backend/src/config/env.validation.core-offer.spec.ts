import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('Core offer environment validation', () => {
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

  it('accepts a strong signing key and numeric boundedness input', () => {
    expect(
      validateEnv({
        ...base,
        CORE_OFFER_SIGNING_SECRET: 'a'.repeat(32),
        CORE_OFFER_TTL_SECONDS: '900',
      }),
    ).toEqual(
      expect.objectContaining({
        CORE_OFFER_SIGNING_SECRET: 'a'.repeat(32),
        CORE_OFFER_TTL_SECONDS: '900',
      }),
    );
  });

  it('rejects a weak signing key or non-numeric TTL at startup', () => {
    expect(() =>
      validateEnv({ ...base, CORE_OFFER_SIGNING_SECRET: 'short' }),
    ).toThrow('CORE_OFFER_SIGNING_SECRET');
    expect(() =>
      validateEnv({ ...base, CORE_OFFER_TTL_SECONDS: 'five-minutes' }),
    ).toThrow('CORE_OFFER_TTL_SECONDS');
    expect(() =>
      validateEnv({ ...base, CORE_OFFER_TTL_SECONDS: '901' }),
    ).toThrow('between 60 and 900');
    expect(() =>
      validateEnv({ ...base, CORE_OFFER_TTL_SECONDS: '60.5' }),
    ).toThrow('between 60 and 900');
  });
});
