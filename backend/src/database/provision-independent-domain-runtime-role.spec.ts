import {
  independentDomainContract,
  provisionIndependentDomainRuntimeRole,
  validateIndependentDomainPassword,
} from './provision-independent-domain-runtime-role';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

describe('independent domain runtime role provisioner', () => {
  it('accepts only approved domains and strong URL-safe passwords', () => {
    expect(independentDomainContract('notify').role).toBe(
      'blujet_notify_runtime',
    );
    expect(independentDomainContract('experience').role).toBe(
      'blujet_experience_runtime',
    );
    expect(independentDomainContract('identity').role).toBe(
      'blujet_identity_runtime',
    );
    expect(() => independentDomainContract('payments')).toThrow(
      'must be notify, experience or identity',
    );
    expect(() =>
      validateIndependentDomainPassword('TEST_PASSWORD', 'short'),
    ).toThrow('TEST_PASSWORD');
    expect(() =>
      validateIndependentDomainPassword('TEST_PASSWORD', 'x'.repeat(32)),
    ).not.toThrow();
  });

  it.each(['notify', 'experience', 'identity'] as const)(
    'creates a restricted %s writer with no cross-domain or DDL access',
    async (domain) => {
      const statements: string[] = [];
      const client: RuntimeRoleSqlClient = {
        query: jest.fn((statement: string) => {
          statements.push(statement);
          if (statement.startsWith('SELECT format')) {
            return Promise.resolve({
              rows: [{ statement: 'ALTER ROLE runtime PASSWORD <redacted>' }],
            });
          }
          if (statement === 'SELECT current_database() AS database') {
            return Promise.resolve({
              rows: [{ database: `blujet_${domain}` }],
            });
          }
          if (statement.includes('AS "restrictedRole"')) {
            return Promise.resolve({
              rows: [
                {
                  restrictedRole: true,
                  noMemberships: true,
                  noOwnership: true,
                  ownDml: true,
                  noCrossDomainAccess: true,
                  noDdl: true,
                },
              ],
            });
          }
          if (statement.includes('count(*)::int AS count')) {
            return Promise.resolve({
              rows: [{ count: domain === 'identity' ? 6 : 2 }],
            });
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const contract = independentDomainContract(domain);
      await expect(
        provisionIndependentDomainRuntimeRole(
          client,
          contract,
          `${domain}_runtime_password_2026_09_10`,
        ),
      ).resolves.toEqual({
        status: 'PASS',
        domain,
        role: `blujet_${domain}_runtime`,
        relationCount: domain === 'identity' ? 6 : 2,
      });
      const sql = statements.join('\n');
      expect(sql).toContain(
        'NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
      );
      expect(sql).toContain(`GRANT USAGE ON SCHEMA "${domain}"`);
      expect(sql).toContain('REVOKE ALL ON SCHEMA public FROM PUBLIC');
      expect(sql).toContain('ALTER DEFAULT PRIVILEGES');
      expect(sql).not.toContain(`${domain}_runtime_password_2026_09_10`);
      expect(statements.at(-1)).toBe('COMMIT');
    },
  );

  it('rolls back if privilege verification fails', async () => {
    const statements: string[] = [];
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format')) {
          return Promise.resolve({
            rows: [{ statement: 'ALTER ROLE runtime' }],
          });
        }
        if (statement === 'SELECT current_database() AS database') {
          return Promise.resolve({ rows: [{ database: 'blujet_notify' }] });
        }
        if (statement.includes('AS "restrictedRole"')) {
          return Promise.resolve({
            rows: [
              {
                restrictedRole: true,
                noMemberships: true,
                noOwnership: true,
                ownDml: true,
                noCrossDomainAccess: false,
                noDdl: true,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    await expect(
      provisionIndependentDomainRuntimeRole(
        client,
        independentDomainContract('notify'),
        'x'.repeat(32),
      ),
    ).rejects.toThrow('verification failed');
    expect(statements.at(-1)).toBe('ROLLBACK');
  });
});
