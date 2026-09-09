import {
  OPS_ADMIN_CARTABLE_COLUMNS,
  OPS_ADMIN_READER_ROLE,
  provisionOpsAdminReaderRole,
  validateOpsAdminReaderPassword,
} from './provision-ops-admin-reader-role';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

describe('Ops/Admin reader role provisioner', () => {
  it('rejects weak credentials', () => {
    expect(() => validateOpsAdminReaderPassword('short')).toThrow(
      'OPS_ADMIN_DATABASE_PASSWORD',
    );
    expect(() => validateOpsAdminReaderPassword('x'.repeat(32))).not.toThrow();
  });

  it('grants only the content-free cartable columns', async () => {
    const statements: string[] = [];
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format')) {
          return Promise.resolve({
            rows: [
              {
                statement: `ALTER ROLE ${OPS_ADMIN_READER_ROLE} PASSWORD '<redacted>'`,
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
                exactColumns: true,
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
      provisionOpsAdminReaderRole(
        client,
        'ops_admin_reader_password_2026_09_09',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: OPS_ADMIN_READER_ROLE,
      relationCount: 1,
    });
    const sql = statements.join('\n');
    expect(sql).toContain(
      'GRANT SELECT ("id", "assigneeId", "category", "sourceType"',
    );
    expect(sql).toContain('ON TABLE "ops"."cartable_tasks"');
    expect(OPS_ADMIN_CARTABLE_COLUMNS).not.toContain('title');
    expect(OPS_ADMIN_CARTABLE_COLUMNS).not.toContain('description');
    expect(OPS_ADMIN_CARTABLE_COLUMNS).not.toContain('attachments');
    expect(sql).not.toContain('GRANT USAGE ON SCHEMA "identity"');
    expect(sql).toContain('has_column_privilege');
    expect(statements.at(-1)).toBe('COMMIT');
  });
});
