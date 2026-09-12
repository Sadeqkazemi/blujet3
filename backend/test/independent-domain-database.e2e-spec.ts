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
  domain: 'notify' | 'experience' | 'identity' | 'loyalty';
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
  {
    domain: 'loyalty',
    sourceUrlVariable: 'LOYALTY_TRANSFER_SOURCE_DATABASE_URL',
    targetUrlVariable: 'LOYALTY_TRANSFER_TARGET_DATABASE_URL',
    password: 'loyalty_runtime_ci_password_2026_09_10',
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
  domain: 'notify' | 'experience' | 'identity' | 'loyalty',
) {
  const contract = transferDomainContract(domain);
  const relations = contract.tables
    .map((table) => `"${domain}"."${table}"`)
    .join(', ');
  await client.query(`TRUNCATE TABLE ${relations} CASCADE`);
}

async function prepareSourceSchema(
  client: Client,
  domain: 'notify' | 'experience' | 'identity' | 'loyalty',
): Promise<void> {
  if (domain !== 'loyalty') return;
  await client.query('DROP TABLE "loyalty"."loyalty_projection_slots"');
  await client.query(
    'DROP TABLE "loyalty"."loyalty_projection_event_receipts"',
  );
  // Core added this field after table creation, unlike a fresh Loyalty DB.
  await client.query(
    'ALTER TABLE "loyalty"."price_locks" DROP COLUMN "feeCharged"',
  );
  await client.query(
    'ALTER TABLE "loyalty"."price_locks" ADD COLUMN "feeCharged" boolean NOT NULL DEFAULT false',
  );
}

async function seedSource(
  client: Client,
  domain: 'notify' | 'experience' | 'identity' | 'loyalty',
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
  if (domain === 'loyalty') {
    await client.query(`INSERT INTO "loyalty"."club_members"
      ("id", "userId", "fullName", "email", "nationalIdEnc", "nationalIdHash", "points")
      VALUES ('ci-loyalty-member-1', 'stable-user-reference', 'encrypted-name',
        'encrypted-email', 'encrypted-national-id', 'stable-national-id-hash', 30)`);
    await client.query(`INSERT INTO "loyalty"."club_points_entries"
      ("id", "clubMemberId", "type", "signedPoints", "bookingId")
      VALUES ('ci-loyalty-points-1', 'ci-loyalty-member-1', 'EARN', 30,
        'stable-booking-reference')`);
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

async function proveOwnRead(
  client: Client,
  domain: 'notify' | 'experience' | 'identity' | 'loyalty',
): Promise<void> {
  const firstTable = transferDomainContract(domain).tables[0];
  await client.query(`SELECT 1 FROM "${domain}"."${firstTable}" LIMIT 1`);
}

async function attemptLoyaltyDml(client: Client): Promise<void> {
  await client.query(`UPDATE "loyalty"."club_members"
    SET "points" = "points" WHERE false`);
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
        await prepareSourceSchema(source, fixture.domain);
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
        const transferContract = transferDomainContract(fixture.domain);
        expect(provisioned.relationCount).toBe(
          transferContract.tables.length +
            (transferContract.targetControlTables?.length ?? 0),
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
            proveOwnRead(runtime, fixture.domain),
          ).resolves.toBeUndefined();
          if (fixture.domain === 'loyalty') {
            await expect(attemptLoyaltyDml(runtime)).rejects.toThrow();
          } else {
            await expect(
              proveOwnDml(runtime, fixture.domain),
            ).resolves.toBeUndefined();
          }
          await expect(
            runtime.query(
              `CREATE TABLE "${fixture.domain}"."forbidden_ddl" (id text)`,
            ),
          ).rejects.toThrow();
          await expect(
            runtime.query('CREATE TEMP TABLE forbidden_temp (id text)'),
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
