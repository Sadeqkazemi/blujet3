import {
  provisionTicketingRefundReaderRole,
  TICKETING_REFUND_READER_RELATIONS,
  TICKETING_REFUND_READER_ROLE,
  validateTicketingRefundReaderPassword,
} from './provision-ticketing-refund-reader-role';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

describe('Ticketing/Refund reader database role provisioner', () => {
  it('rejects weak credentials', () => {
    expect(() => validateTicketingRefundReaderPassword('short')).toThrow(
      'TICKETING_REFUND_DATABASE_PASSWORD',
    );
    expect(() =>
      validateTicketingRefundReaderPassword('x'.repeat(32)),
    ).not.toThrow();
  });

  it('grants only the explicit read set and no sequences', async () => {
    const statements: string[] = [];
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format')) {
          return Promise.resolve({
            rows: [
              {
                statement: `ALTER ROLE ${TICKETING_REFUND_READER_ROLE} PASSWORD '<redacted>'`,
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
      provisionTicketingRefundReaderRole(
        client,
        'ticketing_refund_reader_password_2026',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: TICKETING_REFUND_READER_ROLE,
      relationCount: TICKETING_REFUND_READER_RELATIONS.length,
    });
    const sql = statements.join('\n');
    expect(sql).toContain('default_transaction_read_only = on');
    expect(sql).toContain(
      'GRANT SELECT ON TABLE "payments"."core_itinerary_refunds"',
    );
    expect(sql).toContain(
      'GRANT SELECT ON TABLE "orders"."core_itinerary_ticket_documents"',
    );
    expect(sql).not.toContain('GRANT INSERT');
    expect(sql).not.toContain('GRANT USAGE ON SCHEMA "identity"');
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('rolls back failed verification', async () => {
    const statements: string[] = [];
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format'))
          return Promise.resolve({ rows: [{ statement: 'ALTER ROLE safe' }] });
        if (statement === 'SELECT current_database() AS database')
          return Promise.resolve({ rows: [{ database: 'blujet' }] });
        if (statement.includes('AS "restrictedReadOnly"'))
          return Promise.resolve({ rows: [{ restrictedReadOnly: false }] });
        return Promise.resolve({ rows: [] });
      }),
    };
    await expect(
      provisionTicketingRefundReaderRole(client, 'x'.repeat(32)),
    ).rejects.toThrow('verification failed');
    expect(statements.at(-1)).toBe('ROLLBACK');
  });
});
