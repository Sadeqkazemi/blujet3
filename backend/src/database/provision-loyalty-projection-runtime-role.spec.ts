import {
  LOYALTY_PROJECTION_RUNTIME_ROLE,
  LOYALTY_RUNTIME_GRANTS,
  parseLoyaltyOwnerUrl,
  provisionLoyaltyProjectionRuntimeRole,
  type LoyaltyRuntimeRoleSqlClient,
  validateLoyaltyDatabaseName,
  validateLoyaltyRuntimePassword,
} from './provision-loyalty-projection-runtime-role';

const PASSWORD = 'loyalty_projection_runtime_2026_safe';
const TABLES = LOYALTY_RUNTIME_GRANTS.map(({ table }) => table).sort();

class SuccessfulClient implements LoyaltyRuntimeRoleSqlClient {
  readonly calls: Array<{ text: string; values?: readonly unknown[] }> = [];

  constructor(
    private readonly options: {
      database?: string;
      version?: number;
      tables?: readonly string[];
      verification?: Record<string, unknown>;
    } = {},
  ) {}

  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }> {
    this.calls.push({ text, values });
    if (text.startsWith("SELECT format('ALTER ROLE")) {
      return Promise.resolve({
        rows: [
          {
            statement: `ALTER ROLE "${LOYALTY_PROJECTION_RUNTIME_ROLE}" PASSWORD 'safe'`,
          },
        ],
      });
    }
    if (text.includes('current_setting')) {
      return Promise.resolve({
        rows: [
          {
            database: this.options.database ?? 'blujet_loyalty_test',
            version: this.options.version ?? 160000,
          },
        ],
      });
    }
    if (text.includes('SELECT c.relname AS name')) {
      return Promise.resolve({
        rows: (this.options.tables ?? TABLES).map((name) => ({ name })),
      });
    }
    if (text.startsWith('WITH role_state AS')) {
      return Promise.resolve({
        rows: [
          this.options.verification ?? {
            restrictedRole: true,
            noMemberships: true,
            noOwnership: true,
            databaseAccess: true,
            schemaAccess: true,
            requiredGrants: true,
            leastPrivilege: true,
            noCrossDomainAccess: true,
            noForeignConnect: true,
          },
        ],
      });
    }
    return Promise.resolve({ rows: [] });
  }
}

describe('Loyalty projection runtime role provisioner', () => {
  it('validates the isolated owner URL and URL-safe password', () => {
    expect(
      parseLoyaltyOwnerUrl(
        'postgresql://loyalty_owner:secret@localhost:5432/blujet_loyalty_test',
      ),
    ).toEqual({
      databaseName: 'blujet_loyalty_test',
      username: 'loyalty_owner',
    });
    expect(() => validateLoyaltyRuntimePassword(PASSWORD)).not.toThrow();
    expect(() => validateLoyaltyDatabaseName('blujet_loyalty')).not.toThrow();
  });

  it.each([
    'https://localhost/blujet_loyalty',
    'postgresql://localhost/blujet',
    `postgresql://${LOYALTY_PROJECTION_RUNTIME_ROLE}:secret@localhost/blujet_loyalty`,
  ])('rejects an unsafe owner URL: %s', (url) => {
    expect(() => parseLoyaltyOwnerUrl(url)).toThrow();
  });

  it.each(['short', 'contains space but is long enough 2026', 'x'.repeat(129)])(
    'rejects an unsafe runtime password',
    (password) => {
      expect(() => validateLoyaltyRuntimePassword(password)).toThrow(
        'LOYALTY_PROJECTION_RUNTIME_PASSWORD',
      );
    },
  );

  it('applies only the exact Loyalty writer privileges', async () => {
    const client = new SuccessfulClient();

    await expect(
      provisionLoyaltyProjectionRuntimeRole(
        client,
        PASSWORD,
        'blujet_loyalty_test',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: LOYALTY_PROJECTION_RUNTIME_ROLE,
      relationCount: 10,
    });

    const sql = client.calls.map(({ text }) => text).join('\n');
    for (const grant of LOYALTY_RUNTIME_GRANTS) {
      expect(sql).toContain(
        `GRANT ${grant.privileges.join(', ')} ON loyalty."${grant.table}"`,
      );
    }
    expect(sql).not.toMatch(/GRANT[^\n]*DELETE/);
    expect(sql).toContain('REVOKE ALL ON ALL SEQUENCES IN SCHEMA loyalty');
    expect(sql).toContain('REVOKE CONNECT ON DATABASE %I FROM PUBLIC');
    expect(sql).toContain("SET timezone = 'UTC'");
    expect(sql).toContain("SET statement_timeout = '5s'");
    expect(sql).toContain("SET lock_timeout = '2s'");
    expect(client.calls.at(-1)?.text).toBe('COMMIT');
  });

  it('rolls back an incomplete privilege boundary', async () => {
    const client = new SuccessfulClient({
      verification: {
        restrictedRole: true,
        noMemberships: true,
        noOwnership: true,
        databaseAccess: true,
        schemaAccess: true,
        requiredGrants: true,
        leastPrivilege: false,
        noCrossDomainAccess: true,
        noForeignConnect: true,
      },
    });

    await expect(
      provisionLoyaltyProjectionRuntimeRole(client, PASSWORD),
    ).rejects.toThrow('runtime role verification failed');
    expect(client.calls.at(-1)?.text).toBe('ROLLBACK');
  });

  it('rolls back relation, version and database mismatches', async () => {
    const missingRelation = new SuccessfulClient({
      tables: TABLES.slice(1),
    });
    await expect(
      provisionLoyaltyProjectionRuntimeRole(missingRelation, PASSWORD),
    ).rejects.toThrow('relation contract does not match');
    expect(missingRelation.calls.at(-1)?.text).toBe('ROLLBACK');

    const oldServer = new SuccessfulClient({ version: 150000 });
    await expect(
      provisionLoyaltyProjectionRuntimeRole(oldServer, PASSWORD),
    ).rejects.toThrow('requires PostgreSQL 16');
    expect(oldServer.calls.at(-1)?.text).toBe('ROLLBACK');

    const wrongDatabase = new SuccessfulClient({
      database: 'blujet_loyalty_wrong',
    });
    await expect(
      provisionLoyaltyProjectionRuntimeRole(
        wrongDatabase,
        PASSWORD,
        'blujet_loyalty_expected',
      ),
    ).rejects.toThrow('owner URL must target');
    expect(wrongDatabase.calls.at(-1)?.text).toBe('ROLLBACK');
  });
});
