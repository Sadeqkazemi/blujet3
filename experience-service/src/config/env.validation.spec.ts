import { validateEnv } from './env.validation';

describe('experience environment validation', () => {
  const valid = {
    NODE_ENV: 'test',
    PORT: '3300',
    EXPERIENCE_DATABASE_URL: 'postgresql://localhost/experience',
    EXPERIENCE_INTERNAL_TOKEN: 'x'.repeat(32),
    PII_ENCRYPTION_KEY: 'a'.repeat(64),
  };

  it('accepts a complete environment', () => {
    expect(validateEnv(valid)).toMatchObject(valid);
  });

  it('rejects a short internal token', () => {
    expect(() =>
      validateEnv({ ...valid, EXPERIENCE_INTERNAL_TOKEN: 'short' }),
    ).toThrow('Invalid experience environment configuration');
  });

  it('rejects a non-hex PII encryption key at startup', () => {
    expect(() =>
      validateEnv({ ...valid, PII_ENCRYPTION_KEY: 'z'.repeat(64) }),
    ).toThrow('Invalid experience environment configuration');
  });
});
