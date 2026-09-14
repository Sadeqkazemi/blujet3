import {
  OPS_ADMIN_PROJECTION_RUNTIME_GRANTS,
  OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
  OPS_ADMIN_PROJECTION_RUNTIME_TABLES,
  parseOpsAdminProjectionOwnerUrl,
  provisionOpsAdminProjectionRuntimeRole,
  validateOpsAdminProjectionDatabaseName,
  validateOpsAdminProjectionRuntimePassword,
} from './provision-ops-admin-projection-runtime-role';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

const PASSWORD = 'ops_admin_proj_runtime_password_20260914';

function mockClient(
  statements: string[],
  options?: {
    database?: string;
    version?: number;
    tables?: number;
    checks?: Record<string, boolean>;
    otherDatabases?: string[];
  },
): RuntimeRoleSqlClient {
  const checks = options?.checks ?? {
    restrictedRole: true,
    noMemberships: true,
    noOwnership: true,
    ownAccess: true,
    leastPrivilege: true,
    noCrossDomainAccess: true,
    noDdl: true,
    noForeignConnect: true,
  };
  return {
    query: jest.fn((statement: string) => {
      statements.push(statement);
      if (statement.startsWith('SELECT format')) {
        return Promise.resolve({
          rows: [
            {
              statement: `ALTER ROLE ${OPS_ADMIN_PROJECTION_RUNTIME_ROLE} PASSWORD '<redacted>'`,
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
      if (statement.includes('c.relname AS name')) {
        return Promise.resolve({
          rows: OPS_ADMIN_PROJECTION_RUNTIME_TABLES.slice(
            0,
            options?.tables ?? OPS_ADMIN_PROJECTION_RUNTIME_TABLES.length,
          ).map((name) => ({ name })),
        });
      }
      if (statement.includes('datname AS name')) {
        return Promise.resolve({
          rows: (options?.otherDatabases ?? ['blujet', 'postgres']).map(
            (name) => ({ name }),
          ),
        });
      }
      if (statement.includes('AS "restrictedRole"')) {
        return Promise.resolve({ rows: [checks] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

describe('Ops/Admin projection runtime role provisioner', () => {
  it('rejects weak credentials and non-Ops/Admin owner URLs', () => {
    expect(() => validateOpsAdminProjectionRuntimePassword('short')).toThrow(
      'OPS_ADMIN_PROJECTION_RUNTIME_PASSWORD',
    );
    expect(() =>
      validateOpsAdminProjectionRuntimePassword('x'.repeat(31)),
    ).toThrow();
    expect(() =>
      validateOpsAdminProjectionRuntimePassword(`${'x'.repeat(31)}:`),
    ).toThrow();
    expect(() =>
      validateOpsAdminProjectionRuntimePassword('x'.repeat(32)),
    ).not.toThrow();
    expect(() => validateOpsAdminProjectionDatabaseName('blujet')).toThrow(
      'isolated Ops/Admin database',
    );
    expect(() => validateOpsAdminProjectionDatabaseName('postgres')).toThrow();
    expect(() =>
      validateOpsAdminProjectionDatabaseName('blujet_ops_admin'),
    ).not.toThrow();
    expect(() =>
      validateOpsAdminProjectionDatabaseName(
        'blujet_ops_admin_projection_test',
      ),
    ).not.toThrow();
    expect(() =>
      parseOpsAdminProjectionOwnerUrl('mysql://owner@db/blujet_ops_admin'),
    ).toThrow('must be PostgreSQL');
    expect(() =>
      parseOpsAdminProjectionOwnerUrl(
        'postgresql://blujet_ops_admin_projection_runtime@db/blujet_ops_admin',
      ),
    ).toThrow('must differ from the runtime role');
    expect(() =>
      parseOpsAdminProjectionOwnerUrl('postgresql://owner@db/blujet'),
    ).toThrow('isolated Ops/Admin database');
    expect(
      parseOpsAdminProjectionOwnerUrl(
        'postgresql://owner:secret@db:5432/blujet_ops_admin',
      ),
    ).toEqual({ databaseName: 'blujet_ops_admin', username: 'owner' });
  });

  it('grants exact DML per table and never UPDATE on receipts', async () => {
    const statements: string[] = [];
    const client = mockClient(statements);
    await expect(
      provisionOpsAdminProjectionRuntimeRole(
        client,
        PASSWORD,
        'blujet_ops_admin',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
      relationCount: 4,
    });
    const sql = statements.join('\n');
    expect(sql).toContain(
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
    );
    expect(sql).toContain('GRANT CONNECT ON DATABASE "blujet_ops_admin"');
    expect(sql).toContain('GRANT USAGE ON SCHEMA "ops"');
    expect(sql).not.toContain('GRANT CREATE ON SCHEMA "ops"');
    expect(sql).not.toContain('default_transaction_read_only');
    for (const grant of OPS_ADMIN_PROJECTION_RUNTIME_GRANTS) {
      expect(sql).toContain(
        `GRANT ${grant.privileges} ON TABLE "ops"."${grant.table}"`,
      );
    }
    expect(sql).not.toContain(
      'GRANT SELECT, INSERT, UPDATE ON TABLE "ops"."cartable_projection_event_receipts"',
    );
    expect(sql).toContain('REVOKE CONNECT ON DATABASE %I FROM PUBLIC');
    expect(sql).toContain('REVOKE CONNECT ON DATABASE %I FROM ');
    expect(sql).toContain('has_database_privilege');
    expect(sql).toContain('AS "noForeignConnect"');
    expect(sql).toContain("'identity'");
    expect(sql).toContain("'orders'");
    expect(sql).toContain("'inventory'");
    expect(sql).toContain("'payments'");
    expect(sql).toContain("'agency'");
    expect(sql).toContain("'loyalty'");
    expect(sql).toContain(
      'REVOKE ALL ON SCHEMA %I FROM "blujet_ops_admin_projection_runtime"',
    );
    expect(sql).toContain('REVOKE ALL ON ALL SEQUENCES IN SCHEMA "ops"');
    expect(sql).not.toContain('GRANT SELECT, INSERT, UPDATE, DELETE');
    expect(sql).not.toMatch(/GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES/);
    expect(sql).not.toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA "ops" GRANT');
    expect(sql).not.toContain(PASSWORD);
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('fails closed when required relations or verification are missing', async () => {
    const missing: string[] = [];
    await expect(
      provisionOpsAdminProjectionRuntimeRole(
        mockClient(missing, { tables: 2 }),
        PASSWORD,
      ),
    ).rejects.toThrow('relations are missing');
    expect(missing.at(-1)).toBe('ROLLBACK');

    const core: string[] = [];
    await expect(
      provisionOpsAdminProjectionRuntimeRole(
        mockClient(core, { database: 'blujet' }),
        PASSWORD,
      ),
    ).rejects.toThrow('isolated Ops/Admin database');
    expect(core.at(-1)).toBe('ROLLBACK');

    const version: string[] = [];
    await expect(
      provisionOpsAdminProjectionRuntimeRole(
        mockClient(version, { version: 150000 }),
        PASSWORD,
      ),
    ).rejects.toThrow('PostgreSQL 16');
    expect(version.at(-1)).toBe('ROLLBACK');

    const failed: string[] = [];
    await expect(
      provisionOpsAdminProjectionRuntimeRole(
        mockClient(failed, { checks: { restrictedRole: false } }),
        PASSWORD,
      ),
    ).rejects.toThrow('verification failed');
    expect(failed.at(-1)).toBe('ROLLBACK');
  });
});
