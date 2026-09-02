import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const valid = {
    NODE_ENV: 'test',
    PORT: '3101',
    PSS_DATABASE_URL: 'postgresql://user:pass@localhost:5433/pss',
    PSS_INTERNAL_TOKEN: 'x'.repeat(32),
  };

  it('accepts the complete PSS environment', () => {
    expect(validateEnv(valid)).toEqual(expect.objectContaining(valid));
  });

  it('rejects a short internal token', () => {
    expect(() =>
      validateEnv({ ...valid, PSS_INTERNAL_TOKEN: 'short' }),
    ).toThrow('Invalid PSS environment configuration');
  });

  it('rejects a missing independent database URL', () => {
    expect(() =>
      validateEnv({ ...valid, PSS_DATABASE_URL: undefined }),
    ).toThrow('Invalid PSS environment configuration');
  });
});
