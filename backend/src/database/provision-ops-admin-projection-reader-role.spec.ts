import { OPS_ADMIN_CARTABLE_COLUMNS } from './provision-ops-admin-reader-role';
import {
  OPS_ADMIN_PROJECTION_READER_COLUMNS,
  OPS_ADMIN_PROJECTION_READER_CONTROL_TABLES,
  OPS_ADMIN_PROJECTION_READER_DENIED_COLUMNS,
  OPS_ADMIN_PROJECTION_READER_ROLE,
  assertOpsAdminProjectionReaderRole,
  provisionOpsAdminProjectionReaderRole,
  validateOpsAdminProjectionReaderPassword,
} from './provision-ops-admin-projection-reader-role';
import { OPS_ADMIN_PROJECTION_RUNTIME_ROLE } from './provision-ops-admin-projection-runtime-role';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

const PASSWORD = 'ops_admin_proj_reader_password_20260914';

function mockClient(
  statements: string[],
  options?: {
    database?: string;
    version?: number;
    checks?: Record<string, boolean>;
  },
): RuntimeRoleSqlClient {
  const checks = options?.checks ?? {
    restrictedReadOnly: true,
    noMemberships: true,
    noOwnership: true,
    exactReads: true,
    exactColumns: true,
    noControlColumns: true,
    noControlTables: true,
    noWrites: true,
    noDdl: true,
    noCrossDomainAccess: true,
    noForeignConnect: true,
  };
  return {
    query: jest.fn((statement: string) => {
      statements.push(statement);
      if (statement.startsWith('SELECT format')) {
        return Promise.resolve({
          rows: [
            {
              statement: `ALTER ROLE ${OPS_ADMIN_PROJECTION_READER_ROLE} PASSWORD '<redacted>'`,
            },
          ],
        });
      }
      if (statement.includes("current_setting('server_version_num')")) {
        return Promise.resolve({
          rows: [
            {
              database: options?.database ?? 'blujet_ops_admin',
              version: options?.version ?? 160000,
            },
          ],
        });
      }
      if (statement.includes('AS "restrictedReadOnly"')) {
        return Promise.resolve({ rows: [checks] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

describe('Ops/Admin projection HTTP reader role provisioner', () => {
  it('rejects weak credentials and the projection writer role name', () => {
    expect(() => validateOpsAdminProjectionReaderPassword('short')).toThrow(
      'OPS_ADMIN_PROJECTION_READER_PASSWORD',
    );
    expect(() =>
      validateOpsAdminProjectionReaderPassword(PASSWORD),
    ).not.toThrow();
    expect(() =>
      assertOpsAdminProjectionReaderRole(OPS_ADMIN_PROJECTION_RUNTIME_ROLE),
    ).toThrow('must not reuse the projection writer');
    expect(() =>
      assertOpsAdminProjectionReaderRole(OPS_ADMIN_PROJECTION_READER_ROLE),
    ).not.toThrow();
    expect(OPS_ADMIN_PROJECTION_READER_ROLE).not.toBe(
      OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
    );
  });

  it('grants only the content-free cartable HTTP columns', async () => {
    const statements: string[] = [];
    const client = mockClient(statements);
    await expect(
      provisionOpsAdminProjectionReaderRole(
        client,
        PASSWORD,
        'blujet_ops_admin',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: OPS_ADMIN_PROJECTION_READER_ROLE,
      relationCount: 1,
    });
    const sql = statements.join('\n');
    expect(OPS_ADMIN_PROJECTION_READER_COLUMNS).toEqual(
      OPS_ADMIN_CARTABLE_COLUMNS,
    );
    expect(sql).toContain(
      'GRANT SELECT ("id", "assigneeId", "category", "sourceType", "sourceId", "status", "resolvedAt", "readAt", "createdAt") ON TABLE "ops"."cartable_tasks"',
    );
    expect(sql).toContain('default_transaction_read_only = on');
    expect(sql).toContain('NOINHERIT');
    expect(sql).not.toContain('GRANT SELECT, INSERT');
    for (const column of OPS_ADMIN_PROJECTION_READER_DENIED_COLUMNS) {
      expect(sql).not.toContain(`"${column}"`);
    }
    for (const table of OPS_ADMIN_PROJECTION_READER_CONTROL_TABLES) {
      expect(sql).not.toMatch(new RegExp(`GRANT .*${table}`));
    }
    expect(OPS_ADMIN_PROJECTION_READER_CONTROL_TABLES).toContain(
      'kafka_processing_failures',
    );
    expect(sql).not.toContain(OPS_ADMIN_PROJECTION_RUNTIME_ROLE);
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('rejects a non-isolated database and PostgreSQL older than 16', async () => {
    await expect(
      provisionOpsAdminProjectionReaderRole(
        mockClient([], { database: 'blujet' }),
        PASSWORD,
      ),
    ).rejects.toThrow('isolated Ops/Admin database');
    await expect(
      provisionOpsAdminProjectionReaderRole(
        mockClient([], { version: 150000 }),
        PASSWORD,
      ),
    ).rejects.toThrow('PostgreSQL 16');
  });
});
