import { Client } from 'pg';
import {
  independentDomainContract,
  provisionIndependentDomainRuntimeRole,
} from '../src/database/provision-independent-domain-runtime-role';
import {
  transferDomainContract,
  transferIndependentDomainData,
  validateTransferDatabaseUrls,
} from '../src/database/transfer-independent-domain-data';

interface DatabaseFixture {
  domain: 'notify' | 'experience' | 'identity';
  sourceUrlVariable: string;
  targetUrlVariable: string;
  password: string;
}

const fixtures: DatabaseFixture[] = [
  {
    domain: 'notify',
    sourceUrlVariable: 'NOTIFY_TRANSFER_SOURCE_DATABASE_URL',
    targetUrlVariable: 'NOTIFY_TRANSFER_TARGET_DATABASE_URL',
    password: 'notify_runtime_ci_password_2026_09_10',
  },
  {
    domain: 'experience',
    sourceUrlVariable: 'EXPERIENCE_TRANSFER_SOURCE_DATABASE_URL',
    targetUrlVariable: 'EXPERIENCE_TRANSFER_TARGET_DATABASE_URL',
    password: 'experience_runtime_ci_password_2026_09_10',
  },
  {
    domain: 'identity',
    sourceUrlVariable: 'IDENTITY_TRANSFER_SOURCE_DATABASE_URL',
    targetUrlVariable: 'IDENTITY_TRANSFER_TARGET_DATABASE_URL',
    password: 'identity_runtime_ci_password_2026_09_10',
  },
];

function runtimeUrl(ownerUrl: string, role: string, password: string): string {
  const parsed = new URL(ownerUrl);
  parsed.username = role;
  parsed.password = password;
  return parsed.toString();
}

async function truncateDomain(
  client: Client,
  domain: 'notify' | 'experience' | 'identity',
) {
  const contract = transferDomainContract(domain);
  const relations = contract.tables
    .map((table) => `"${domain}"."${table}"`)
    .join(', ');
  await client.query(`TRUNCATE TABLE ${relations} CASCADE`);
}

async function seedSource(
  client: Client,
  domain: 'notify' | 'experience' | 'identity',
) {
  if (domain === 'notify') {
    await client.query(`INSERT INTO "notify"."notifications"
      ("id", "recipientId", "category", "action", "title", "body", "dedupeKey")
      VALUES ('ci-notify-1', 'stable-user-reference', 'SYSTEM', 'OPEN',
        'encrypted-or-approved-title', NULL, 'ci-notify-dedupe-1')`);
    return;
  }
  if (domain === 'experience') {
    await client.query(`INSERT INTO "experience"."contact_messages"
      ("id", "name", "phone", "subject", "body")
      VALUES ('ci-experience-1', 'encrypted-name', 'encrypted-phone',
        'approved-subject', 'approved-body')`);
    return;
  }
  await client.query(`INSERT INTO "identity"."users"
    ("id", "role", "fullName", "updatedAt", "createdById") VALUES
    ('z-ci-identity-owner', 'IT_MANAGER', 'encrypted-owner', now(), NULL),
    ('a-ci-identity-user', 'USER', 'encrypted-user', now(),
      'z-ci-identity-owner')`);
  await client.query(`INSERT INTO "identity"."refresh_tokens"
    ("id", "userId", "tokenHash", "expiresAt")
    VALUES ('ci-refresh-1', 'a-ci-identity-user',
      'non-secret-test-hash', now() + interval '1 hour')`);
}

async function proveOwnDml(
  client: Client,
  domain: 'notify' | 'experience' | 'identity',
) {
  if (domain === 'notify') {
    await client.query(`INSERT INTO "notify"."notifications"
      ("id", "recipientId", "category", "action", "title")
      VALUES ('runtime-probe', 'stable-user-reference', 'SYSTEM', 'OPEN', 'probe')`);
    await client.query(
      `DELETE FROM "notify"."notifications" WHERE "id" = 'runtime-probe'`,
    );
    return;
  }
  if (domain === 'experience') {
    await client.query(`INSERT INTO "experience"."contact_messages"
      ("id", "name", "phone", "subject", "body")
      VALUES ('runtime-probe', 'encrypted', 'encrypted', 'probe', 'probe')`);
    await client.query(
      `DELETE FROM "experience"."contact_messages" WHERE "id" = 'runtime-probe'`,
    );
    return;
  }
  await client.query(`INSERT INTO "identity"."users"
    ("id", "role", "fullName", "updatedAt")
    VALUES ('runtime-probe', 'USER', 'encrypted', now())`);
  await client.query(
    `DELETE FROM "identity"."users" WHERE "id" = 'runtime-probe'`,
  );
}

describe.each(fixtures)('$domain independent database boundary', (fixture) => {
  const sourceUrl = process.env[fixture.sourceUrlVariable];
  const targetUrl = process.env[fixture.targetUrlVariable];
  const enabled = Boolean(sourceUrl && targetUrl);
  const testDatabase = enabled ? it : it.skip;

  testDatabase(
    'transfers once with exact parity and forbids cross-domain access',
    async () => {
      if (!sourceUrl || !targetUrl) throw new Error('test URLs are required');
      validateTransferDatabaseUrls(sourceUrl, targetUrl);
      const source = new Client({ connectionString: sourceUrl });
      const target = new Client({ connectionString: targetUrl });
      await Promise.all([source.connect(), target.connect()]);
      try {
        await truncateDomain(source, fixture.domain);
        await truncateDomain(target, fixture.domain);
        await target.query('DROP SCHEMA IF EXISTS core_probe CASCADE');
        await target.query('CREATE SCHEMA core_probe');
        await target.query(
          'CREATE TABLE core_probe.protected_rows (id text PRIMARY KEY)',
        );
        await seedSource(source, fixture.domain);

        const roleContract = independentDomainContract(fixture.domain);
        const provisioned = await provisionIndependentDomainRuntimeRole(
          target,
          roleContract,
          fixture.password,
        );
        expect(provisioned.relationCount).toBe(
          transferDomainContract(fixture.domain).tables.length,
        );

        const runtime = new Client({
          connectionString: runtimeUrl(
            targetUrl,
            roleContract.role,
            fixture.password,
          ),
        });
        await runtime.connect();
        try {
          await expect(
            proveOwnDml(runtime, fixture.domain),
          ).resolves.toBeUndefined();
          await expect(
            runtime.query(
              `CREATE TABLE "${fixture.domain}"."forbidden_ddl" (id text)`,
            ),
          ).rejects.toThrow();
          await expect(
            runtime.query('SELECT * FROM core_probe.protected_rows'),
          ).rejects.toThrow();
          await expect(
            runtime.query(
              `INSERT INTO core_probe.protected_rows (id) VALUES ('forbidden')`,
            ),
          ).rejects.toThrow();
        } finally {
          await runtime.end();
        }

        const contract = transferDomainContract(fixture.domain);
        const transferred = await transferIndependentDomainData({
          source,
          target,
          contract,
          apply: true,
          backupReference: `ci/${fixture.domain}-backup-proof.dump`,
          batchSize: 25,
        });
        expect(transferred.status).toBe('MATCH');
        expect(transferred.tables).toHaveLength(contract.tables.length);

        const reconciled = await transferIndependentDomainData({
          source,
          target,
          contract,
          apply: false,
          batchSize: 25,
        });
        expect(reconciled.status).toBe('MATCH');

        await expect(
          transferIndependentDomainData({
            source,
            target,
            contract,
            apply: true,
            backupReference: `ci/${fixture.domain}-backup-proof.dump`,
            batchSize: 25,
          }),
        ).rejects.toThrow('target must be empty');
      } finally {
        await Promise.allSettled([source.end(), target.end()]);
      }
    },
  );
});
