import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('Notify service environment validation', () => {
  const base = {
    NODE_ENV: 'test',
    PORT: '3201',
    NOTIFY_DATABASE_URL: 'postgresql://user:pass@localhost/notify',
    NOTIFY_INTERNAL_TOKEN: 'test-notify-internal-token-at-least-32-characters',
    PII_ENCRYPTION_KEY:
      '3a6dfd91b775e9cd09be8a576889adfe518a31ad1064af3d63c21ce9aadbdf10',
  };

  it('accepts a complete configuration', () => {
    expect(validateEnv(base)).toEqual(expect.objectContaining(base));
  });

  it('rejects weak service identity and encryption keys', () => {
    expect(() =>
      validateEnv({ ...base, NOTIFY_INTERNAL_TOKEN: 'short' }),
    ).toThrow('longer than or equal to 32 characters');
    expect(() =>
      validateEnv({ ...base, PII_ENCRYPTION_KEY: 'not-a-key' }),
    ).toThrow('must match');
  });
});
