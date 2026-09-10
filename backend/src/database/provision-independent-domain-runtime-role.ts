import 'dotenv/config';
import { Client } from 'pg';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

export type IndependentDomain =
  'notify' | 'experience' | 'identity' | 'loyalty';

type DomainRuntimeAccess = 'read' | 'write';

interface DomainRuntimeContract {
  domain: IndependentDomain;
  role: string;
  passwordVariable: string;
  access: DomainRuntimeAccess;
}

const CONTRACTS: Record<IndependentDomain, DomainRuntimeContract> = {
  notify: {
    domain: 'notify',
    role: 'blujet_notify_runtime',
    passwordVariable: 'NOTIFY_DATABASE_PASSWORD',
    access: 'write',
  },
  experience: {
    domain: 'experience',
    role: 'blujet_experience_runtime',
    passwordVariable: 'EXPERIENCE_DATABASE_PASSWORD',
    access: 'write',
  },
  identity: {
    domain: 'identity',
    role: 'blujet_identity_runtime',
    passwordVariable: 'IDENTITY_DATABASE_PASSWORD',
    access: 'write',
  },
  loyalty: {
    domain: 'loyalty',
    role: 'blujet_loyalty_runtime',
    passwordVariable: 'LOYALTY_DATABASE_PASSWORD',
    access: 'read',
  },
};

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function independentDomainContract(
  value: string | undefined,
): DomainRuntimeContract {
  if (
    value !== 'notify' &&
    value !== 'experience' &&
    value !== 'identity' &&
    value !== 'loyalty'
  ) {
    throw new Error(
      'DOMAIN_DATABASE_KIND must be notify, experience, identity or loyalty',
    );
  }
  return CONTRACTS[value];
}

export function validateIndependentDomainPassword(
  variable: string,
  password: string,
): void {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
    throw new Error(`${variable} must be 32-128 URL-safe characters`);
  }
}

export async function provisionIndependentDomainRuntimeRole(
  client: RuntimeRoleSqlClient,
  contract: DomainRuntimeContract,
  password: string,
): Promise<{
  status: 'PASS';
  domain: IndependentDomain;
  role: string;
  access: DomainRuntimeAccess;
  relationCount: number;
}> {
  validateIndependentDomainPassword(contract.passwordVariable, password);
  const role = identifier(contract.role);
  const schema = identifier(contract.domain);

  await client.query('BEGIN');
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${contract.role}') THEN
        CREATE ROLE ${role} LOGIN;
      END IF;
    END $$`);
    const formatted = await client.query(
      `SELECT format('ALTER ROLE ${role} PASSWORD %L', $1::text) AS statement`,
      [password],
    );
    const passwordStatement = formatted.rows[0]?.statement;
    if (typeof passwordStatement !== 'string') {
      throw new Error('PostgreSQL could not prepare the runtime credential');
    }
    await client.query(passwordStatement);
    await client.query(`ALTER ROLE ${role}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await client.query(`ALTER ROLE ${role} RESET ALL`);

    await client.query(`DO $$ DECLARE parent_role record; BEGIN
      FOR parent_role IN
        SELECT parent.rolname
        FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        JOIN pg_roles parent ON parent.oid = membership.roleid
        WHERE member.rolname = '${contract.role}'
      LOOP
        EXECUTE format('REVOKE %I FROM ${role}', parent_role.rolname);
      END LOOP;
    END $$`);

    const database = await client.query(
      'SELECT current_database() AS database',
    );
    const databaseName = database.rows[0]?.database;
    if (typeof databaseName !== 'string') {
      throw new Error('PostgreSQL database identity is unavailable');
    }
    const databaseIdentifier = identifier(databaseName);
    await client.query(
      `REVOKE ALL ON DATABASE ${databaseIdentifier} FROM ${role}`,
    );
    await client.query(
      `REVOKE TEMPORARY ON DATABASE ${databaseIdentifier} FROM PUBLIC`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${role}`,
    );
    await client.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await client.query(`REVOKE ALL ON SCHEMA public FROM ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await client.query(
      `REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${role}`,
    );
    await client.query(
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schema} FROM ${role}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE ALL ON TABLES FROM ${role}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE ALL ON SEQUENCES FROM ${role}`,
    );
    if (contract.access === 'write') {
      await client.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`,
      );
      await client.query(
        `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`,
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${role}`,
      );
    } else {
      await client.query(
        `GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${role}`,
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT ON TABLES TO ${role}`,
      );
    }
    await client.query(
      `ALTER ROLE ${role} IN DATABASE ${databaseIdentifier} SET search_path = ${schema}, pg_catalog`,
    );

    const requiredTablePrivileges =
      contract.access === 'write' ? 'SELECT,INSERT,UPDATE,DELETE' : 'SELECT';
    const missingSequencePrivilege =
      contract.access === 'write'
        ? `NOT has_sequence_privilege(
          '${contract.role}', oid, 'USAGE,SELECT,UPDATE'
        )`
        : 'FALSE';
    const excessiveOwnPrivilege =
      contract.access === 'read'
        ? `(relkind IN ('r', 'p') AND has_table_privilege(
          '${contract.role}', oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )) OR (relkind = 'S' AND has_sequence_privilege(
          '${contract.role}', oid, 'USAGE,SELECT,UPDATE'
        ))`
        : 'FALSE';
    const verification = await client.query(`WITH role_state AS (
      SELECT oid, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
        rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = '${contract.role}'
    ), owned AS (
      SELECT 1 FROM pg_class c, role_state r WHERE c.relowner = r.oid
      UNION ALL
      SELECT 1 FROM pg_namespace n, role_state r WHERE n.nspowner = r.oid
      UNION ALL
      SELECT 1 FROM pg_database d, role_state r WHERE d.datdba = r.oid
    ), domain_relations AS (
      SELECT c.oid, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${contract.domain}' AND c.relkind IN ('r', 'p', 'S')
    ), foreign_relations AS (
      SELECT c.oid, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('${contract.domain}', 'pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r', 'p', 'S')
    )
    SELECT
      EXISTS (SELECT 1 FROM role_state WHERE NOT (
        rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR
        rolreplication OR rolbypassrls
      )) AS "restrictedRole",
      NOT EXISTS (SELECT 1 FROM pg_auth_members membership, role_state r
        WHERE membership.member = r.oid) AS "noMemberships",
      NOT EXISTS (SELECT 1 FROM owned) AS "noOwnership",
      NOT EXISTS (SELECT 1 FROM domain_relations WHERE
        (relkind IN ('r', 'p') AND NOT has_table_privilege(
          '${contract.role}', oid, '${requiredTablePrivileges}'
        )) OR (relkind = 'S' AND ${missingSequencePrivilege})) AS "ownAccess",
      NOT EXISTS (SELECT 1 FROM domain_relations WHERE
        ${excessiveOwnPrivilege}) AS "leastPrivilege",
      NOT EXISTS (SELECT 1 FROM foreign_relations WHERE
        (relkind IN ('r', 'p') AND (
          has_any_column_privilege('${contract.role}', oid, 'SELECT,INSERT,UPDATE') OR
          has_table_privilege('${contract.role}', oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER')
        )) OR (relkind = 'S' AND has_sequence_privilege(
          '${contract.role}', oid, 'USAGE,SELECT,UPDATE'
        ))) AS "noCrossDomainAccess",
      NOT has_database_privilege('${contract.role}', current_database(), 'CREATE')
        AND NOT has_database_privilege(
          '${contract.role}', current_database(), 'TEMP'
        )
        AND NOT EXISTS (SELECT 1 FROM pg_namespace n
          WHERE has_schema_privilege('${contract.role}', n.oid, 'CREATE')) AS "noDdl"`);
    const checks = verification.rows[0];
    if (
      !checks ||
      [
        'restrictedRole',
        'noMemberships',
        'noOwnership',
        'ownAccess',
        'leastPrivilege',
        'noCrossDomainAccess',
        'noDdl',
      ].some((key) => checks[key] !== true)
    ) {
      throw new Error(
        `${contract.domain} runtime database role verification failed`,
      );
    }

    const relations = await client.query(
      `SELECT count(*)::int AS count
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')`,
      [contract.domain],
    );
    const relationCount = relations.rows[0]?.count;
    if (typeof relationCount !== 'number' || relationCount < 1) {
      throw new Error(`${contract.domain} runtime schema is empty`);
    }

    await client.query('COMMIT');
    return {
      status: 'PASS',
      domain: contract.domain,
      role: contract.role,
      access: contract.access,
      relationCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const contract = independentDomainContract(process.env.DOMAIN_DATABASE_KIND);
  const ownerUrl = process.env.DOMAIN_DATABASE_OWNER_URL;
  const password = process.env[contract.passwordVariable];
  if (!ownerUrl || !password) {
    throw new Error(
      `DOMAIN_DATABASE_OWNER_URL and ${contract.passwordVariable} are required`,
    );
  }
  const parsed = new URL(ownerUrl);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DOMAIN_DATABASE_OWNER_URL must be PostgreSQL');
  }
  if (decodeURIComponent(parsed.username) === contract.role) {
    throw new Error('Database owner must differ from the runtime role');
  }

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await provisionIndependentDomainRuntimeRole(
      client,
      contract,
      password,
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write(
      'Independent domain runtime role provisioning failed\n',
    );
    process.exitCode = 1;
  });
}
