import {
  LOYALTY_CUTOVER_SOURCE_GRANTS,
  LOYALTY_CUTOVER_SOURCE_ROLE,
  LOYALTY_CUTOVER_TARGET_GRANTS,
  LOYALTY_CUTOVER_TARGET_ROLE,
  LOYALTY_RUNTIME_ROLE,
  classifyLoyaltyCutoverOwnerUrls,
  parseLoyaltyCutoverOwnerUrl,
  parseLoyaltyCutoverReaderKind,
  provisionLoyaltyCutoverReaderRole,
  validateLoyaltyCutoverReaderPassword,
  type LoyaltyCutoverReaderSqlClient,
} from './provision-loyalty-cutover-reader-roles';

const PASSWORD = 'loyalty_cutover_reader_password_2026';

const PASS_CHECKS: Record<string, boolean> = {
  restrictedReadOnly: true,
  noMemberships: true,
  noOwnership: true,
  databaseAccess: true,
  schemaAccess: true,
  noForeignSchemaAccess: true,
  exactReads: true,
  exactColumns: true,
  noWrites: true,
  noDdl: true,
  noCrossDomainAccess: true,
  noCounterpartConnect: true,
};

class SuccessfulClient implements LoyaltyCutoverReaderSqlClient {
  readonly calls: Array<{ text: string; values?: readonly unknown[] }> = [];

  constructor(
    private readonly database: string,
    private readonly verification: Record<string, unknown> = PASS_CHECKS,
    private readonly version = 160000,
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
        rows: [{ database: this.database, version: this.version }],
      });
    }
    if (text.startsWith('WITH role_state AS')) {
      return Promise.resolve({ rows: [this.verification] });
    }
    return Promise.resolve({ rows: [] });
  }
}

describe('Loyalty cutover reader role provisioner', () => {
  it('validates kind, credentials and source/target owner identity', () => {
    expect(parseLoyaltyCutoverReaderKind('source')).toBe('source');
    expect(parseLoyaltyCutoverReaderKind('target')).toBe('target');
    expect(() => parseLoyaltyCutoverReaderKind('writer')).toThrow(
      'kind is invalid',
    );
    expect(() =>
      validateLoyaltyCutoverReaderPassword(PASSWORD, 'source'),
    ).not.toThrow();
    expect(() =>
      validateLoyaltyCutoverReaderPassword('short', 'source'),
    ).toThrow('LOYALTY_CUTOVER_SOURCE_PASSWORD');
    expect(
      parseLoyaltyCutoverOwnerUrl(
        'postgresql://core_owner:secret@localhost:5432/blujet',
        'source',
      ),
    ).toEqual({
      databaseName: 'blujet',
      username: 'core_owner',
      identity: 'localhost:5432/blujet',
    });
    expect(
      parseLoyaltyCutoverOwnerUrl(
        'postgresql://loyalty_owner:secret@localhost:5432/blujet_loyalty',
        'target',
      ).databaseName,
    ).toBe('blujet_loyalty');
  });

  it.each([
    ['postgresql://owner:secret@localhost/blujet_loyalty', 'source'],
    ['postgresql://owner:secret@localhost/blujet', 'target'],
    [`postgresql://${LOYALTY_RUNTIME_ROLE}:secret@localhost/blujet`, 'source'],
    [
      `postgresql://${LOYALTY_CUTOVER_TARGET_ROLE}:secret@localhost/blujet_loyalty`,
      'target',
    ],
    ['https://localhost/blujet', 'source'],
  ])('rejects an unsafe owner URL', (url, kind) => {
    expect(() =>
      parseLoyaltyCutoverOwnerUrl(url, kind as 'source' | 'target'),
    ).toThrow();
  });

  it('classifies distinct databases and rejects identical ones', () => {
    expect(
      classifyLoyaltyCutoverOwnerUrls(
        'postgresql://core_owner:secret@localhost:5432/blujet',
        'postgresql://loyalty_owner:secret@localhost:5432/blujet_loyalty',
      ),
    ).toEqual({
      sourceDatabaseName: 'blujet',
      targetDatabaseName: 'blujet_loyalty',
      sharesDatabaseServer: true,
    });
    expect(
      classifyLoyaltyCutoverOwnerUrls(
        'postgresql://core_owner:secret@core-db:5432/blujet',
        'postgresql://loyalty_owner:secret@loyalty-db:5432/blujet_loyalty',
      ).sharesDatabaseServer,
    ).toBe(false);
    expect(() =>
      classifyLoyaltyCutoverOwnerUrls(
        'postgresql://core_owner:secret@db:5432/blujet',
        'postgresql://loyalty_owner:secret@db:5432/blujet',
      ),
    ).toThrow('distinct databases');
  });

  it('provisions the exact source read contract without PUBLIC mutation', async () => {
    const client = new SuccessfulClient('blujet');
    await expect(
      provisionLoyaltyCutoverReaderRole(
        client,
        PASSWORD,
        'source',
        'blujet',
        'blujet_loyalty',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: LOYALTY_CUTOVER_SOURCE_ROLE,
      relationCount: 8,
    });
    const sql = client.calls.map(({ text }) => text).join('\n');
    expect(sql).toContain('ON TABLE "orders"."commerce_outbox_events"');
    expect(sql).toContain(
      'GRANT SELECT ("producer", "deliveredAt", "deadLetterAt", "claimedAt")',
    );
    expect(sql).toContain('ON TABLE "loyalty"."loyalty_projection_audits"');
    expect(sql).not.toContain('"envelopeEncrypted"');
    expect(sql).not.toContain('"mutation"');
    expect(sql).not.toContain('FROM PUBLIC');
    expect(sql).toContain('default_transaction_read_only = on');
    expect(sql).toContain('LOGIN NOSUPERUSER');
    expect(sql).toContain('NOINHERIT');
    expect(sql).toContain("'blujet_loyalty', 'CONNECT'");
    expect(client.calls.at(-1)?.text).toBe('COMMIT');
  });

  it('provisions the exact target read contract', async () => {
    const client = new SuccessfulClient('blujet_loyalty');
    await expect(
      provisionLoyaltyCutoverReaderRole(
        client,
        PASSWORD,
        'target',
        'blujet_loyalty',
        'blujet',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: LOYALTY_CUTOVER_TARGET_ROLE,
      relationCount: 10,
    });
    const sql = client.calls.map(({ text }) => text).join('\n');
    expect(sql).toContain(
      'GRANT SELECT ("auditId", "aggregateType", "aggregateId", "recordVersion") ON TABLE "loyalty"."loyalty_projection_event_receipts"',
    );
    expect(sql).toContain(
      'GRANT SELECT ("status") ON TABLE "loyalty"."kafka_processing_failures"',
    );
    expect(sql).toContain(
      'GRANT SELECT ("consumerGroup", "topic", "partition", "nextOffset", "highWatermark") ON TABLE "loyalty"."kafka_consumer_checkpoints"',
    );
    expect(sql).not.toContain('"semanticFingerprint"');
    expect(sql).not.toContain('"approvedBy"');
    expect(sql).not.toContain('"orders"."commerce_outbox_events"');
    expect(LOYALTY_CUTOVER_SOURCE_GRANTS).toHaveLength(8);
    expect(LOYALTY_CUTOVER_TARGET_GRANTS).toHaveLength(10);
  });

  it('rolls back verification, version and database identity failures', async () => {
    const failed = new SuccessfulClient('blujet', {
      ...PASS_CHECKS,
      exactColumns: false,
    });
    await expect(
      provisionLoyaltyCutoverReaderRole(failed, PASSWORD, 'source'),
    ).rejects.toThrow('reader role verification failed');
    expect(failed.calls.at(-1)?.text).toBe('ROLLBACK');

    const oldPostgres = new SuccessfulClient('blujet', PASS_CHECKS, 150000);
    await expect(
      provisionLoyaltyCutoverReaderRole(oldPostgres, PASSWORD, 'source'),
    ).rejects.toThrow('PostgreSQL 16');
    expect(oldPostgres.calls.at(-1)?.text).toBe('ROLLBACK');

    const wrongSource = new SuccessfulClient('blujet_loyalty');
    await expect(
      provisionLoyaltyCutoverReaderRole(wrongSource, PASSWORD, 'source'),
    ).rejects.toThrow('Core/shared');
    expect(wrongSource.calls.at(-1)?.text).toBe('ROLLBACK');

    const wrongTarget = new SuccessfulClient('blujet');
    await expect(
      provisionLoyaltyCutoverReaderRole(wrongTarget, PASSWORD, 'target'),
    ).rejects.toThrow('isolated Loyalty database');
    expect(wrongTarget.calls.at(-1)?.text).toBe('ROLLBACK');
  });
});
