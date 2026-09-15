import {
  REPORTING_CUTOVER_DENIED_COLUMNS,
  REPORTING_CUTOVER_READER_GRANTS,
  REPORTING_CUTOVER_SOURCE_ROLE,
  REPORTING_CUTOVER_TARGET_ROLE,
  classifyReportingCutoverOwnerUrls,
  parseReportingCutoverOwnerUrl,
  parseReportingCutoverReaderKind,
  provisionReportingCutoverReaderRole,
  validateReportingCutoverReaderPassword,
  type ReportingCutoverReaderSqlClient,
} from './provision-reporting-cutover-reader-roles';
import { REPORTING_PROJECTION_RUNTIME_ROLE } from './provision-reporting-projection-runtime-role';

const PASSWORD = 'reporting_cutover_reader_password_2026';
const TABLES = [
  'core_itinerary_event_projections',
  'core_itinerary_event_receipts',
  'kafka_consumer_checkpoints',
  'kafka_processing_failures',
];

const PASS_CHECKS: Record<string, boolean> = {
  restrictedReadOnly: true,
  noMemberships: true,
  noOwnership: true,
  databaseAccess: true,
  schemaAccess: true,
  noForeignSchemaAccess: true,
  exactReads: true,
  exactColumns: true,
  noPayload: true,
  noWrites: true,
  noDdl: true,
  noCrossDomainAccess: true,
  noCounterpartConnect: true,
};

class SuccessfulClient implements ReportingCutoverReaderSqlClient {
  readonly calls: Array<{ text: string; values?: readonly unknown[] }> = [];

  constructor(
    private readonly database: string,
    private readonly verification: Record<string, unknown> = PASS_CHECKS,
  ) {}

  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }> {
    this.calls.push({ text, values });
    if (text.startsWith("SELECT format('ALTER ROLE")) {
      return Promise.resolve({
        rows: [{ statement: `ALTER ROLE "cutover" PASSWORD 'safe'` }],
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

describe('Reporting cutover reader role provisioner', () => {
  it('validates kinds, URL-safe passwords and owner URLs', () => {
    expect(parseReportingCutoverReaderKind('source')).toBe('source');
    expect(parseReportingCutoverReaderKind('target')).toBe('target');
    expect(() => parseReportingCutoverReaderKind('writer')).toThrow(
      'kind is invalid',
    );
    expect(() =>
      validateReportingCutoverReaderPassword(PASSWORD, 'source'),
    ).not.toThrow();
    expect(() =>
      validateReportingCutoverReaderPassword('short', 'source'),
    ).toThrow('REPORTING_CUTOVER_SOURCE_PASSWORD');
    expect(
      parseReportingCutoverOwnerUrl(
        'postgresql://core_owner:secret@localhost:5432/blujet',
        'source',
      ),
    ).toEqual({
      databaseName: 'blujet',
      username: 'core_owner',
      identity: 'localhost:5432/blujet',
    });
    expect(
      parseReportingCutoverOwnerUrl(
        'postgresql://reporting_owner:secret@localhost:5432/blujet_reporting',
        'target',
      ).databaseName,
    ).toBe('blujet_reporting');
    expect(REPORTING_CUTOVER_SOURCE_ROLE).not.toBe(
      REPORTING_PROJECTION_RUNTIME_ROLE,
    );
    expect(REPORTING_CUTOVER_TARGET_ROLE).not.toBe(
      REPORTING_CUTOVER_SOURCE_ROLE,
    );
  });

  it.each([
    [
      'postgresql://core_owner:secret@localhost:5432/blujet_reporting',
      'source',
    ],
    ['postgresql://core_owner:secret@localhost:5432/blujet', 'target'],
    [
      `postgresql://${REPORTING_CUTOVER_SOURCE_ROLE}:secret@localhost:5432/blujet`,
      'source',
    ],
    [
      `postgresql://${REPORTING_PROJECTION_RUNTIME_ROLE}:secret@localhost:5432/blujet_reporting`,
      'target',
    ],
    ['https://localhost/blujet', 'source'],
  ])('rejects an unsafe owner URL', (url, kind) => {
    expect(() =>
      parseReportingCutoverOwnerUrl(url, kind as 'source' | 'target'),
    ).toThrow();
  });

  it('rejects identical source and target owner databases', () => {
    expect(
      classifyReportingCutoverOwnerUrls(
        'postgresql://core_owner:secret@localhost:5432/blujet',
        'postgresql://reporting_owner:secret@localhost:5432/blujet_reporting',
      ),
    ).toEqual({
      sourceDatabaseName: 'blujet',
      targetDatabaseName: 'blujet_reporting',
      sharesDatabaseServer: true,
    });
    expect(
      classifyReportingCutoverOwnerUrls(
        'postgresql://core_owner:secret@core-db:5432/blujet',
        'postgresql://reporting_owner:secret@reporting-db:5432/blujet_reporting',
      ).sharesDatabaseServer,
    ).toBe(false);
    expect(() =>
      classifyReportingCutoverOwnerUrls(
        'postgresql://core_owner:secret@db:5432/blujet',
        'postgresql://reporting_owner:secret@db:5432/blujet',
      ),
    ).toThrow('distinct databases');
  });

  it('grants only the cutover SELECT columns and never payload', async () => {
    const client = new SuccessfulClient('blujet');
    await expect(
      provisionReportingCutoverReaderRole(
        client,
        PASSWORD,
        'source',
        'blujet',
        'blujet_reporting',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: REPORTING_CUTOVER_SOURCE_ROLE,
      relationCount: 4,
    });
    const sql = client.calls.map(({ text }) => text).join('\n');
    expect(sql).toContain(
      'GRANT SELECT ("orderId", "eventType", "eventId", "fingerprint", "orderVersion", "currency", "occurredAt", "createdAt", "updatedAt") ON TABLE "reporting"."core_itinerary_event_projections"',
    );
    expect(sql).toContain(
      'GRANT SELECT ("eventId", "fingerprint", "orderId", "eventType", "orderVersion", "receivedAt") ON TABLE "reporting"."core_itinerary_event_receipts"',
    );
    expect(sql).toContain(
      'GRANT SELECT ("consumerGroup", "topic", "status") ON TABLE "reporting"."kafka_processing_failures"',
    );
    expect(sql).toContain(
      'GRANT SELECT ("consumerGroup", "topic", "partition", "nextOffset", "highWatermark") ON TABLE "reporting"."kafka_consumer_checkpoints"',
    );
    expect(sql).toContain('default_transaction_read_only = on');
    expect(sql).toContain("SET timezone = 'UTC'");
    expect(sql).toContain("SET statement_timeout = '5s'");
    expect(sql).toContain("SET lock_timeout = '2s'");
    expect(sql).toContain('LOGIN NOSUPERUSER');
    expect(sql).toContain('NOINHERIT');
    expect(sql).toContain("'blujet_reporting', 'CONNECT'");
    expect(sql).toContain('REVOKE %I FROM');
    expect(sql).not.toContain('FROM PUBLIC');
    expect(sql).not.toContain('REVOKE CONNECT ON DATABASE "blujet_reporting"');
    expect(sql).not.toMatch(/GRANT[^\n]*INSERT/);
    expect(sql).not.toContain('"payload"');
    expect(REPORTING_CUTOVER_DENIED_COLUMNS).toContain('payload');
    expect(REPORTING_CUTOVER_READER_GRANTS).toHaveLength(4);
    expect(client.calls.at(-1)?.text).toBe('COMMIT');
  });

  it('rolls back verification, version and database identity failures', async () => {
    const failed = new SuccessfulClient('blujet', {
      ...PASS_CHECKS,
      noPayload: false,
    });
    await expect(
      provisionReportingCutoverReaderRole(failed, PASSWORD, 'source'),
    ).rejects.toThrow('reader role verification failed');
    expect(failed.calls.at(-1)?.text).toBe('ROLLBACK');

    const publicPrivilegeLeak = new SuccessfulClient('blujet', {
      ...PASS_CHECKS,
      noForeignSchemaAccess: false,
      noCounterpartConnect: false,
    });
    await expect(
      provisionReportingCutoverReaderRole(
        publicPrivilegeLeak,
        PASSWORD,
        'source',
        'blujet',
        'blujet_reporting',
      ),
    ).rejects.toThrow('reader role verification failed');
    expect(publicPrivilegeLeak.calls.at(-1)?.text).toBe('ROLLBACK');

    const reportingNamed = new SuccessfulClient('blujet_reporting');
    await expect(
      provisionReportingCutoverReaderRole(
        reportingNamed,
        PASSWORD,
        'source',
        'blujet',
      ),
    ).rejects.toThrow('Core/shared');
    expect(reportingNamed.calls.at(-1)?.text).toBe('ROLLBACK');

    const coreNamed = new SuccessfulClient('blujet');
    await expect(
      provisionReportingCutoverReaderRole(
        coreNamed,
        PASSWORD,
        'target',
        'blujet_reporting',
      ),
    ).rejects.toThrow('isolated Reporting database');
    expect(coreNamed.calls.at(-1)?.text).toBe('ROLLBACK');
  });
});
