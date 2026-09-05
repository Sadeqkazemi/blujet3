import 'reflect-metadata';
import { isDeepStrictEqual } from 'node:util';
import { DataSource } from '../../../backend/node_modules/typeorm';
import { dataSourceOptions } from '../../../backend/dist/database/data-source.options';
import { ClubTierRule } from '../../../backend/dist/database/entities/club-tier-rule.entity';
import { User } from '../../../backend/dist/database/entities/user.entity';
import { ClubService } from '../../../backend/dist/modules/club/club.service';
import { LoyaltyTierRulesClient } from '../../../backend/dist/modules/club/loyalty-tier-rules.client';

async function run() {
  const url = new URL(process.env.CORE_TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test'))
    throw new Error('Test database required');
  if (dataSourceOptions.type !== 'postgres')
    throw new Error('PostgreSQL required');
  const db = await new DataSource({
    ...dataSourceOptions,
    url: url.toString(),
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: {
      max: 2,
      connectionTimeoutMillis: 2000,
      statement_timeout: 2000,
      options: '-c default_transaction_read_only=on -c timezone=UTC',
    },
  }).initialize();
  let calls = 0;
  let remoteResults = 0;
  let warnings = 0;
  const values: Record<string, string | undefined> = {
    LOYALTY_TIER_RULES_READ_ENABLED: 'false',
    LOYALTY_SERVICE_URL: process.env.PROBE_SERVICE_URL,
    LOYALTY_INTERNAL_TOKEN: process.env.PROBE_INTERNAL_TOKEN,
  };
  const client = new LoyaltyTierRulesClient(
    { get: (key: string) => values[key] } as never,
    {
      warn: () => {
        warnings += 1;
      },
    } as never,
  );
  const service = new ClubService(
    db.getRepository(ClubTierRule),
    undefined as never,
    undefined as never,
    db.getRepository(User),
    undefined as never,
    undefined as never,
    {
      get: async (requestId?: string) => {
        const result = await client.get(requestId);
        if (result !== undefined) remoteResults += 1;
        return result;
      },
    } as never,
    undefined as never,
  );
  const originalFetch = globalThis.fetch;
  try {
    const local: unknown = JSON.parse(
      JSON.stringify(await service.getTierRules()),
    );
    values.LOYALTY_TIER_RULES_READ_ENABLED =
      process.env.PROBE_ENABLED ?? 'true';
    globalThis.fetch = (...args: Parameters<typeof fetch>) => {
      calls += 1;
      return originalFetch(...args);
    };
    try {
      const cutover: unknown = JSON.parse(
        JSON.stringify(await service.getTierRules('tier-rules-contract')),
      );
      const expected: unknown = JSON.parse(
        process.env.PROBE_EXPECTED ?? 'null',
      );
      process.stdout.write(
        JSON.stringify({
          status:
            isDeepStrictEqual(local, cutover) &&
            isDeepStrictEqual(cutover, expected)
              ? 'MATCH'
              : 'MISMATCH',
          calls,
          remoteResults,
          warnings,
        }) + '\n',
      );
    } catch {
      process.stdout.write(
        JSON.stringify({
          status: 'REJECTED',
          calls,
          remoteResults,
          warnings,
        }) + '\n',
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    await db.destroy();
  }
}

void run().catch(() => {
  process.stderr.write('Core tier-rules probe unavailable.\n');
  process.exitCode = 1;
});
