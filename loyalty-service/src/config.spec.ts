import { databaseOptions, validateEnv } from './config';

describe('Loyalty environment', () => {
  const valid = {
    NODE_ENV: 'test',
    LOYALTY_DATABASE_URL: 'postgresql://localhost/blujet_test',
    LOYALTY_INTERNAL_TOKEN: 'x'.repeat(32),
  };
  it('rejects missing secrets, invalid ports and non-PostgreSQL URLs', () => {
    for (const override of [
      { LOYALTY_INTERNAL_TOKEN: '' },
      { PORT: 70000 },
      { LOYALTY_DATABASE_URL: 'https://example.com' },
    ]) {
      expect(() => validateEnv({ ...valid, ...override })).toThrow();
    }
  });
  it('never synchronizes or runs migrations and defaults connections to read-only', () => {
    expect(validateEnv(valid)).toMatchObject({
      PORT: 3500,
      LOYALTY_MEMBERSHIP_PROJECTION_ENABLED: 'false',
      LOYALTY_TIER_RULES_PROJECTION_ENABLED: 'false',
    });
    expect(databaseOptions(valid.LOYALTY_DATABASE_URL)).toMatchObject({
      synchronize: false,
      migrationsRun: false,
      logging: false,
      entities: [],
      extra: {
        max: 4,
        statement_timeout: 2000,
        options: '-c default_transaction_read_only=on -c timezone=UTC',
      },
    });
  });

  it('accepts only explicit membership projection flags', () => {
    expect(
      validateEnv({
        ...valid,
        LOYALTY_MEMBERSHIP_PROJECTION_ENABLED: 'true',
      }).LOYALTY_MEMBERSHIP_PROJECTION_ENABLED,
    ).toBe('true');
    expect(() =>
      validateEnv({
        ...valid,
        LOYALTY_MEMBERSHIP_PROJECTION_ENABLED: 'yes',
      }),
    ).toThrow();
  });

  it('accepts only explicit tier-rules projection flags', () => {
    expect(
      validateEnv({
        ...valid,
        LOYALTY_TIER_RULES_PROJECTION_ENABLED: 'true',
      }).LOYALTY_TIER_RULES_PROJECTION_ENABLED,
    ).toBe('true');
    expect(() =>
      validateEnv({
        ...valid,
        LOYALTY_TIER_RULES_PROJECTION_ENABLED: 'yes',
      }),
    ).toThrow();
  });
});
