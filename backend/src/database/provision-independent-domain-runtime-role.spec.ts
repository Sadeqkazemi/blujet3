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
    expect(independentDomainContract('loyalty')).toMatchObject({
      role: 'blujet_loyalty_runtime',
      access: 'read',
    });
    expect(independentDomainContract('agency')).toMatchObject({
      role: 'blujet_agency_runtime',
      passwordVariable: 'AGENCY_DATABASE_PASSWORD',
      access: 'read',
      readColumns: [
        expect.objectContaining({ table: 'agency_profiles' }),
        expect.objectContaining({ table: 'agency_invoices' }),
        expect.objectContaining({ table: 'agency_credit_requests' }),
      ],
    });
    expect(() => independentDomainContract('payments')).toThrow(
      'must be notify, experience, identity, loyalty or agency',
    );
    expect(() =>
      validateIndependentDomainPassword('TEST_PASSWORD', 'short'),
    ).toThrow('TEST_PASSWORD');
    expect(() =>
      validateIndependentDomainPassword('TEST_PASSWORD', 'x'.repeat(32)),
    ).not.toThrow();
  });

  it.each(['notify', 'experience', 'identity', 'loyalty', 'agency'] as const)(
    'creates a restricted %s runtime with no cross-domain or DDL access',
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
                  ownAccess: true,
                  leastPrivilege: true,
                  noCrossDomainAccess: true,
                  noDdl: true,
                },
              ],
            });
          }
          if (statement.includes('count(*)::int AS count')) {
            return Promise.resolve({
              rows: [
                {
                  count:
                    domain === 'agency'
                      ? 7
                      : domain === 'identity' || domain === 'loyalty'
                        ? 6
                        : 2,
                },
              ],
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
        access: domain === 'loyalty' || domain === 'agency' ? 'read' : 'write',
        relationCount:
          domain === 'agency'
            ? 7
            : domain === 'identity' || domain === 'loyalty'
              ? 6
              : 2,
      });
      const sql = statements.join('\n');
      expect(sql).toContain(
        'NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
      );
      expect(sql).toContain(`GRANT USAGE ON SCHEMA "${domain}"`);
      expect(sql).toContain('REVOKE ALL ON SCHEMA public FROM PUBLIC');
      expect(sql).toContain('REVOKE TEMPORARY ON DATABASE');
      expect(sql).toContain('ALTER DEFAULT PRIVILEGES');
      if (domain === 'loyalty') {
        expect(sql).toContain('GRANT SELECT ON ALL TABLES IN SCHEMA "loyalty"');
        expect(sql).not.toContain(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "loyalty"',
        );
      }
      if (domain === 'agency') {
        expect(sql).toContain(
          'GRANT SELECT ("userId", "licenseNo", "managerName"',
        );
        expect(sql).toContain('SELECT c.oid, c.relkind, c.relname');
        expect(sql).toContain('allowed.table_name = relation.relname');
        expect(sql).toContain(
          'ON "agency"."agency_credit_requests" TO "blujet_agency_runtime"',
        );
        expect(sql).not.toContain(
          'GRANT SELECT ON ALL TABLES IN SCHEMA "agency"',
        );
        expect(sql).not.toContain('GRANT SELECT ("version"');
      }
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
                ownAccess: true,
                leastPrivilege: true,
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
