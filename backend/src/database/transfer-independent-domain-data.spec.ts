import {
  transferDomainContract,
  validateTransferDatabaseUrls,
  validateTransferOptions,
} from './transfer-independent-domain-data';

describe('independent domain transfer contract', () => {
  it('allowlists exact tables in dependency-safe order', () => {
    expect(transferDomainContract('notify').tables).toEqual([
      'notifications',
      'sms_logs',
    ]);
    const experience = transferDomainContract('experience').tables;
    expect(experience).toHaveLength(15);
    expect(experience.indexOf('stored_files')).toBeLessThan(
      experience.indexOf('site_media_assets'),
    );
    const identity = transferDomainContract('identity');
    expect(identity.tables).toEqual([
      'users',
      'refresh_tokens',
      'two_factor_challenges',
      'password_reset_events',
      'security_policy',
      'customer_identity_verifications',
    ]);
    expect(identity.deferredSelfReference).toEqual({
      table: 'users',
      keyColumn: 'id',
      referenceColumn: 'createdById',
    });
    expect(() => transferDomainContract('payments')).toThrow(
      'must be notify, experience or identity',
    );
  });

  it('requires PostgreSQL URLs for different physical databases', () => {
    expect(() =>
      validateTransferDatabaseUrls(
        'postgresql://source@db-a:5432/core',
        'postgresql://target@db-b:5432/notify',
      ),
    ).not.toThrow();
    expect(() =>
      validateTransferDatabaseUrls(
        'postgresql://source@db:5432/core',
        'postgresql://target@db:5432/core',
      ),
    ).toThrow('different databases');
    expect(() =>
      validateTransferDatabaseUrls(
        'https://example.com/core',
        'postgresql://target@db:5432/notify',
      ),
    ).toThrow('must use PostgreSQL');
  });

  it('requires a reviewed backup reference only for bounded apply mode', () => {
    expect(() =>
      validateTransferOptions({ apply: false, batchSize: 100 }),
    ).not.toThrow();
    expect(() =>
      validateTransferOptions({ apply: true, batchSize: 100 }),
    ).toThrow('BACKUP_REFERENCE');
    expect(() =>
      validateTransferOptions({
        apply: true,
        backupReference: 'uat/core-20260910-120000.dump',
        batchSize: 100,
      }),
    ).not.toThrow();
    expect(() =>
      validateTransferOptions({
        apply: false,
        batchSize: 501,
      }),
    ).toThrow('BATCH_SIZE');
  });
});
