import {
  OFFER_READER_RELATIONS,
  OFFER_READER_ROLE,
  provisionOfferReaderRole,
  validateOfferReaderPassword,
} from './provision-offer-reader-role';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

describe('Offer reader database role provisioner', () => {
  it('rejects weak or URL-unsafe credentials', () => {
    expect(() => validateOfferReaderPassword('short')).toThrow(
      'OFFER_DATABASE_PASSWORD',
    );
    expect(() => validateOfferReaderPassword(`${'x'.repeat(31)}:`)).toThrow();
    expect(() => validateOfferReaderPassword('x'.repeat(32))).not.toThrow();
  });

  it('revokes broad access and grants only the explicit read set', async () => {
    const statements: string[] = [];
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format')) {
          return Promise.resolve({
            rows: [
              {
                statement: `ALTER ROLE ${OFFER_READER_ROLE} PASSWORD '<redacted>'`,
              },
            ],
          });
        }
        if (statement === 'SELECT current_database() AS database') {
          return Promise.resolve({ rows: [{ database: 'blujet' }] });
        }
        if (statement.includes('AS "restrictedReadOnly"')) {
          return Promise.resolve({
            rows: [
              {
                restrictedReadOnly: true,
                noMemberships: true,
                noOwnership: true,
                exactReads: true,
                noWrites: true,
                noSequences: true,
                noDdl: true,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    await expect(
      provisionOfferReaderRole(client, 'offer_reader_password_2026_09_safe'),
    ).resolves.toEqual({
      status: 'PASS',
      role: OFFER_READER_ROLE,
      relationCount: OFFER_READER_RELATIONS.length,
    });
    const sql = statements.join('\n');
    expect(sql).toContain('default_transaction_read_only = on');
    expect(sql).toContain('ALTER ROLE blujet_offer_reader RESET ALL');
    expect(sql).toContain('REVOKE %I FROM blujet_offer_reader');
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON ALL TABLES');
    expect(sql).toContain('GRANT SELECT ON TABLE "inventory"."fare_rules"');
    expect(sql).not.toContain('GRANT INSERT');
    expect(sql).not.toContain('GRANT USAGE ON SCHEMA "identity"');
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('rolls back a failed privilege verification', async () => {
    const statements: string[] = [];
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format')) {
          return Promise.resolve({ rows: [{ statement: 'ALTER ROLE safe' }] });
        }
        if (statement === 'SELECT current_database() AS database') {
          return Promise.resolve({ rows: [{ database: 'blujet' }] });
        }
        if (statement.includes('AS "restrictedReadOnly"')) {
          return Promise.resolve({ rows: [{ restrictedReadOnly: false }] });
        }
        return Promise.resolve({ rows: [] });
      }),
    };
    await expect(
      provisionOfferReaderRole(client, 'x'.repeat(32)),
    ).rejects.toThrow('verification failed');
    expect(statements.at(-1)).toBe('ROLLBACK');
  });
});
