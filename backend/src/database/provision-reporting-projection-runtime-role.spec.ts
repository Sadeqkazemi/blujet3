import {
  parseReportingOwnerUrl,
  provisionReportingProjectionRuntimeRole,
  REPORTING_PROJECTION_RUNTIME_ROLE,
  type ReportingRuntimeRoleSqlClient,
  validateReportingDatabaseName,
  validateReportingRuntimePassword,
} from './provision-reporting-projection-runtime-role';

const PASSWORD = 'reporting_runtime_password_2026_safe';
const TABLES = [
  'core_itinerary_event_projections',
  'core_itinerary_event_receipts',
  'kafka_consumer_checkpoints',
  'kafka_processing_failures',
];

class SuccessfulClient implements ReportingRuntimeRoleSqlClient {
  readonly calls: Array<{ text: string; values?: readonly unknown[] }> = [];

  constructor(
    private readonly database = 'blujet_reporting_test',
    private readonly verification: Record<string, unknown> = {
      restrictedRole: true,
      noMemberships: true,
      noOwnership: true,
      databaseAccess: true,
      schemaAccess: true,
      requiredGrants: true,
      leastPrivilege: true,
      noCrossDomainAccess: true,
      noForeignConnect: true,
    },
  ) {}

  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }> {
    this.calls.push({ text, values });
    if (text.startsWith("SELECT format('ALTER ROLE")) {
      return Promise.resolve({
        rows: [
          {
            statement: `ALTER ROLE "${REPORTING_PROJECTION_RUNTIME_ROLE}" PASSWORD 'safe'`,
          },
        ],
      });
    }
    if (text.includes('current_setting')) {
      return Promise.resolve({
        rows: [{ database: this.database, version: 160000 }],
      });
    }
    if (text.includes('SELECT c.relname AS name')) {
      return Promise.resolve({ rows: TABLES.map((name) => ({ name })) });
    }
    if (text.startsWith('WITH role_state AS')) {
      return Promise.resolve({ rows: [this.verification] });
    }
    return Promise.resolve({ rows: [] });
  }
}

describe('Reporting projection runtime role provisioner', () => {
  it('validates the isolated owner URL and URL-safe password', () => {
    expect(
      parseReportingOwnerUrl(
        'postgresql://reporting_owner:secret@localhost:5432/blujet_reporting_test',
      ),
    ).toEqual({
      databaseName: 'blujet_reporting_test',
      username: 'reporting_owner',
    });
    expect(() => validateReportingRuntimePassword(PASSWORD)).not.toThrow();
    expect(() =>
      validateReportingDatabaseName('blujet_reporting'),
    ).not.toThrow();
  });

  it.each([
    'https://localhost/blujet_reporting',
    'postgresql://localhost/blujet',
    `postgresql://${REPORTING_PROJECTION_RUNTIME_ROLE}:secret@localhost/blujet_reporting`,
  ])('rejects an unsafe owner URL: %s', (url) => {
    expect(() => parseReportingOwnerUrl(url)).toThrow();
  });

  it.each(['short', 'contains space but is long enough 2026', 'x'.repeat(129)])(
    'rejects an unsafe runtime password',
    (password) => {
      expect(() => validateReportingRuntimePassword(password)).toThrow(
        'REPORTING_PROJECTION_RUNTIME_PASSWORD',
      );
    },
  );

  it('applies only the exact Reporting writer privileges', async () => {
    const client = new SuccessfulClient();

    await expect(
      provisionReportingProjectionRuntimeRole(
        client,
        PASSWORD,
        'blujet_reporting_test',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: REPORTING_PROJECTION_RUNTIME_ROLE,
      relationCount: 4,
    });

    const sql = client.calls.map(({ text }) => text).join('\n');
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON reporting."core_itinerary_event_projections"',
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT ON reporting."core_itinerary_event_receipts"',
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON reporting."kafka_consumer_checkpoints"',
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON reporting."kafka_processing_failures"',
    );
    expect(sql).not.toMatch(/GRANT[^\n]*DELETE/);
    expect(sql).toContain('REVOKE ALL ON ALL SEQUENCES IN SCHEMA reporting');
    expect(sql).toContain('REVOKE CONNECT ON DATABASE %I FROM PUBLIC');
    expect(client.calls.at(-1)?.text).toBe('COMMIT');
  });

  it('rolls back an incomplete privilege boundary', async () => {
    const client = new SuccessfulClient('blujet_reporting_test', {
      restrictedRole: true,
      noMemberships: true,
      noOwnership: true,
      databaseAccess: true,
      schemaAccess: true,
      requiredGrants: true,
      leastPrivilege: false,
      noCrossDomainAccess: true,
      noForeignConnect: true,
    });

    await expect(
      provisionReportingProjectionRuntimeRole(client, PASSWORD),
    ).rejects.toThrow('runtime role verification failed');
    expect(client.calls.at(-1)?.text).toBe('ROLLBACK');
  });

  it('rolls back database and relation contract mismatches', async () => {
    const client = new SuccessfulClient('blujet_reporting_wrong');
    await expect(
      provisionReportingProjectionRuntimeRole(
        client,
        PASSWORD,
        'blujet_reporting_expected',
      ),
    ).rejects.toThrow('owner URL must target');
    expect(client.calls.at(-1)?.text).toBe('ROLLBACK');
  });
});
