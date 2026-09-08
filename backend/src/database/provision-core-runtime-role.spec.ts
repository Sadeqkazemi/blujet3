import {
  CORE_RUNTIME_ROLE,
  CORE_RUNTIME_SCHEMAS,
  provisionCoreRuntimeRole,
  validateCoreRuntimePassword,
  type RuntimeRoleSqlClient,
} from './provision-core-runtime-role';

describe('core runtime database role provisioner', () => {
  it('rejects weak or URL-unsafe credentials before opening a transaction', () => {
    expect(() => validateCoreRuntimePassword('short')).toThrow(
      'CORE_DATABASE_PASSWORD',
    );
    expect(() => validateCoreRuntimePassword('x'.repeat(31))).toThrow();
    expect(() => validateCoreRuntimePassword(`${'x'.repeat(31)}:`)).toThrow();
    expect(() => validateCoreRuntimePassword('x'.repeat(32))).not.toThrow();
  });

  it('creates a restricted non-owner runtime role and grants only runtime capabilities', async () => {
    const statements: string[] = [];
    const password = 'core_runtime_password_2026_09_08_safe';
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format')) {
          return Promise.resolve({
            rows: [
              {
                statement: `ALTER ROLE ${CORE_RUNTIME_ROLE} PASSWORD '<redacted>'`,
              },
            ],
          });
        }
        if (statement === 'SELECT current_database() AS database') {
          return Promise.resolve({ rows: [{ database: 'blujet' }] });
        }
        if (statement.includes('AS "restrictedRole"')) {
          return Promise.resolve({
            rows: [
              {
                restrictedRole: true,
                noOwnership: true,
                runtimeGrants: true,
                noDdl: true,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    await expect(provisionCoreRuntimeRole(client, password)).resolves.toEqual({
      status: 'PASS',
      role: CORE_RUNTIME_ROLE,
      schemaCount: CORE_RUNTIME_SCHEMAS.length,
    });
    const sql = statements.join('\n');
    expect(sql).toContain('NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT');
    expect(sql).toContain('NOREPLICATION NOBYPASSRLS');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES');
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES');
    expect(sql).not.toContain(password);
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('rolls back when PostgreSQL privilege verification fails', async () => {
    const statements: string[] = [];
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format')) {
          return Promise.resolve({
            rows: [
              { statement: `ALTER ROLE ${CORE_RUNTIME_ROLE} PASSWORD 'safe'` },
            ],
          });
        }
        if (statement === 'SELECT current_database() AS database') {
          return Promise.resolve({ rows: [{ database: 'blujet' }] });
        }
        if (statement.includes('AS "restrictedRole"')) {
          return Promise.resolve({
            rows: [
              {
                restrictedRole: true,
                noOwnership: true,
                runtimeGrants: false,
                noDdl: true,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    await expect(
      provisionCoreRuntimeRole(client, 'x'.repeat(32)),
    ).rejects.toThrow('verification failed');
    expect(statements.at(-1)).toBe('ROLLBACK');
  });
});
