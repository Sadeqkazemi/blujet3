import {
  PAYMENT_RECONCILIATION_READER_RELATIONS,
  PAYMENT_RECONCILIATION_READER_ROLE,
  provisionPaymentReconciliationReaderRole,
  validatePaymentReconciliationReaderPassword,
} from './provision-payment-reconciliation-reader-role';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

describe('Payment/Reconciliation reader role provisioner', () => {
  it('rejects weak credentials', () => {
    expect(() => validatePaymentReconciliationReaderPassword('short')).toThrow(
      'PAYMENT_RECONCILIATION_DATABASE_PASSWORD',
    );
    expect(() =>
      validatePaymentReconciliationReaderPassword('x'.repeat(32)),
    ).not.toThrow();
  });

  it('grants only payment evidence and order reads', async () => {
    const statements: string[] = [];
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format')) {
          return Promise.resolve({
            rows: [
              {
                statement: `ALTER ROLE ${PAYMENT_RECONCILIATION_READER_ROLE} PASSWORD '<redacted>'`,
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
      provisionPaymentReconciliationReaderRole(
        client,
        'payment_reconciliation_reader_password_2026',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: PAYMENT_RECONCILIATION_READER_ROLE,
      relationCount: PAYMENT_RECONCILIATION_READER_RELATIONS.length,
    });
    const sql = statements.join('\n');
    expect(sql).toContain(
      'GRANT SELECT ON TABLE "payments"."payment_reconciliations"',
    );
    expect(sql).toContain('GRANT SELECT ON TABLE "payments"."ledger_entries"');
    expect(sql).not.toContain('GRANT USAGE ON SCHEMA "identity"');
    expect(sql).toContain('FROM pg_sequence s');
    expect(statements.at(-1)).toBe('COMMIT');
  });
});
