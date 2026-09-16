import {
  AGENCY_PROJECTION_RUNTIME_GRANTS,
  AGENCY_PROJECTION_RUNTIME_ROLE,
  AGENCY_PROJECTION_RUNTIME_TABLES,
  parseAgencyProjectionOwnerUrl,
  provisionAgencyProjectionRuntimeRole,
  validateAgencyProjectionDatabaseName,
  validateAgencyProjectionRuntimePassword,
} from './provision-agency-projection-runtime-role';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

const PASSWORD = 'agency_proj_runtime_password_20260916';

function mockClient(
  statements: string[],
  options?: {
    database?: string;
    version?: number;
    tables?: number;
    checks?: Record<string, boolean>;
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
              statement: `ALTER ROLE ${AGENCY_PROJECTION_RUNTIME_ROLE} PASSWORD '<redacted>'`,
            },
          ],
        });
      }
      if (statement.includes("current_setting('server_version_num')")) {
        return Promise.resolve({
          rows: [
            {
              database: options?.database ?? 'blujet_agency',
              version: options?.version ?? 160000,
            },
          ],
        });
      }
      if (statement.includes('c.relname AS name')) {
        return Promise.resolve({
          rows: AGENCY_PROJECTION_RUNTIME_TABLES.slice(
            0,
            options?.tables ?? AGENCY_PROJECTION_RUNTIME_TABLES.length,
          ).map((name) => ({ name })),
        });
      }
      if (statement.includes('AS "restrictedRole"')) {
        return Promise.resolve({ rows: [checks] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

describe('Agency projection runtime role provisioner', () => {
  it('rejects weak credentials and non-Agency owner URLs', () => {
    expect(() => validateAgencyProjectionRuntimePassword('short')).toThrow(
      'AGENCY_PROJECTION_RUNTIME_PASSWORD',
    );
    expect(() =>
      validateAgencyProjectionRuntimePassword('x'.repeat(31)),
    ).toThrow();
    expect(() =>
      validateAgencyProjectionRuntimePassword(`${'x'.repeat(31)}:`),
    ).toThrow();
    expect(() =>
      validateAgencyProjectionRuntimePassword('x'.repeat(32)),
    ).not.toThrow();
    expect(() => validateAgencyProjectionDatabaseName('blujet')).toThrow(
      'isolated Agency database',
    );
    expect(() => validateAgencyProjectionDatabaseName('postgres')).toThrow();
    expect(() =>
      validateAgencyProjectionDatabaseName('blujet_agency'),
    ).not.toThrow();
    expect(() =>
      validateAgencyProjectionDatabaseName('blujet_agency_projection_test'),
    ).not.toThrow();
    expect(() =>
      parseAgencyProjectionOwnerUrl('mysql://owner@db/blujet_agency'),
    ).toThrow('must be PostgreSQL');
    expect(() =>
      parseAgencyProjectionOwnerUrl(
        'postgresql://blujet_agency_projection_runtime@db/blujet_agency',
      ),
    ).toThrow('must differ from the runtime role');
    expect(() =>
      parseAgencyProjectionOwnerUrl('postgresql://owner@db/blujet'),
    ).toThrow('isolated Agency database');
    expect(
      parseAgencyProjectionOwnerUrl(
        'postgresql://owner:secret@db:5432/blujet_agency',
      ),
    ).toEqual({ databaseName: 'blujet_agency', username: 'owner' });
  });

  it('grants exact DML per table and never UPDATE on receipts', async () => {
    const statements: string[] = [];
    const client = mockClient(statements);
    await expect(
      provisionAgencyProjectionRuntimeRole(client, PASSWORD, 'blujet_agency'),
    ).resolves.toEqual({
      status: 'PASS',
      role: AGENCY_PROJECTION_RUNTIME_ROLE,
      relationCount: 7,
    });
    const sql = statements.join('\n');
    expect(sql).toContain(
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
    );
    expect(sql).toContain('GRANT CONNECT ON DATABASE "blujet_agency"');
    expect(sql).toContain('GRANT USAGE ON SCHEMA "agency"');
    expect(sql).not.toContain('GRANT CREATE ON SCHEMA "agency"');
    expect(sql).not.toContain('default_transaction_read_only');
    expect(sql).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA "agency"');
    expect(sql).toContain('REVOKE ALL ON ALL SEQUENCES IN SCHEMA "agency"');
    for (const grant of AGENCY_PROJECTION_RUNTIME_GRANTS) {
      expect(sql).toContain(
        `GRANT ${grant.privileges} ON TABLE "agency"."${grant.table}"`,
      );
    }
    expect(sql).not.toContain(
      'GRANT SELECT, INSERT, UPDATE ON TABLE "agency"."agency_projection_event_receipts"',
    );
    expect(sql).toContain('REVOKE CONNECT ON DATABASE %I FROM PUBLIC');
    expect(sql).toContain('GRANT CONNECT ON DATABASE %I TO %I');
    expect(sql).toContain('has_database_privilege');
    expect(sql).toContain('AS "noForeignConnect"');
    expect(sql).toContain("'identity'");
    expect(sql).toContain("'orders'");
    expect(sql).toContain("'inventory'");
    expect(sql).toContain("'payments'");
    expect(sql).toContain("'loyalty'");
    expect(sql).toContain(
      'REVOKE ALL ON SCHEMA %I FROM "blujet_agency_projection_runtime"',
    );
    expect(sql).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM');
    expect(sql).not.toContain('GRANT SELECT, INSERT, UPDATE, DELETE');
    expect(sql).not.toMatch(/GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES/);
    expect(sql).not.toContain(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "agency" GRANT',
    );
    expect(sql).not.toContain(PASSWORD);
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('fails closed when required relations or extra privileges remain', async () => {
    const missing: string[] = [];
    await expect(
      provisionAgencyProjectionRuntimeRole(
        mockClient(missing, { tables: 5 }),
        PASSWORD,
      ),
    ).rejects.toThrow('relations are missing');
    expect(missing.at(-1)).toBe('ROLLBACK');

    const core: string[] = [];
    await expect(
      provisionAgencyProjectionRuntimeRole(
        mockClient(core, { database: 'blujet' }),
        PASSWORD,
      ),
    ).rejects.toThrow('isolated Agency database');
    expect(core.at(-1)).toBe('ROLLBACK');

    const version: string[] = [];
    await expect(
      provisionAgencyProjectionRuntimeRole(
        mockClient(version, { version: 150000 }),
        PASSWORD,
      ),
    ).rejects.toThrow('PostgreSQL 16');
    expect(version.at(-1)).toBe('ROLLBACK');

    const extra: string[] = [];
    await expect(
      provisionAgencyProjectionRuntimeRole(
        mockClient(extra, { checks: { leastPrivilege: false } }),
        PASSWORD,
      ),
    ).rejects.toThrow('verification failed');
    expect(extra.at(-1)).toBe('ROLLBACK');
  });
});
