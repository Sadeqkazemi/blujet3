import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('Ops/Admin cartable counts environment validation', () => {
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
  const token = 'ops-admin-counts-env-token-at-least-32-characters';
  const runtimeOptions = Intl.DateTimeFormat().resolvedOptions();

  beforeEach(() => {
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps the integration disabled without credentials', () => {
    expect(
      validateEnv({
        ...base,
        OPS_ADMIN_CARTABLE_COUNTS_READ_ENABLED: 'false',
      }),
    ).toEqual(
      expect.objectContaining({
        OPS_ADMIN_CARTABLE_COUNTS_READ_ENABLED: 'false',
      }),
    );
  });

  it('accepts complete enabled configuration and rejects partial input', () => {
    expect(
      validateEnv({
        ...base,
        OPS_ADMIN_CARTABLE_COUNTS_READ_ENABLED: 'true',
        OPS_ADMIN_SERVICE_URL: 'http://ops-admin:3660',
        OPS_ADMIN_INTERNAL_TOKEN: token,
      }),
    ).toEqual(
      expect.objectContaining({
        OPS_ADMIN_CARTABLE_COUNTS_READ_ENABLED: 'true',
      }),
    );
    expect(() =>
      validateEnv({
        ...base,
        OPS_ADMIN_CARTABLE_COUNTS_READ_ENABLED: 'true',
      }),
    ).toThrow('Ops/Admin');
  });

  it('rejects a non-boolean cutover flag', () => {
    expect(() =>
      validateEnv({
        ...base,
        OPS_ADMIN_CARTABLE_COUNTS_READ_ENABLED: 'yes',
      }),
    ).toThrow();
  });
});
