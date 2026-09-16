import {
  AGENCY_CUTOVER_DENIED_COLUMNS,
  AGENCY_CUTOVER_SOURCE_GRANTS,
  AGENCY_CUTOVER_SOURCE_ROLE,
  AGENCY_CUTOVER_TARGET_GRANTS,
  AGENCY_CUTOVER_TARGET_ROLE,
  AGENCY_RUNTIME_ROLE,
  classifyAgencyCutoverOwnerUrls,
  parseAgencyCutoverOwnerUrl,
  parseAgencyCutoverReaderKind,
  provisionAgencyCutoverReaderRole,
  validateAgencyCutoverReaderPassword,
  type AgencyCutoverReaderSqlClient,
} from './provision-agency-cutover-reader-roles';

const PASSWORD = 'agency_cutover_reader_password_2026';

const PASS_CHECKS: Record<string, boolean> = {
  restrictedReadOnly: true,
  noMemberships: true,
  noOwnership: true,
  databaseAccess: true,
  schemaAccess: true,
  noForeignSchemaAccess: true,
  exactReads: true,
  exactColumns: true,
  noDeniedColumns: true,
  noWrites: true,
  noDdl: true,
  noCrossDomainAccess: true,
  noCounterpartConnect: true,
};

class SuccessfulClient implements AgencyCutoverReaderSqlClient {
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
    if (text.includes('AS present')) {
      return Promise.resolve({ rows: [{ present: 1 }] });
    }
    if (text.startsWith('WITH role_state AS')) {
      return Promise.resolve({ rows: [this.verification] });
    }
    return Promise.resolve({ rows: [] });
  }
}

describe('Agency cutover reader role provisioner', () => {
  it('validates kinds, URL-safe passwords and owner URLs', () => {
    expect(parseAgencyCutoverReaderKind('source')).toBe('source');
    expect(parseAgencyCutoverReaderKind('target')).toBe('target');
    expect(() => parseAgencyCutoverReaderKind('writer')).toThrow(
      'kind is invalid',
    );
    expect(() =>
      validateAgencyCutoverReaderPassword(PASSWORD, 'source'),
    ).not.toThrow();
    expect(() =>
      validateAgencyCutoverReaderPassword('short', 'source'),
    ).toThrow('AGENCY_CUTOVER_SOURCE_PASSWORD');
    expect(
      parseAgencyCutoverOwnerUrl(
        'postgresql://core_owner:secret@localhost:5432/blujet',
        'source',
      ),
    ).toEqual({
      databaseName: 'blujet',
      username: 'core_owner',
      identity: 'localhost:5432/blujet',
    });
    expect(
      parseAgencyCutoverOwnerUrl(
        'postgresql://agency_owner:secret@localhost:5432/blujet_agency',
        'target',
      ).databaseName,
    ).toBe('blujet_agency');
    expect(AGENCY_CUTOVER_SOURCE_ROLE).not.toBe(AGENCY_RUNTIME_ROLE);
    expect(AGENCY_CUTOVER_TARGET_ROLE).not.toBe(AGENCY_CUTOVER_SOURCE_ROLE);
  });

  it.each([
    ['postgresql://core_owner:secret@localhost:5432/blujet_agency', 'source'],
    ['postgresql://core_owner:secret@localhost:5432/blujet', 'target'],
    [
      `postgresql://${AGENCY_CUTOVER_SOURCE_ROLE}:secret@localhost:5432/blujet`,
      'source',
    ],
    [
      `postgresql://${AGENCY_RUNTIME_ROLE}:secret@localhost:5432/blujet_agency`,
      'target',
    ],
    ['https://localhost/blujet', 'source'],
  ])('rejects an unsafe owner URL', (url, kind) => {
    expect(() =>
      parseAgencyCutoverOwnerUrl(url, kind as 'source' | 'target'),
    ).toThrow();
  });

  it('rejects identical source and target owner databases', () => {
    expect(
      classifyAgencyCutoverOwnerUrls(
        'postgresql://core_owner:secret@localhost:5432/blujet',
        'postgresql://agency_owner:secret@localhost:5432/blujet_agency',
      ),
    ).toEqual({
      sourceDatabaseName: 'blujet',
      targetDatabaseName: 'blujet_agency',
      sharesDatabaseServer: true,
    });
    expect(
      classifyAgencyCutoverOwnerUrls(
        'postgresql://core_owner:secret@core-db:5432/blujet',
        'postgresql://agency_owner:secret@agency-db:5432/blujet_agency',
      ).sharesDatabaseServer,
    ).toBe(false);
    expect(() =>
      classifyAgencyCutoverOwnerUrls(
        'postgresql://core_owner:secret@db:5432/blujet',
        'postgresql://agency_owner:secret@db:5432/blujet',
      ),
    ).toThrow('distinct databases');
  });

  it('grants only the source Gate columns, including audits and outbox', async () => {
    const client = new SuccessfulClient('blujet');
    await expect(
      provisionAgencyCutoverReaderRole(
        client,
        PASSWORD,
        'source',
        'blujet',
        'blujet_agency',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: AGENCY_CUTOVER_SOURCE_ROLE,
      relationCount: 5,
    });
    const sql = client.calls.map(({ text }) => text).join('\n');
    expect(sql).toContain(
      'GRANT SELECT ("userId", "version", "licenseNo", "managerName", "phone", "email", "city", "address", "tier", "suspendedAt", "suspendReason", "joinedAt") ON TABLE "agency"."agency_profiles"',
    );
    expect(sql).toContain(
      'GRANT SELECT ("id", "aggregateType", "aggregateId", "recordVersion") ON TABLE "agency"."agency_projection_audits"',
    );
    expect(sql).toContain(
      'GRANT SELECT ("producer", "deliveredAt", "deadLetterAt", "claimedAt") ON TABLE "orders"."commerce_outbox_events"',
    );
    expect(sql).toContain('default_transaction_read_only = on');
    expect(sql).toContain("SET timezone = 'UTC'");
    expect(sql).toContain("SET statement_timeout = '5s'");
    expect(sql).toContain("SET lock_timeout = '2s'");
    expect(sql).toContain('LOGIN NOSUPERUSER');
    expect(sql).toContain('NOINHERIT');
    expect(sql).toContain("'blujet_agency', 'CONNECT'");
    expect(sql).toContain('REVOKE %I FROM');
    expect(sql).not.toContain('FROM PUBLIC');
    expect(sql).not.toMatch(/GRANT[^\n]*INSERT/);
    expect(sql).not.toContain('"envelopeFingerprint"');
    expect(sql).not.toContain('"receivedAt"');
    expect(sql).not.toContain('"mutation"');
    expect(AGENCY_CUTOVER_DENIED_COLUMNS).toEqual(
      expect.arrayContaining(['envelopeFingerprint', 'receivedAt']),
    );
    expect(AGENCY_CUTOVER_SOURCE_GRANTS).toHaveLength(5);
    expect(client.calls.at(-1)?.text).toBe('COMMIT');
  });

  it('grants only the target Gate columns and never slot auditId', async () => {
    const client = new SuccessfulClient('blujet_agency');
    await expect(
      provisionAgencyCutoverReaderRole(
        client,
        PASSWORD,
        'target',
        'blujet_agency',
        'blujet',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: AGENCY_CUTOVER_TARGET_ROLE,
      relationCount: 7,
    });
    const sql = client.calls.map(({ text }) => text).join('\n');
    expect(sql).toContain(
      'GRANT SELECT ("eventId", "semanticFingerprint", "aggregateType", "aggregateId", "recordVersion", "auditId") ON TABLE "agency"."agency_projection_event_receipts"',
    );
    expect(sql).toContain(
      'GRANT SELECT ("aggregateType", "aggregateId", "recordVersion", "semanticFingerprint") ON TABLE "agency"."agency_projection_slots"',
    );
    expect(sql).toContain(
      'GRANT SELECT ("status") ON TABLE "agency"."kafka_processing_failures"',
    );
    expect(sql).not.toContain('commerce_outbox_events');
    expect(sql).not.toContain('agency_projection_audits');
    expect(sql).not.toMatch(
      /GRANT SELECT \([^)]*"auditId"[^)]*\) ON TABLE "agency"."agency_projection_slots"/,
    );
    expect(AGENCY_CUTOVER_TARGET_GRANTS).toHaveLength(7);
  });

  it('rolls back verification, version and database identity failures', async () => {
    const failed = new SuccessfulClient('blujet', {
      ...PASS_CHECKS,
      noDeniedColumns: false,
    });
    await expect(
      provisionAgencyCutoverReaderRole(failed, PASSWORD, 'source'),
    ).rejects.toThrow('reader role verification failed');
    expect(failed.calls.at(-1)?.text).toBe('ROLLBACK');

    const publicPrivilegeLeak = new SuccessfulClient('blujet', {
      ...PASS_CHECKS,
      noForeignSchemaAccess: false,
      noCounterpartConnect: false,
    });
    await expect(
      provisionAgencyCutoverReaderRole(
        publicPrivilegeLeak,
        PASSWORD,
        'source',
        'blujet',
        'blujet_agency',
      ),
    ).rejects.toThrow('reader role verification failed');
    expect(publicPrivilegeLeak.calls.at(-1)?.text).toBe('ROLLBACK');

    const agencyNamed = new SuccessfulClient('blujet_agency');
    await expect(
      provisionAgencyCutoverReaderRole(
        agencyNamed,
        PASSWORD,
        'source',
        'blujet',
      ),
    ).rejects.toThrow('Core/shared');
    expect(agencyNamed.calls.at(-1)?.text).toBe('ROLLBACK');

    const coreNamed = new SuccessfulClient('blujet');
    await expect(
      provisionAgencyCutoverReaderRole(
        coreNamed,
        PASSWORD,
        'target',
        'blujet_agency',
      ),
    ).rejects.toThrow('isolated Agency database');
    expect(coreNamed.calls.at(-1)?.text).toBe('ROLLBACK');
  });
});
