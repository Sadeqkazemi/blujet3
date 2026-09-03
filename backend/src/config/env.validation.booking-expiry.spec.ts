import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('Booking expiry environment validation', () => {
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

  it('accepts the explicit polling rollback switch and numeric interval', () => {
    expect(
      validateEnv({
        ...base,
        BOOKING_EXPIRY_WORKER_ENABLED: 'false',
        BOOKING_EXPIRY_POLL_MS: '30000',
      }),
    ).toEqual(
      expect.objectContaining({
        BOOKING_EXPIRY_WORKER_ENABLED: 'false',
        BOOKING_EXPIRY_POLL_MS: '30000',
      }),
    );
  });

  it('rejects invalid worker settings at startup', () => {
    expect(() =>
      validateEnv({ ...base, BOOKING_EXPIRY_WORKER_ENABLED: 'yes' }),
    ).toThrow('BOOKING_EXPIRY_WORKER_ENABLED');
    expect(() =>
      validateEnv({ ...base, BOOKING_EXPIRY_POLL_MS: 'fast' }),
    ).toThrow('BOOKING_EXPIRY_POLL_MS');
  });
});
