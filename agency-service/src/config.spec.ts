import { databaseOptions, validateEnv } from './config';

describe('Agency environment', () => {
  const valid = {
    NODE_ENV: 'test',
    AGENCY_DATABASE_URL: 'postgresql://localhost/blujet_test',
    AGENCY_INTERNAL_TOKEN: 'x'.repeat(32),
  };
  it('rejects missing secrets, invalid ports and non-PostgreSQL URLs', () => {
    for (const override of [
      { AGENCY_INTERNAL_TOKEN: '' },
      { PORT: 70000 },
      { AGENCY_DATABASE_URL: 'https://example.com' },
      { AGENCY_PORTAL_INVOICES_ENABLED: 'yes' },
      { AGENCY_PORTAL_PROFILE_ENABLED: 'yes' },
    ]) {
      expect(() => validateEnv({ ...valid, ...override })).toThrow();
    }
  });
  it('never synchronizes or runs migrations and defaults connections to read-only', () => {
    expect(validateEnv(valid).PORT).toBe(3600);
    expect(validateEnv(valid).AGENCY_PORTAL_INVOICES_ENABLED).toBe('false');
    expect(validateEnv(valid).AGENCY_PORTAL_PROFILE_ENABLED).toBe('false');
    expect(
      validateEnv({ ...valid, AGENCY_PORTAL_INVOICES_ENABLED: 'true' })
        .AGENCY_PORTAL_INVOICES_ENABLED,
    ).toBe('true');
    expect(
      validateEnv({ ...valid, AGENCY_PORTAL_PROFILE_ENABLED: 'true' })
        .AGENCY_PORTAL_PROFILE_ENABLED,
    ).toBe('true');
    expect(databaseOptions(valid.AGENCY_DATABASE_URL)).toMatchObject({
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
});
